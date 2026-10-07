"use server";

import {
  calculateAmount,
  includedSeatsFromFlags,
  packageDbFlags,
  seatColumns,
  type AmountBreakdown,
  type AddonRow,
  type ModulePriceRow,
  type PackageRow,
} from "@/lib/pricing";
import {
  billingForTenant,
  catalogMonthlyPrice,
  effectiveStatus,
  revenueByMonth,
  scoreUsage,
  USAGE_WINDOW_DAYS,
  type ProofLike,
  type RevenueMonth,
  type TenantBilling,
  type TenantUsage,
} from "@/lib/platform-metrics";
import { fetchAllRows, requirePlatformAdmin, type AdminClient } from "@/lib/platform-admin";
import { ensureOrgPublicSlug } from "@/lib/org-slug";
import { createClient } from "@/lib/supabase/server";
import type { AppModule, SubStatus } from "@/lib/tenant";

const TRIAL_DAYS = Number(process.env.NEXT_PUBLIC_TRIAL_DAYS || 14);

function generatePassword() {
  const chunk = () => Math.random().toString(36).slice(2, 8);
  return `Ar${chunk()}${chunk()}!`.slice(0, 14);
}

/** Prefer explicit endsAt ISO; otherwise add days/months from `from` (default now). */
function resolveAccessEnd(input: {
  endsAt?: string | null;
  addDays?: number;
  addMonths?: number;
  from?: Date | null;
  requireFuture?: boolean;
}): { end: Date } | { error: string } {
  if (input.endsAt?.trim()) {
    const end = new Date(input.endsAt);
    if (Number.isNaN(end.getTime())) return { error: "Invalid end date" };
    if (input.requireFuture !== false && end.getTime() <= Date.now()) {
      return { error: "End date must be in the future" };
    }
    return { end };
  }
  const days = Math.max(0, Math.floor(input.addDays ?? 0));
  const months = Math.max(0, Math.floor(input.addMonths ?? 0));
  if (days <= 0 && months <= 0) {
    return { error: "Provide an end date, or add at least 1 day/month" };
  }
  const end = input.from ? new Date(input.from) : new Date();
  if (months > 0) end.setMonth(end.getMonth() + months);
  if (days > 0) end.setDate(end.getDate() + days);
  return { end };
}

function followUpPatch(input: {
  followUpAt?: string | null;
  followUpNote?: string | null;
  clearFollowUp?: boolean;
}) {
  if (input.clearFollowUp) {
    return { follow_up_at: null, follow_up_note: null };
  }
  if (input.followUpAt === undefined && input.followUpNote === undefined) {
    return {};
  }
  const patch: Record<string, unknown> = {};
  if (input.followUpAt !== undefined) {
    if (input.followUpAt === null || input.followUpAt === "") {
      patch.follow_up_at = null;
    } else {
      const d = new Date(input.followUpAt);
      if (Number.isNaN(d.getTime())) return { error: "Invalid follow-up time" as const };
      patch.follow_up_at = d.toISOString();
    }
  }
  if (input.followUpNote !== undefined) {
    patch.follow_up_note = input.followUpNote?.trim() || null;
  }
  return patch;
}

export type ApplicationRow = Record<string, unknown>;

export type ModuleToggleInput = {
  menuEnabled?: boolean;
  orderingEnabled?: boolean;
  kitchenEnabled?: boolean;
  inventoryEnabled?: boolean;
  financeEnabled?: boolean;
  hrEnabled?: boolean;
  onlineEnabled?: boolean;
  extraStaffSeats?: number;
};

export type PlatformTenantRow = {
  organization: Record<string, unknown>;
  subscription: Record<string, unknown> | null;
  owner: {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
  } | null;
  ownerAuthEmail: string | null;
  ownerLastSignInAt: string | null;
  billing: TenantBilling;
};

async function loadCatalog(admin: AdminClient) {
  const [{ data: packages }, { data: modulePrices }] = await Promise.all([
    admin.from("subscription_packages").select("*"),
    admin.from("subscription_module_prices").select("*").eq("active", true),
  ]);
  return {
    packages: (packages || []) as PackageRow[],
    modulePrices: (modulePrices || []) as ModulePriceRow[],
  };
}

function resolveModuleFlags(
  input: ModuleToggleInput,
  fallback?: Record<string, unknown> | null,
) {
  const inv = Boolean(fallback?.inventory_enabled ?? true);
  const ordering =
    input.orderingEnabled ?? Boolean(fallback?.ordering_enabled ?? inv);
  return {
    menu_enabled: input.menuEnabled ?? Boolean(fallback?.menu_enabled ?? inv),
    ordering_enabled: ordering,
    kitchen_enabled:
      input.kitchenEnabled ??
      Boolean(fallback?.kitchen_enabled ?? ordering),
    inventory_enabled: input.inventoryEnabled ?? inv,
    finance_enabled:
      input.financeEnabled ?? Boolean(fallback?.finance_enabled ?? true),
    hr_enabled: input.hrEnabled ?? Boolean(fallback?.hr_enabled ?? true),
    online_enabled:
      input.onlineEnabled ?? Boolean(fallback?.online_enabled ?? false),
  };
}

function toggleMapFromDb(flags: {
  menu_enabled: boolean;
  ordering_enabled: boolean;
  kitchen_enabled: boolean;
  inventory_enabled: boolean;
  finance_enabled: boolean;
  hr_enabled: boolean;
  online_enabled?: boolean;
}) {
  return {
    menu: flags.menu_enabled,
    ordering: flags.ordering_enabled,
    kitchen: flags.kitchen_enabled,
    inventory: flags.inventory_enabled,
    finance: flags.finance_enabled,
    hr: flags.hr_enabled,
    online: Boolean(flags.online_enabled),
  };
}

function seatPatch(
  flags: {
    menu_enabled: boolean;
    ordering_enabled: boolean;
    kitchen_enabled: boolean;
    inventory_enabled: boolean;
    finance_enabled: boolean;
    hr_enabled: boolean;
    online_enabled?: boolean;
  },
  extraSeats = 0,
) {
  const seats = seatColumns(toggleMapFromDb(flags), extraSeats);
  return {
    extra_staff_seats: seats.extra_staff_seats,
    max_staff_seats: seats.max_staff_seats,
  };
}

async function ensureOnlineSlug(
  admin: AdminClient,
  orgId: string,
  onlineEnabled: boolean,
) {
  if (!onlineEnabled) return;
  const { data: org } = await admin
    .from("organizations")
    .select("name, public_slug")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return;
  await ensureOrgPublicSlug(
    admin,
    orgId,
    String(org.name),
    (org.public_slug as string | null) ?? null,
  );
}

/** Apply proof module columns when any are non-null; otherwise leave sub flags alone. */
function modulePatchFromProof(proof: Record<string, unknown>) {
  const keys = [
    "menu_enabled",
    "ordering_enabled",
    "kitchen_enabled",
    "inventory_enabled",
    "finance_enabled",
    "hr_enabled",
    "online_enabled",
  ] as const;
  const hasAny = keys.some((k) => proof[k] !== null && proof[k] !== undefined);
  if (!hasAny) return {};
  const patch: Record<string, boolean> = {};
  for (const k of keys) {
    if (proof[k] !== null && proof[k] !== undefined) {
      patch[k] = Boolean(proof[k]);
    }
  }
  return patch;
}

export async function listApplicationsAction() {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { data, error } = await gate.admin
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { error: error.message };
  return { applications: (data || []) as ApplicationRow[] };
}

export async function listPlatformTenantsAction(): Promise<
  { tenants: PlatformTenantRow[] } | { error: string }
> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin } = gate;

  const { data: orgs, error } = await admin
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { error: error.message };
  if (!orgs?.length) return { tenants: [] };

  const orgIds = orgs.map((o) => o.id as string);

  const [{ data: subs }, { data: memberships }, approved, catalog] =
    await Promise.all([
      admin.from("subscriptions").select("*").in("organization_id", orgIds),
      admin
        .from("memberships")
        .select("user_id, role, organization_id")
        .in("organization_id", orgIds)
        .eq("role", "owner"),
      fetchAllRows<ProofLike>((from, to) =>
        admin
          .from("payment_proofs")
          .select(
            "organization_id, amount, status, months_requested, reviewed_at, created_at",
          )
          .eq("status", "approved")
          .range(from, to),
      ),
      loadCatalog(admin),
    ]);

  const approvedByOrg = new Map<string, ProofLike[]>();
  for (const p of approved.rows) {
    const id = String(p.organization_id);
    const list = approvedByOrg.get(id);
    if (list) list.push(p);
    else approvedByOrg.set(id, [p]);
  }

  const subByOrg = new Map(
    (subs || []).map((s) => [s.organization_id as string, s]),
  );
  const ownerIdByOrg = new Map(
    (memberships || []).map((m) => [
      m.organization_id as string,
      m.user_id as string,
    ]),
  );
  const ownerIds = [...new Set([...ownerIdByOrg.values()])];

  const profilesById = new Map<
    string,
    { id: string; full_name: string; phone: string | null; email: string | null }
  >();
  if (ownerIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, phone, email")
      .in("id", ownerIds);
    for (const p of profiles || []) {
      profilesById.set(p.id as string, p as {
        id: string;
        full_name: string;
        phone: string | null;
        email: string | null;
      });
    }
  }

  const authById = new Map<
    string,
    { email: string | null; lastSignInAt: string | null }
  >();
  await Promise.all(
    ownerIds.map(async (uid) => {
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(uid);
        authById.set(uid, {
          email: authUser.user?.email ?? null,
          lastSignInAt: authUser.user?.last_sign_in_at ?? null,
        });
      } catch {
        authById.set(uid, { email: null, lastSignInAt: null });
      }
    }),
  );

  const tenants: PlatformTenantRow[] = orgs.map((org) => {
    const orgId = org.id as string;
    const ownerId = ownerIdByOrg.get(orgId);
    const owner = ownerId ? profilesById.get(ownerId) ?? null : null;
    const auth = ownerId ? authById.get(ownerId) : undefined;
    const subscription = subByOrg.get(orgId) ?? null;
    return {
      organization: org,
      subscription,
      owner,
      ownerAuthEmail: auth?.email ?? null,
      ownerLastSignInAt: auth?.lastSignInAt ?? null,
      billing: billingForTenant(
        subscription,
        approvedByOrg.get(orgId) || [],
        catalog.packages,
        catalog.modulePrices,
      ),
    };
  });

  return { tenants };
}

/** Approve onboarded org: start trial. Owner keeps the password they set at signup. */
export async function approveOrganizationAction(input: {
  organizationId: string;
  trialDays?: number;
  trialMonths?: number;
  /** Explicit trial end (ISO). Wins over days/months when set. */
  trialEndsAt?: string | null;
  menuEnabled?: boolean;
  orderingEnabled?: boolean;
  kitchenEnabled?: boolean;
  inventoryEnabled?: boolean;
  financeEnabled?: boolean;
  hrEnabled?: boolean;
  onlineEnabled?: boolean;
  extraStaffSeats?: number;
  packageCode?: string | null;
  adminNotes?: string;
  followUpAt?: string | null;
  followUpNote?: string | null;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin, user } = gate;

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("*")
    .eq("id", input.organizationId)
    .single();
  if (orgErr || !org) return { error: orgErr?.message || "Organization not found" };

  const { data: membership } = await admin
    .from("memberships")
    .select("user_id")
    .eq("organization_id", input.organizationId)
    .eq("role", "owner")
    .maybeSingle();
  if (!membership?.user_id) return { error: "Owner account not found" };

  // Confirm email only — do NOT overwrite the password they chose at signup.
  const { data: authUser, error: confirmErr } =
    await admin.auth.admin.updateUserById(membership.user_id, {
      email_confirm: true,
    });
  if (confirmErr) return { error: confirmErr.message };

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  const endRes = resolveAccessEnd({
    endsAt: input.trialEndsAt,
    addDays:
      input.trialMonths && input.trialMonths > 0
        ? 0
        : (input.trialDays ?? TRIAL_DAYS),
    addMonths:
      input.trialMonths && input.trialMonths > 0 ? input.trialMonths : 0,
  });
  if ("error" in endRes) return { error: endRes.error };
  const trialEnds = endRes.end;

  const fu = followUpPatch({
    followUpAt: input.followUpAt,
    followUpNote: input.followUpNote,
  });
  if ("error" in fu) return { error: fu.error };

  let flags = resolveModuleFlags(input, sub);
  let planCode = (sub?.plan_code as string) || "starter";
  if (input.packageCode) {
    const { data: pkg } = await admin
      .from("subscription_packages")
      .select("*")
      .eq("code", input.packageCode)
      .maybeSingle();
    if (pkg) {
      flags = packageDbFlags(pkg as PackageRow);
      planCode = pkg.code;
    }
  }
  const seats = seatPatch(
    flags,
    input.extraStaffSeats ?? Number(sub?.extra_staff_seats ?? 0),
  );

  const { error: updOrg } = await admin
    .from("organizations")
    .update({
      verification_status: "approved",
      verified_at: new Date().toISOString(),
      verified_by: user.id,
      admin_notes: input.adminNotes || "Approved — trial started",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.organizationId);
  if (updOrg) return { error: updOrg.message };

  const { error: updSub } = await admin
    .from("subscriptions")
    .update({
      status: "trialing",
      ...flags,
      trial_ends_at: trialEnds.toISOString(),
      plan_code: planCode,
      package_code: input.packageCode || planCode,
      ...seats,
      ...fu,
      notes:
        input.adminNotes ||
        `Trial started · ends ${trialEnds.toISOString().slice(0, 10)}`,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId);
  if (updSub) return { error: updSub.message };

  await ensureOnlineSlug(
    admin,
    input.organizationId,
    Boolean(flags.online_enabled),
  );

  const email =
    authUser.user.email ||
    (org.email as string) ||
    null;

  return {
    ok: true as const,
    organizationId: input.organizationId,
    trialEndsAt: trialEnds.toISOString(),
    email,
    /** Password unchanged — owner uses the one from signup. */
    password: null as string | null,
  };
}

export async function rejectOrganizationAction(input: {
  organizationId: string;
  adminNotes?: string;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { error } = await gate.admin
    .from("organizations")
    .update({
      verification_status: "rejected",
      admin_notes: input.adminNotes || "Rejected",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.organizationId);
  if (error) return { error: error.message };

  await gate.admin
    .from("subscriptions")
    .update({
      status: "canceled",
      notes: input.adminNotes || "Rejected",
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId);

  return { ok: true as const };
}

/**
 * Approve a passwordless interest application: create auth user + org +
 * subscription (trialing), issue a one-time password for the admin to send.
 */
export async function approveApplicationAction(input: {
  applicationId: string;
  packageCode?: string;
  menuEnabled?: boolean;
  orderingEnabled?: boolean;
  kitchenEnabled?: boolean;
  inventoryEnabled?: boolean;
  financeEnabled?: boolean;
  hrEnabled?: boolean;
  onlineEnabled?: boolean;
  trialDays?: number;
  trialMonths?: number;
  trialEndsAt?: string | null;
  followUpAt?: string | null;
  followUpNote?: string | null;
  extraStaffSeats?: number;
  adminNotes?: string;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin, user } = gate;

  const { data: app, error: appErr } = await admin
    .from("applications")
    .select("*")
    .eq("id", input.applicationId)
    .single();
  if (appErr || !app) {
    return { error: appErr?.message || "Application not found" };
  }
  if (app.status === "approved") {
    return { error: "Already approved", email: app.email as string };
  }
  if (app.status === "rejected") {
    return { error: "This application was rejected." };
  }

  const email = String(app.email).toLowerCase();
  const fullName = String(app.full_name || "").trim() || email.split("@")[0];
  const phone = String(app.phone || "").trim() || null;
  const businessName =
    String(app.company_name || "").trim() || `${fullName}'s business`;

  const endRes = resolveAccessEnd({
    endsAt: input.trialEndsAt,
    addDays:
      input.trialMonths && input.trialMonths > 0
        ? 0
        : (input.trialDays ?? TRIAL_DAYS),
    addMonths:
      input.trialMonths && input.trialMonths > 0 ? input.trialMonths : 0,
  });
  if ("error" in endRes) return { error: endRes.error };
  const trialEnds = endRes.end;

  const fu = followUpPatch({
    followUpAt: input.followUpAt,
    followUpNote: input.followUpNote,
  });
  if ("error" in fu) return { error: fu.error };

  const packageCode =
    input.packageCode?.trim() ||
    (app.package_code as string | null) ||
    null;

  let flags = resolveModuleFlags(
    {
      menuEnabled: input.menuEnabled ?? Boolean(app.menu_wanted),
      orderingEnabled: input.orderingEnabled ?? Boolean(app.ordering_wanted),
      kitchenEnabled: input.kitchenEnabled ?? Boolean(app.kitchen_wanted),
      inventoryEnabled:
        input.inventoryEnabled ?? Boolean(app.inventory_wanted),
      financeEnabled: input.financeEnabled ?? Boolean(app.finance_wanted),
      hrEnabled: input.hrEnabled ?? Boolean(app.hr_wanted),
      onlineEnabled: input.onlineEnabled ?? Boolean(app.online_wanted),
    },
    null,
  );
  let planCode = packageCode || "starter";
  if (packageCode) {
    const { data: pkg } = await admin
      .from("subscription_packages")
      .select("*")
      .eq("code", packageCode)
      .maybeSingle();
    if (pkg) {
      // Admin module toggles win when explicitly provided; else package.
      const anyExplicit =
        input.menuEnabled !== undefined ||
        input.orderingEnabled !== undefined ||
        input.kitchenEnabled !== undefined ||
        input.inventoryEnabled !== undefined ||
        input.financeEnabled !== undefined ||
        input.hrEnabled !== undefined ||
        input.onlineEnabled !== undefined;
      if (!anyExplicit) {
        flags = packageDbFlags(pkg as PackageRow);
      }
      planCode = pkg.code;
    }
  }
  const seats = seatPatch(flags, input.extraStaffSeats ?? 0);

  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = listed.users.find((u) => u.email?.toLowerCase() === email);

  if (existing) {
    const { data: membership } = await admin
      .from("memberships")
      .select("organization_id")
      .eq("user_id", existing.id)
      .eq("role", "owner")
      .maybeSingle();

    if (membership?.organization_id) {
      const password = generatePassword();
      const { error: pwErr } = await admin.auth.admin.updateUserById(
        existing.id,
        { password, email_confirm: true },
      );
      if (pwErr) return { error: pwErr.message };

      const res = await approveOrganizationAction({
        organizationId: membership.organization_id,
        trialDays: input.trialDays,
        trialMonths: input.trialMonths,
        trialEndsAt: input.trialEndsAt,
        packageCode: packageCode || undefined,
        menuEnabled: flags.menu_enabled,
        orderingEnabled: flags.ordering_enabled,
        kitchenEnabled: flags.kitchen_enabled,
        inventoryEnabled: flags.inventory_enabled,
        financeEnabled: flags.finance_enabled,
        hrEnabled: flags.hr_enabled,
        onlineEnabled: flags.online_enabled,
        extraStaffSeats: input.extraStaffSeats,
        followUpAt: input.followUpAt,
        followUpNote: input.followUpNote,
        adminNotes: input.adminNotes,
      });
      if ("error" in res) return res;

      await admin
        .from("applications")
        .update({
          status: "approved",
          organization_id: membership.organization_id,
          generated_password: null,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          admin_notes:
            input.adminNotes || "Approved — linked existing account",
          updated_at: new Date().toISOString(),
        })
        .eq("id", app.id);

      return {
        ok: true as const,
        email,
        password,
        organizationId: membership.organization_id,
        trialEndsAt: res.trialEndsAt,
        packageCode: planCode,
      };
    }
  }

  const password = generatePassword();
  let userId = existing?.id as string | undefined;

  if (!userId) {
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone,
        },
      });
    if (createErr || !created.user) {
      return { error: createErr?.message || "Could not create login." };
    }
    userId = created.user.id;
  } else {
    const { error: pwErr } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone },
    });
    if (pwErr) return { error: pwErr.message };
  }

  await admin.from("profiles").upsert({
    id: userId,
    full_name: fullName,
    phone,
    email,
    updated_at: new Date().toISOString(),
  });

  const orgType =
    app.org_type === "restaurant" || app.org_type === "other"
      ? app.org_type
      : "cafe";

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: businessName,
      org_type: orgType,
      phone,
      email,
      address: (app.address as string) || null,
      city: (app.city as string) || null,
      region: (app.region as string) || null,
      country: (app.country as string) || "Ethiopia",
      tin: (app.tin as string) || null,
      vat_number: (app.vat_number as string) || null,
      website: (app.website as string) || null,
      business_license_url: (app.business_license_url as string) || null,
      id_document_url: (app.id_document_url as string) || null,
      verification_status: "approved",
      verified_at: new Date().toISOString(),
      verified_by: user.id,
      admin_notes: input.adminNotes || "Approved from interest application",
      created_by: userId,
    })
    .select("id")
    .single();

  if (orgErr || !org) {
    if (!existing) await admin.auth.admin.deleteUser(userId);
    return { error: orgErr?.message || "Could not create organization." };
  }

  const orgId = org.id as string;

  // Copy application logo into org-logos/{orgId}/logo.webp when present
  let logoUrl: string | null = null;
  const appLogoPath = `applications/${app.id}/logo.webp`;
  const { data: logoBlob, error: logoDlErr } = await admin.storage
    .from("org-logos")
    .download(appLogoPath);
  if (!logoDlErr && logoBlob) {
    const buf = Buffer.from(await logoBlob.arrayBuffer());
    const dest = `${orgId}/logo.webp`;
    const { error: logoUpErr } = await admin.storage
      .from("org-logos")
      .upload(dest, buf, { contentType: "image/webp", upsert: true });
    if (!logoUpErr) {
      const { data: pub } = admin.storage.from("org-logos").getPublicUrl(dest);
      logoUrl = `${pub.publicUrl}?v=${Date.now()}`;
    }
  } else if (app.logo_url) {
    logoUrl = String(app.logo_url);
  }
  if (logoUrl) {
    await admin
      .from("organizations")
      .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
      .eq("id", orgId);
  }

  const { error: memErr } = await admin.from("memberships").insert({
    organization_id: orgId,
    user_id: userId,
    role: "owner",
    active: true,
  });
  if (memErr) {
    await admin.from("organizations").delete().eq("id", orgId);
    if (!existing) await admin.auth.admin.deleteUser(userId);
    return { error: memErr.message };
  }

  const { error: subErr } = await admin.from("subscriptions").insert({
    organization_id: orgId,
    status: "trialing",
    ...flags,
    trial_ends_at: trialEnds.toISOString(),
    plan_code: planCode,
    package_code: packageCode || planCode,
    ...seats,
    ...fu,
    notes:
      input.adminNotes ||
      `Trial from interest · ends ${trialEnds.toISOString().slice(0, 10)}`,
  });
  if (subErr) {
    await admin.from("memberships").delete().eq("organization_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
    if (!existing) await admin.auth.admin.deleteUser(userId);
    return { error: subErr.message };
  }

  await admin.from("org_meta").upsert({
    organization_id: orgId,
    receipt_seq: 0,
    seeded: false,
  });

  await ensureOnlineSlug(admin, orgId, Boolean(flags.online_enabled));

  await admin
    .from("applications")
    .update({
      status: "approved",
      organization_id: orgId,
      generated_password: null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      admin_notes: input.adminNotes || "Approved — credentials issued",
      updated_at: new Date().toISOString(),
    })
    .eq("id", app.id);

  return {
    ok: true as const,
    email,
    password,
    organizationId: orgId,
    trialEndsAt: trialEnds.toISOString(),
    packageCode: planCode,
  };
}

export async function rejectApplicationAction(input: {
  applicationId: string;
  adminNotes?: string;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { error } = await gate.admin
    .from("applications")
    .update({
      status: "rejected",
      reviewed_by: gate.user.id,
      reviewed_at: new Date().toISOString(),
      admin_notes: input.adminNotes || "Rejected",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.applicationId);
  if (error) return { error: error.message };
  return { ok: true as const };
}

export async function updateTenantSubscriptionAction(input: {
  organizationId: string;
  status: SubStatus;
  menuEnabled: boolean;
  orderingEnabled: boolean;
  kitchenEnabled: boolean;
  inventoryEnabled: boolean;
  financeEnabled: boolean;
  hrEnabled: boolean;
  onlineEnabled?: boolean;
  trialDays?: number;
  periodMonths?: number;
  extraStaffSeats?: number;
  notes?: string;
  /** Leave trial and paid end dates as they are. */
  keepDates?: boolean;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin, user } = gate;

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  const flags = resolveModuleFlags(input, sub);
  const seats = seatPatch(
    flags,
    input.extraStaffSeats ?? Number(sub?.extra_staff_seats ?? 0),
  );

  const patch: Record<string, unknown> = {
    status: input.status,
    ...flags,
    ...seats,
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (input.status === "trialing" || input.status === "active") {
    await admin
      .from("organizations")
      .update({
        verification_status: "approved",
        verified_at: new Date().toISOString(),
        verified_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.organizationId);
  }

  if (input.status === "trialing" && !input.keepDates) {
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + (input.trialDays ?? TRIAL_DAYS));
    patch.trial_ends_at = trialEnds.toISOString();
  }

  const monthsToAdd = input.keepDates ? 0 : (input.periodMonths ?? 0);
  if (input.status === "active" && monthsToAdd > 0) {
    const { data: sub } = await admin
      .from("subscriptions")
      .select("current_period_end, trial_ends_at, status")
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    const base =
      sub?.current_period_end &&
      new Date(sub.current_period_end).getTime() > Date.now()
        ? new Date(sub.current_period_end)
        : sub?.status === "trialing" &&
            sub.trial_ends_at &&
            new Date(sub.trial_ends_at).getTime() > Date.now()
          ? new Date(sub.trial_ends_at)
          : new Date();
    base.setMonth(base.getMonth() + monthsToAdd);
    patch.current_period_end = base.toISOString();
  }

  const { error } = await admin
    .from("subscriptions")
    .update(patch)
    .eq("organization_id", input.organizationId);
  if (error) return { error: error.message };
  await ensureOnlineSlug(
    admin,
    input.organizationId,
    Boolean(flags.online_enabled),
  );
  return { ok: true as const };
}

/** Raise or set the staff-seat cap without changing features, trial, or paid dates. */
export async function updateStaffSeatsAction(input: {
  organizationId: string;
  maxStaffSeats: number;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin } = gate;

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (!sub) return { error: "Subscription not found" };

  const flags = resolveModuleFlags({}, sub);
  const included = includedSeatsFromFlags(toggleMapFromDb(flags));
  const total = Math.floor(Number(input.maxStaffSeats));
  if (!Number.isFinite(total) || total < 0) {
    return { error: "Enter a valid seat count" };
  }
  if (total < included) {
    return {
      error: `This place has ${included} seat${included === 1 ? "" : "s"} included with its features. Set the total to at least ${included}.`,
    };
  }

  const seats = seatPatch(flags, total - included);
  const { error } = await admin
    .from("subscriptions")
    .update({
      ...seats,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId);
  if (error) return { error: error.message };
  return {
    ok: true as const,
    maxStaffSeats: seats.max_staff_seats,
    extraStaffSeats: seats.extra_staff_seats,
    includedSeats: included,
  };
}

/** Save which modules this café has, without moving trial or paid end dates. */
export async function updateTenantFeaturesAction(input: {
  organizationId: string;
  menuEnabled: boolean;
  orderingEnabled: boolean;
  kitchenEnabled: boolean;
  inventoryEnabled: boolean;
  financeEnabled: boolean;
  hrEnabled: boolean;
  onlineEnabled?: boolean;
  packageCode?: string | null;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin } = gate;

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (!sub) return { error: "Subscription not found" };

  let flags = resolveModuleFlags(input, sub);
  let planCode = String(sub.plan_code || "custom");
  const packageCode = input.packageCode?.trim() || null;
  if (packageCode) {
    const { data: pkg } = await admin
      .from("subscription_packages")
      .select("*")
      .eq("code", packageCode)
      .maybeSingle();
    if (pkg) {
      flags = packageDbFlags(pkg as PackageRow);
      planCode = String(pkg.code);
    }
  }

  const extra = Number(sub.extra_staff_seats ?? 0);
  const seats = seatPatch(flags, extra);
  const { error } = await admin
    .from("subscriptions")
    .update({
      ...flags,
      ...seats,
      plan_code: packageCode ? planCode : String(sub.plan_code || "custom"),
      package_code: packageCode,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId);
  if (error) return { error: error.message };

  await ensureOnlineSlug(
    admin,
    input.organizationId,
    Boolean(flags.online_enabled),
  );
  return {
    ok: true as const,
    maxStaffSeats: seats.max_staff_seats,
  };
}

export async function getKycSignedUrlAction(path: string) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { data, error } = await gate.admin.storage
    .from("kyc-docs")
    .createSignedUrl(path, 60 * 30);
  if (error) return { error: error.message };
  return { url: data.signedUrl };
}

export async function resetSubscriberPasswordAction(organizationId: string) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin } = gate;

  const { data: membership } = await admin
    .from("memberships")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .maybeSingle();
  if (!membership) return { error: "Owner not found" };

  const password = generatePassword();
  const { data: authUser, error } = await admin.auth.admin.updateUserById(
    membership.user_id,
    { password, email_confirm: true },
  );
  if (error) return { error: error.message };

  await admin
    .from("organizations")
    .update({
      platform_login_password: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId);

  return {
    ok: true as const,
    email: authUser.user.email,
    password,
    stored: false as const,
  };
}

export type PaymentProofRow = Record<string, unknown> & {
  id: string;
  organization_id: string;
  amount: number;
  method: string;
  status: string;
  months_requested?: number;
  reference?: string | null;
  image_url?: string | null;
  media_kind?: "image" | "video" | string | null;
  menu_enabled?: boolean | null;
  ordering_enabled?: boolean | null;
  kitchen_enabled?: boolean | null;
  inventory_enabled?: boolean | null;
  finance_enabled?: boolean | null;
  hr_enabled?: boolean | null;
  online_enabled?: boolean | null;
  extra_staff_seats?: number | null;
  addon_codes?: string[] | null;
  package_code?: string | null;
  expected_amount_etb?: number | null;
  amount_breakdown?: AmountBreakdown | null;
  created_at?: string;
  notes?: string | null;
  organizations?: { name?: string } | null;
};

export type PlatformOverviewStats = {
  totalOrgs: number;
  pendingKyc: number;
  pendingPayments: number;
  followUpsDue: number;
  trialing: number;
  active: number;
  expired: number;
  pastDue: number;
  canceled: number;
  /** Status says trialing/active but the end date has passed. */
  lapsed: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  revenueAllTime: number;
  /** Monthly recurring revenue from live paid subscriptions. */
  mrr: number;
  /** MRR if every live trial converts at its catalog price. */
  trialPipelineMrr: number;
  payingCount: number;
  arpa: number;
  /** Approved orgs that have paid at least once / all approved orgs. */
  conversionRate: number;
  expiring7d: number;
  revenueByMonth: RevenueMonth[];
  needsAttention: Array<{
    kind: "kyc" | "payment" | "expiring" | "followup" | "lapsed";
    organizationId: string;
    name: string;
    detail: string;
    at?: string | null;
  }>;
};

export async function listPaymentProofsAction() {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { data, error } = await gate.admin
    .from("payment_proofs")
    .select("*, organizations(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { error: error.message };
  return { proofs: (data || []) as PaymentProofRow[] };
}

/** Approve payment: mark proof approved, apply module flags if set, extend by months. */
export async function approvePaymentProofAction(input: {
  proofId: string;
  months?: number;
  /** Exact period end (ISO). Wins over months when set. */
  periodEndsAt?: string | null;
  notes?: string;
  menuEnabled?: boolean;
  orderingEnabled?: boolean;
  kitchenEnabled?: boolean;
  inventoryEnabled?: boolean;
  financeEnabled?: boolean;
  hrEnabled?: boolean;
  onlineEnabled?: boolean;
  extraStaffSeats?: number;
  packageCode?: string | null;
  followUpAt?: string | null;
  followUpNote?: string | null;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin, user } = gate;

  const { data: proof, error: proofErr } = await admin
    .from("payment_proofs")
    .select("*")
    .eq("id", input.proofId)
    .single();
  if (proofErr || !proof) return { error: proofErr?.message || "Proof not found" };
  if (proof.status === "approved") return { error: "Already approved" };

  const months = Math.min(
    12,
    Math.max(1, input.months ?? (Number(proof.months_requested) || 1)),
  );

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", proof.organization_id)
    .maybeSingle();
  if (!sub) return { error: "Subscription not found" };

  const from =
    sub.current_period_end && new Date(sub.current_period_end).getTime() > Date.now()
      ? new Date(sub.current_period_end)
      : sub.status === "trialing" &&
          new Date(sub.trial_ends_at).getTime() > Date.now()
        ? new Date(sub.trial_ends_at)
        : new Date();

  const endRes = resolveAccessEnd({
    endsAt: input.periodEndsAt,
    addMonths: input.periodEndsAt ? undefined : months,
    from: input.periodEndsAt ? undefined : from,
  });
  if ("error" in endRes) return { error: endRes.error };
  const base = endRes.end;

  const fu = followUpPatch({
    followUpAt: input.followUpAt,
    followUpNote: input.followUpNote,
  });
  if ("error" in fu) return { error: fu.error };

  const packageCode =
    input.packageCode ??
    (proof.package_code as string | null | undefined) ??
    null;

  let fromPackage: Record<string, unknown> = {};
  let planCode: string | undefined;
  if (packageCode) {
    const { data: pkg } = await admin
      .from("subscription_packages")
      .select("*")
      .eq("code", packageCode)
      .maybeSingle();
    if (pkg) {
      fromPackage = packageDbFlags(pkg as PackageRow);
      planCode = pkg.code;
    }
  }

  const fromProof = modulePatchFromProof(proof);
  const hasOverride =
    input.menuEnabled !== undefined ||
    input.orderingEnabled !== undefined ||
    input.kitchenEnabled !== undefined ||
    input.inventoryEnabled !== undefined ||
    input.financeEnabled !== undefined ||
    input.hrEnabled !== undefined ||
    input.onlineEnabled !== undefined;

  const modulePatch = hasOverride
    ? resolveModuleFlags(input, { ...sub, ...fromPackage, ...fromProof })
    : Object.keys(fromPackage).length
      ? fromPackage
      : fromProof;

  const extraSeats = Math.max(
    0,
    Number(
      input.extraStaffSeats ??
        proof.extra_staff_seats ??
        sub.extra_staff_seats ??
        0,
    ),
  );
  const seats = Object.keys(modulePatch).length
    ? seatPatch(
        resolveModuleFlags(input, { ...sub, ...fromPackage, ...fromProof }),
        extraSeats,
      )
    : {};

  const { data: claimed, error: claimErr } = await admin
    .from("payment_proofs")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      notes:
        input.notes?.trim() ||
        `Approved · until ${base.toISOString().slice(0, 10)}`,
      months_requested: months,
      ...(packageCode ? { package_code: packageCode } : {}),
    })
    .eq("id", proof.id)
    .eq("status", proof.status)
    .select("id");
  if (claimErr) return { error: claimErr.message };
  if (!claimed?.length) {
    return { error: "This proof was already handled — refresh the list" };
  }

  const { error: subErr } = await admin
    .from("subscriptions")
    .update({
      status: "active",
      current_period_end: base.toISOString(),
      ...modulePatch,
      ...(planCode
        ? { plan_code: planCode, package_code: planCode }
        : {}),
      ...seats,
      ...fu,
      notes:
        input.notes?.trim() ||
        `Extended from proof ${proof.id} · until ${base.toISOString().slice(0, 10)}`,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", proof.organization_id);
  if (subErr) {
    await admin
      .from("payment_proofs")
      .update({
        status: proof.status,
        reviewed_by: proof.reviewed_by ?? null,
        reviewed_at: proof.reviewed_at ?? null,
        notes: proof.notes ?? null,
        months_requested: proof.months_requested,
        package_code: proof.package_code ?? null,
      })
      .eq("id", proof.id);
    return { error: subErr.message };
  }

  await admin
    .from("organizations")
    .update({
      verification_status: "approved",
      verified_at: new Date().toISOString(),
      verified_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", proof.organization_id);

  await ensureOnlineSlug(
    admin,
    String(proof.organization_id),
    Boolean(
      resolveModuleFlags(input, { ...sub, ...fromPackage, ...fromProof })
        .online_enabled,
    ),
  );

  return {
    ok: true as const,
    periodEnd: base.toISOString(),
    months,
  };
}

export async function rejectPaymentProofAction(input: {
  proofId: string;
  notes?: string;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { error } = await gate.admin
    .from("payment_proofs")
    .update({
      status: "rejected",
      reviewed_by: gate.user.id,
      reviewed_at: new Date().toISOString(),
      notes: input.notes || "Rejected",
    })
    .eq("id", input.proofId);
  if (error) return { error: error.message };
  return { ok: true as const };
}

// ═══════════════════════════════════════
// Pricing catalog
// ═══════════════════════════════════════

/** Active catalog for cafés (Billing) and platform. */
export async function getPricingCatalogAction(opts?: { includeInactive?: boolean }) {
  const supabase = await createClient();
  const includeInactive = Boolean(opts?.includeInactive);

  let pkgQ = supabase
    .from("subscription_packages")
    .select("*")
    .order("sort_order", { ascending: true });
  let modQ = supabase
    .from("subscription_module_prices")
    .select("*")
    .order("sort_order", { ascending: true });

  let addonQ = supabase
    .from("subscription_addons")
    .select("*")
    .order("sort_order", { ascending: true });
  if (!includeInactive) {
    pkgQ = pkgQ.eq("active", true);
    modQ = modQ.eq("active", true);
    addonQ = addonQ.eq("active", true);
  }

  const [
    { data: packages, error: pkgErr },
    { data: modules, error: modErr },
    { data: addons },
  ] = await Promise.all([pkgQ, modQ, addonQ]);

  if (pkgErr) return { error: pkgErr.message };
  if (modErr) return { error: modErr.message };

  return {
    packages: (packages || []) as PackageRow[],
    modulePrices: (modules || []) as ModulePriceRow[],
    addons: (addons || []) as AddonRow[],
  };
}

/** Platform-only: full catalog including inactive. */
export async function listPricingCatalogAction() {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };

  const [
    { data: packages, error: pkgErr },
    { data: modules, error: modErr },
    { data: addons },
  ] = await Promise.all([
    gate.admin
      .from("subscription_packages")
      .select("*")
      .order("sort_order", { ascending: true }),
    gate.admin
      .from("subscription_module_prices")
      .select("*")
      .order("sort_order", { ascending: true }),
    gate.admin
      .from("subscription_addons")
      .select("*")
      .order("sort_order", { ascending: true }),
  ]);

  if (pkgErr) return { error: pkgErr.message };
  if (modErr) return { error: modErr.message };

  return {
    packages: (packages || []) as PackageRow[],
    modulePrices: (modules || []) as ModulePriceRow[],
    addons: (addons || []) as AddonRow[],
  };
}

export async function upsertPackageAction(input: {
  id?: string;
  code: string;
  name: string;
  description?: string;
  monthlyPriceEtb: number;
  menuEnabled: boolean;
  orderingEnabled: boolean;
  kitchenEnabled: boolean;
  inventoryEnabled: boolean;
  financeEnabled: boolean;
  hrEnabled: boolean;
  onlineEnabled?: boolean;
  maxStaffSeats: number;
  extraStaffSeats?: number;
  active: boolean;
  sortOrder?: number;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };

  const code = input.code.trim().toLowerCase().replace(/\s+/g, "_");
  if (!code) return { error: "Package code required" };

  const flags = {
    menu_enabled: input.menuEnabled,
    ordering_enabled: input.orderingEnabled,
    kitchen_enabled: input.kitchenEnabled,
    inventory_enabled: input.inventoryEnabled,
    finance_enabled: input.financeEnabled,
    hr_enabled: input.hrEnabled,
    online_enabled: Boolean(input.onlineEnabled),
  };
  const extra = Math.max(0, Math.floor(input.extraStaffSeats || 0));
  const seats = seatPatch(flags, extra);

  const row = {
    code,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    monthly_price_etb: Math.max(0, Number(input.monthlyPriceEtb) || 0),
    ...flags,
    max_staff_seats: seats.max_staff_seats,
    active: input.active,
    sort_order: input.sortOrder ?? 0,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await gate.admin
      .from("subscription_packages")
      .update(row)
      .eq("id", input.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await gate.admin.from("subscription_packages").insert(row);
    if (error) return { error: error.message };
  }
  return { ok: true as const };
}

export async function updateModulePriceAction(input: {
  moduleCode: AppModule;
  label?: string;
  description?: string;
  monthlyPriceEtb: number;
  active: boolean;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };

  const { error } = await gate.admin
    .from("subscription_module_prices")
    .update({
      ...(input.label !== undefined ? { label: input.label.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description.trim() || null }
        : {}),
      monthly_price_etb: Math.max(0, Number(input.monthlyPriceEtb) || 0),
      active: input.active,
      updated_at: new Date().toISOString(),
    })
    .eq("module_code", input.moduleCode);
  if (error) return { error: error.message };
  return { ok: true as const };
}

export async function updateAddonAction(input: {
  code: string;
  name?: string;
  description?: string;
  priceEtb: number;
  active: boolean;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };

  const { error } = await gate.admin
    .from("subscription_addons")
    .update({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description.trim() || null }
        : {}),
      price_etb: Math.max(0, Number(input.priceEtb) || 0),
      active: input.active,
      updated_at: new Date().toISOString(),
    })
    .eq("code", input.code);
  if (error) return { error: error.message };
  return { ok: true as const };
}

export async function setPackageActiveAction(input: {
  packageId: string;
  active: boolean;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { error } = await gate.admin
    .from("subscription_packages")
    .update({ active: input.active, updated_at: new Date().toISOString() })
    .eq("id", input.packageId);
  if (error) return { error: error.message };
  return { ok: true as const };
}

// ═══════════════════════════════════════
// Trial / grant / expire anytime
// ═══════════════════════════════════════

export async function startTrialAction(input: {
  organizationId: string;
  trialDays?: number;
  trialMonths?: number;
  /** Explicit trial end (ISO). Wins over days/months when set. */
  trialEndsAt?: string | null;
  menuEnabled?: boolean;
  orderingEnabled?: boolean;
  kitchenEnabled?: boolean;
  inventoryEnabled?: boolean;
  financeEnabled?: boolean;
  hrEnabled?: boolean;
  onlineEnabled?: boolean;
  extraStaffSeats?: number;
  packageCode?: string | null;
  notes?: string;
  issuePassword?: boolean;
  followUpAt?: string | null;
  followUpNote?: string | null;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin, user } = gate;

  const { data: org } = await admin
    .from("organizations")
    .select("id, email, verification_status")
    .eq("id", input.organizationId)
    .maybeSingle();
  if (!org) return { error: "Organization not found" };

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (!sub) return { error: "Subscription not found" };

  const endRes = resolveAccessEnd({
    endsAt: input.trialEndsAt,
    addDays:
      input.trialMonths && input.trialMonths > 0
        ? 0
        : (input.trialDays ?? TRIAL_DAYS),
    addMonths:
      input.trialMonths && input.trialMonths > 0 ? input.trialMonths : 0,
  });
  if ("error" in endRes) return { error: endRes.error };
  const trialEnds = endRes.end;

  const fu = followUpPatch({
    followUpAt: input.followUpAt,
    followUpNote: input.followUpNote,
  });
  if ("error" in fu) return { error: fu.error };

  let flags = resolveModuleFlags(input, sub);
  let planCode = (sub.plan_code as string) || "starter";
  if (input.packageCode) {
    const { data: pkg } = await admin
      .from("subscription_packages")
      .select("*")
      .eq("code", input.packageCode)
      .maybeSingle();
    if (pkg) {
      flags = packageDbFlags(pkg as PackageRow);
      planCode = pkg.code;
    }
  }
  const seats = seatPatch(
    flags,
    input.extraStaffSeats ?? Number(sub?.extra_staff_seats ?? 0),
  );

  if (org.verification_status !== "approved") {
    await admin
      .from("organizations")
      .update({
        verification_status: "approved",
        verified_at: new Date().toISOString(),
        verified_by: user.id,
        admin_notes: input.notes || "Approved via start trial",
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.organizationId);
  } else if (input.notes) {
    await admin
      .from("organizations")
      .update({
        admin_notes: input.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.organizationId);
  }

  const { error: subErr } = await admin
    .from("subscriptions")
    .update({
      status: "trialing",
      ...flags,
      trial_ends_at: trialEnds.toISOString(),
      plan_code: planCode,
      package_code: input.packageCode || planCode,
      ...seats,
      ...fu,
      notes:
        input.notes ||
        `Trial started · ends ${trialEnds.toISOString().slice(0, 10)}`,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId);
  if (subErr) return { error: subErr.message };

  await ensureOnlineSlug(
    admin,
    input.organizationId,
    Boolean(flags.online_enabled),
  );

  let email: string | null = (org.email as string) || null;
  let password: string | undefined;
  if (input.issuePassword) {
    const { data: membership } = await admin
      .from("memberships")
      .select("user_id")
      .eq("organization_id", input.organizationId)
      .eq("role", "owner")
      .maybeSingle();
    if (membership?.user_id) {
      password = generatePassword();
      const { data: authUser, error: pwErr } =
        await admin.auth.admin.updateUserById(membership.user_id, {
          password,
          email_confirm: true,
        });
      if (pwErr) return { error: pwErr.message };
      email = authUser.user.email || email;
      await admin
        .from("organizations")
        .update({
          platform_login_password: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.organizationId);
    }
  }

  return {
    ok: true as const,
    trialEndsAt: trialEnds.toISOString(),
    email,
    password,
    stored: false as const,
  };
}

export async function extendTrialAction(input: {
  organizationId: string;
  addDays?: number;
  addMonths?: number;
  /** Set trial to this exact end datetime (ISO). Wins over addDays/months. */
  endsAt?: string | null;
  notes?: string;
  followUpAt?: string | null;
  followUpNote?: string | null;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin } = gate;

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (!sub) return { error: "Subscription not found" };

  const now = Date.now();
  const from =
    sub.status === "trialing" &&
    sub.trial_ends_at &&
    new Date(sub.trial_ends_at).getTime() > now
      ? new Date(sub.trial_ends_at)
      : new Date();

  const endRes = resolveAccessEnd({
    endsAt: input.endsAt,
    addDays: input.addDays,
    addMonths: input.addMonths,
    from: input.endsAt ? undefined : from,
  });
  if ("error" in endRes) return { error: endRes.error };
  const currentEnd = endRes.end;

  const fu = followUpPatch({
    followUpAt: input.followUpAt,
    followUpNote: input.followUpNote,
  });
  if ("error" in fu) return { error: fu.error };

  const { error } = await admin
    .from("subscriptions")
    .update({
      status: "trialing",
      trial_ends_at: currentEnd.toISOString(),
      ...fu,
      notes:
        input.notes?.trim() ||
        `Trial set to end ${currentEnd.toISOString().slice(0, 16).replace("T", " ")}`,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId);
  if (error) return { error: error.message };

  await admin
    .from("organizations")
    .update({
      verification_status: "approved",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.organizationId);

  return { ok: true as const, trialEndsAt: currentEnd.toISOString() };
}

export async function grantPaidMonthsAction(input: {
  organizationId: string;
  months?: number;
  /** Exact period end (ISO). Wins over months when set. */
  periodEndsAt?: string | null;
  menuEnabled?: boolean;
  orderingEnabled?: boolean;
  kitchenEnabled?: boolean;
  inventoryEnabled?: boolean;
  financeEnabled?: boolean;
  hrEnabled?: boolean;
  onlineEnabled?: boolean;
  extraStaffSeats?: number;
  packageCode?: string | null;
  notes?: string;
  followUpAt?: string | null;
  followUpNote?: string | null;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin, user } = gate;

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (!sub) return { error: "Subscription not found" };

  const from =
    sub.current_period_end &&
    new Date(sub.current_period_end).getTime() > Date.now()
      ? new Date(sub.current_period_end)
      : sub.status === "trialing" &&
          sub.trial_ends_at &&
          new Date(sub.trial_ends_at).getTime() > Date.now()
        ? new Date(sub.trial_ends_at)
        : new Date();

  const months = Math.min(24, Math.max(0, Math.floor(input.months ?? 0)));
  const endRes = resolveAccessEnd({
    endsAt: input.periodEndsAt,
    addMonths: input.periodEndsAt ? undefined : months || undefined,
    addDays: 0,
    from: input.periodEndsAt ? undefined : from,
  });
  if ("error" in endRes) {
    if (!input.periodEndsAt && months <= 0) {
      return { error: "Provide period end date or at least 1 month" };
    }
    return { error: endRes.error };
  }
  const base = endRes.end;

  const fu = followUpPatch({
    followUpAt: input.followUpAt,
    followUpNote: input.followUpNote,
  });
  if ("error" in fu) return { error: fu.error };

  let flags = resolveModuleFlags(input, sub);
  let planCode = (sub.plan_code as string) || undefined;
  if (input.packageCode) {
    const { data: pkg } = await admin
      .from("subscription_packages")
      .select("*")
      .eq("code", input.packageCode)
      .maybeSingle();
    if (pkg) {
      flags = packageDbFlags(pkg as PackageRow);
      planCode = pkg.code;
    }
  }
  const seats = seatPatch(
    flags,
    input.extraStaffSeats ?? Number(sub?.extra_staff_seats ?? 0),
  );

  const { error } = await admin
    .from("subscriptions")
    .update({
      status: "active",
      current_period_end: base.toISOString(),
      ...flags,
      ...(planCode
        ? { plan_code: planCode, package_code: planCode }
        : {}),
      ...seats,
      ...fu,
      notes:
        input.notes?.trim() ||
        `Access until ${base.toISOString().slice(0, 16).replace("T", " ")} (manual)`,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId);
  if (error) return { error: error.message };

  await admin
    .from("organizations")
    .update({
      verification_status: "approved",
      verified_at: new Date().toISOString(),
      verified_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.organizationId);

  await ensureOnlineSlug(
    admin,
    input.organizationId,
    Boolean(flags.online_enabled),
  );

  return {
    ok: true as const,
    periodEnd: base.toISOString(),
    months: months || null,
  };
}

export async function setFollowUpAction(input: {
  organizationId: string;
  followUpAt: string | null;
  followUpNote?: string | null;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };

  const fu = followUpPatch({
    followUpAt: input.followUpAt,
    followUpNote: input.followUpNote,
    clearFollowUp: input.followUpAt === null,
  });
  if ("error" in fu) return { error: fu.error };

  const { error } = await gate.admin
    .from("subscriptions")
    .update({
      ...fu,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId);
  if (error) return { error: error.message };
  return { ok: true as const };
}

export async function expireAccessAction(input: {
  organizationId: string;
  mode?: "expired" | "canceled";
  notes?: string;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const status = input.mode === "canceled" ? "canceled" : "expired";
  const { error } = await gate.admin
    .from("subscriptions")
    .update({
      status,
      notes: input.notes?.trim() || `Access set to ${status}`,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId);
  if (error) return { error: error.message };
  return { ok: true as const };
}

export async function addAdminNoteAction(input: {
  organizationId: string;
  note: string;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const note = input.note.trim();
  if (!note) return { error: "Note required" };

  const { data: org } = await gate.admin
    .from("organizations")
    .select("admin_notes")
    .eq("id", input.organizationId)
    .maybeSingle();

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const prev = (org?.admin_notes as string) || "";
  const next = prev ? `${prev}\n[${stamp}] ${note}` : `[${stamp}] ${note}`;

  const { error } = await gate.admin
    .from("organizations")
    .update({ admin_notes: next, updated_at: new Date().toISOString() })
    .eq("id", input.organizationId);
  if (error) return { error: error.message };
  return { ok: true as const, adminNotes: next };
}

export async function getPlatformOverviewAction(): Promise<
  { stats: PlatformOverviewStats } | { error: string }
> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin } = gate;

  const [{ data: orgs }, { data: subs }, { data: apps }, proofsRes, catalog] =
    await Promise.all([
      admin
        .from("organizations")
        .select("id, name, verification_status, created_at"),
      admin.from("subscriptions").select("*"),
      admin
        .from("applications")
        .select("id, company_name, status, created_at")
        .eq("status", "pending"),
      fetchAllRows<Record<string, unknown>>((from, to) =>
        admin
          .from("payment_proofs")
          .select(
            "id, organization_id, amount, status, months_requested, reviewed_at, created_at, organizations(name)",
          )
          .range(from, to),
      ),
      loadCatalog(admin),
    ]);

  const orgList = orgs || [];
  const appList = apps || [];
  const subList = (subs || []) as Record<string, unknown>[];
  const proofList = proofsRes.rows;
  const approvedProofs = proofList.filter(
    (p) => p.status === "approved",
  ) as unknown as ProofLike[];
  const approvedByOrg = new Map<string, ProofLike[]>();
  for (const p of approvedProofs) {
    const id = String(p.organization_id);
    const list = approvedByOrg.get(id);
    if (list) list.push(p);
    else approvedByOrg.set(id, [p]);
  }
  const orgName = new Map(
    orgList.map((o) => [o.id as string, String(o.name || "—")]),
  );

  const pendingKyc =
    orgList.filter((o) => o.verification_status === "pending").length +
    appList.length;
  const pendingPayments = proofList.filter((p) => p.status === "pending").length;

  let trialing = 0;
  let active = 0;
  let expired = 0;
  let pastDue = 0;
  let canceled = 0;
  let lapsed = 0;
  let followUpsDue = 0;
  let mrr = 0;
  let trialPipelineMrr = 0;
  let payingCount = 0;
  let expiring7d = 0;
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const tenDays = 10 * 24 * 60 * 60 * 1000;
  /** Surface follow-ups that are due or within the next 48h */
  const followSoon = 2 * 24 * 60 * 60 * 1000;

  const needsAttention: PlatformOverviewStats["needsAttention"] = [];

  for (const a of appList) {
    needsAttention.push({
      kind: "kyc",
      organizationId: a.id as string,
      name: String(a.company_name || "Interest application"),
      detail: "Pending interest application",
      at: a.created_at as string,
    });
  }
  for (const o of orgList) {
    if (o.verification_status === "pending") {
      needsAttention.push({
        kind: "kyc",
        organizationId: o.id as string,
        name: String(o.name),
        detail: "Pending KYC",
        at: o.created_at as string,
      });
    }
  }

  for (const p of proofList) {
    if (p.status !== "pending") continue;
    const orgId = p.organization_id as string;
    const orgObj = p.organizations as { name?: string } | null;
    needsAttention.push({
      kind: "payment",
      organizationId: orgId,
      name: orgObj?.name || orgName.get(orgId) || "—",
      detail: `Payment proof · ${Number(p.amount)} ETB`,
      at: p.created_at as string,
    });
  }

  for (const s of subList) {
    const st = String(s.status);
    const orgId = s.organization_id as string;
    const eff = effectiveStatus(s, now);
    if (eff === "trialing") {
      trialing += 1;
      trialPipelineMrr += catalogMonthlyPrice(
        s,
        catalog.packages,
        catalog.modulePrices,
      );
    } else if (eff === "active") {
      active += 1;
      payingCount += 1;
      mrr += billingForTenant(
        s,
        approvedByOrg.get(orgId) || [],
        catalog.packages,
        catalog.modulePrices,
      ).monthlyEtb;
    } else if (eff === "lapsed_trial" || eff === "lapsed_paid") {
      lapsed += 1;
      needsAttention.push({
        kind: "lapsed",
        organizationId: orgId,
        name: orgName.get(orgId) || "—",
        detail:
          eff === "lapsed_trial"
            ? "Trial ended — no payment yet"
            : "Paid period ended — renewal needed",
        at: (st === "trialing" ? s.trial_ends_at : s.current_period_end) as
          | string
          | null,
      });
    } else if (eff === "expired") expired += 1;
    else if (eff === "past_due") pastDue += 1;
    else if (eff === "canceled") canceled += 1;

    if (eff === "trialing" || eff === "active") {
      const endRaw =
        st === "trialing" ? s.trial_ends_at : s.current_period_end;
      if (endRaw) {
        const endMs = new Date(endRaw as string).getTime();
        if (endMs > now && endMs - now <= sevenDays) expiring7d += 1;
        if (endMs > now && endMs - now <= tenDays) {
          const days = Math.ceil((endMs - now) / (1000 * 60 * 60 * 24));
          needsAttention.push({
            kind: "expiring",
            organizationId: orgId,
            name: orgName.get(orgId) || "—",
            detail: `${eff === "trialing" ? "Trial" : "Paid period"} ends in ${days}d`,
            at: endRaw as string,
          });
        }
      }
    }

    if (s.follow_up_at) {
      const fuMs = new Date(s.follow_up_at as string).getTime();
      if (!Number.isNaN(fuMs) && fuMs <= now + followSoon) {
        followUpsDue += 1;
        const due = fuMs <= now;
        needsAttention.push({
          kind: "followup",
          organizationId: s.organization_id as string,
          name: orgName.get(s.organization_id as string) || "—",
          detail: due
            ? `Follow-up due${s.follow_up_note ? ` · ${String(s.follow_up_note).slice(0, 60)}` : ""}`
            : `Follow-up soon${s.follow_up_note ? ` · ${String(s.follow_up_note).slice(0, 60)}` : ""}`,
          at: s.follow_up_at as string,
        });
      }
    }
  }

  const months = revenueByMonth(approvedProofs, 6);
  const revenueThisMonth = months[months.length - 1]?.amount ?? 0;
  const revenueLastMonth = months[months.length - 2]?.amount ?? 0;
  const revenueAllTime = approvedProofs.reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0,
  );

  const approvedOrgs = orgList.filter(
    (o) => o.verification_status === "approved",
  );
  const subByOrg = new Map(subList.map((s) => [String(s.organization_id), s]));
  const everPaid = approvedOrgs.filter(
    (o) =>
      approvedByOrg.has(String(o.id)) ||
      subByOrg.get(String(o.id))?.current_period_end,
  ).length;
  const conversionRate = approvedOrgs.length
    ? everPaid / approvedOrgs.length
    : 0;

  needsAttention.sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    return tb - ta;
  });

  return {
    stats: {
      totalOrgs: orgList.length,
      pendingKyc,
      pendingPayments,
      followUpsDue,
      trialing,
      active,
      expired,
      pastDue,
      canceled,
      lapsed,
      revenueThisMonth,
      revenueLastMonth,
      revenueAllTime,
      mrr: Math.round(mrr),
      trialPipelineMrr: Math.round(trialPipelineMrr),
      payingCount,
      arpa: payingCount ? Math.round(mrr / payingCount) : 0,
      conversionRate,
      expiring7d,
      revenueByMonth: months,
      needsAttention: needsAttention.slice(0, 40),
    },
  };
}

/** Helper used by Billing to compute expected amounts server-side if needed. */
export async function previewBillingAmountAction(input: {
  months: number;
  packageCode?: string | null;
  modules?: Partial<Record<AppModule, boolean>>;
}) {
  const catalog = await getPricingCatalogAction();
  if ("error" in catalog) return { error: catalog.error };
  const breakdown = calculateAmount({
    months: input.months,
    packages: catalog.packages,
    modulePrices: catalog.modulePrices,
    packageCode: input.packageCode,
    modules: input.modules as Partial<Record<AppModule, boolean>>,
  });
  return { breakdown };
}

// ═══════════════════════════════════════
// Subscriber usage (engagement)
// ═══════════════════════════════════════

const USAGE_TZ = "Africa/Addis_Ababa";

function dayKeyInTz(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: USAGE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export async function getTenantUsageAction(): Promise<
  | { usage: Record<string, TenantUsage>; dayKeys: string[]; generatedAt: string }
  | { error: string }
> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin } = gate;

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const windowStart = new Date(now - USAGE_WINDOW_DAYS * DAY).toISOString();
  const prevStart = new Date(now - USAGE_WINDOW_DAYS * 2 * DAY).toISOString();
  const weekStartMs = now - 7 * DAY;

  const dayKeys: string[] = [];
  for (let i = USAGE_WINDOW_DAYS - 1; i >= 0; i--) {
    dayKeys.push(dayKeyInTz(new Date(now - i * DAY)));
  }
  const dayIndex = new Map(dayKeys.map((k, i) => [k, i]));

  type OrderRow = {
    organization_id: string;
    total: number | string | null;
    status: string | null;
    payment_status: string | null;
    created_at: string;
    day_key: string | null;
    source?: string | null;
  };
  type OrgRef = { organization_id: string };

  const [orders, members, menu, inventory, moves, closes, xReports, subs] =
    await Promise.all([
      fetchAllRows<OrderRow>((from, to) =>
        admin
          .from("sale_orders")
          .select(
            "organization_id, total, status, payment_status, created_at, day_key, source",
          )
          .gte("created_at", prevStart)
          .range(from, to),
        200_000,
      ),
      fetchAllRows<OrgRef & { role: string; active: boolean | null }>(
        (from, to) =>
          admin
            .from("memberships")
            .select("organization_id, role, active")
            .range(from, to),
      ),
      fetchAllRows<OrgRef>((from, to) =>
        admin.from("menu_items").select("organization_id").range(from, to),
      ),
      fetchAllRows<OrgRef>((from, to) =>
        admin.from("inventory_items").select("organization_id").range(from, to),
      ),
      fetchAllRows<OrgRef>((from, to) =>
        admin
          .from("inventory_movements")
          .select("organization_id")
          .gte("created_at", windowStart)
          .range(from, to),
      ),
      fetchAllRows<OrgRef>((from, to) =>
        admin
          .from("day_closes")
          .select("organization_id")
          .gte("closed_at", windowStart)
          .range(from, to),
      ),
      fetchAllRows<OrgRef>((from, to) =>
        admin
          .from("x_reports")
          .select("organization_id")
          .gte("counted_at", windowStart)
          .range(from, to),
      ),
      admin.from("subscriptions").select("*"),
    ]);

  if (orders.error) return { error: orders.error };

  const usage: Record<string, TenantUsage> = {};
  const activeDays = new Map<string, Set<string>>();
  const get = (orgId: string): TenantUsage => {
    let u = usage[orgId];
    if (!u) {
      u = {
        organizationId: orgId,
        orders7d: 0,
        orders30d: 0,
        ordersPrev30d: 0,
        sales30d: 0,
        lastOrderAt: null,
        activeDays30d: 0,
        dailyOrders: dayKeys.map(() => 0),
        dailySales: dayKeys.map(() => 0),
        staffActive: 0,
        menuItems: 0,
        inventoryItems: 0,
        inventoryMoves30d: 0,
        dayCloses30d: 0,
        modulesUsed: [],
        score: 0,
        segment: "not_started",
      };
      usage[orgId] = u;
    }
    return u;
  };

  const windowStartMs = new Date(windowStart).getTime();
  const onlineOrgs = new Set<string>();
  for (const o of orders.rows) {
    if (o.status === "canceled") continue;
    const u = get(o.organization_id);
    const at = new Date(o.created_at).getTime();
    if (!u.lastOrderAt || at > new Date(u.lastOrderAt).getTime()) {
      u.lastOrderAt = o.created_at;
    }
    if (at < windowStartMs) {
      u.ordersPrev30d += 1;
      continue;
    }
    u.orders30d += 1;
    if (o.source === "online") onlineOrgs.add(o.organization_id);
    if (at >= weekStartMs) u.orders7d += 1;
    const key = o.day_key || dayKeyInTz(new Date(o.created_at));
    const i = dayIndex.get(key);
    const paid = o.payment_status !== "unpaid";
    const total = Number(o.total) || 0;
    if (paid) u.sales30d += total;
    if (i !== undefined) {
      u.dailyOrders[i] += 1;
      if (paid) u.dailySales[i] += total;
    }
    let days = activeDays.get(o.organization_id);
    if (!days) {
      days = new Set();
      activeDays.set(o.organization_id, days);
    }
    days.add(key);
  }
  for (const [orgId, days] of activeDays) get(orgId).activeDays30d = days.size;

  for (const m of members.rows) {
    if (m.role !== "owner" && m.active !== false) get(m.organization_id).staffActive += 1;
  }
  for (const r of menu.rows) get(r.organization_id).menuItems += 1;
  for (const r of inventory.rows) get(r.organization_id).inventoryItems += 1;
  for (const r of moves.rows) get(r.organization_id).inventoryMoves30d += 1;
  for (const r of closes.rows) get(r.organization_id).dayCloses30d += 1;
  const xByOrg = new Map<string, number>();
  for (const r of xReports.rows) {
    xByOrg.set(r.organization_id, (xByOrg.get(r.organization_id) || 0) + 1);
  }

  const subByOrg = new Map(
    ((subs.data || []) as Record<string, unknown>[]).map((s) => [
      String(s.organization_id),
      s,
    ]),
  );

  for (const sub of subByOrg.values()) get(String(sub.organization_id));

  for (const u of Object.values(usage)) {
    const sub = subByOrg.get(u.organizationId);
    const signals: Partial<Record<AppModule, boolean>> = {
      menu: u.menuItems > 0,
      ordering: u.orders30d > 0,
      kitchen: u.orders30d > 0,
      inventory: u.inventoryMoves30d > 0,
      finance: u.dayCloses30d + (xByOrg.get(u.organizationId) || 0) > 0,
      hr: u.staffActive > 0,
      online: onlineOrgs.has(u.organizationId),
    };
    const tracked = Object.keys(signals) as AppModule[];
    const enabled = tracked.filter((m) => {
      if (m === "online") return Boolean(sub?.online_enabled);
      const v = sub?.[`${m}_enabled`];
      return v === undefined || v === null ? true : Boolean(v);
    });
    u.modulesUsed = enabled.filter((m) => signals[m]);
    const { score, segment } = scoreUsage({
      activeDays30d: u.activeDays30d,
      lastOrderAt: u.lastOrderAt,
      orders30d: u.orders30d,
      ordersPrev30d: u.ordersPrev30d,
      modulesUsed: u.modulesUsed.length,
      modulesEnabled: enabled.length,
      menuItems: u.menuItems,
      now,
    });
    u.score = score;
    u.segment = segment;
    u.sales30d = Math.round(u.sales30d * 100) / 100;
  }

  return { usage, dayKeys, generatedAt: new Date(now).toISOString() };
}
