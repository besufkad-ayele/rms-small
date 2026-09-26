"use server";

import {
  calculateAmount,
  packageDbFlags,
  type AmountBreakdown,
  type ModulePriceRow,
  type PackageRow,
} from "@/lib/pricing";
import { createAdminClient, createClient } from "@/lib/supabase/server";
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
  let days = Math.max(0, Math.floor(input.addDays ?? 0));
  if (input.addMonths && input.addMonths > 0) {
    days += Math.floor(input.addMonths * 30);
  }
  if (days <= 0) {
    return { error: "Provide an end date, or add at least 1 day/month" };
  }
  const end = input.from ? new Date(input.from) : new Date();
  end.setDate(end.getDate() + days);
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

async function requirePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" as const };

  const admin = createAdminClient();
  const adminEmail = (
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAIL || "admin@aramis.product"
  ).toLowerCase();
  if (user.email?.toLowerCase() === adminEmail) {
    await admin
      .from("profiles")
      .update({ is_platform_admin: true, email: user.email })
      .eq("id", user.id);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_platform_admin) {
    return { error: "Not a platform admin" as const };
  }
  return { user, admin, profile };
}

export type ApplicationRow = Record<string, unknown>;

export type ModuleToggleInput = {
  menuEnabled?: boolean;
  orderingEnabled?: boolean;
  inventoryEnabled?: boolean;
  financeEnabled?: boolean;
  hrEnabled?: boolean;
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
};

function resolveModuleFlags(
  input: ModuleToggleInput,
  fallback?: Record<string, unknown> | null,
) {
  const inv = Boolean(fallback?.inventory_enabled ?? true);
  return {
    menu_enabled: input.menuEnabled ?? Boolean(fallback?.menu_enabled ?? inv),
    ordering_enabled:
      input.orderingEnabled ?? Boolean(fallback?.ordering_enabled ?? inv),
    inventory_enabled: input.inventoryEnabled ?? inv,
    finance_enabled:
      input.financeEnabled ?? Boolean(fallback?.finance_enabled ?? true),
    hr_enabled: input.hrEnabled ?? Boolean(fallback?.hr_enabled ?? true),
  };
}

/** Apply proof module columns when any are non-null; otherwise leave sub flags alone. */
function modulePatchFromProof(proof: Record<string, unknown>) {
  const keys = [
    "menu_enabled",
    "ordering_enabled",
    "inventory_enabled",
    "finance_enabled",
    "hr_enabled",
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

  const [{ data: subs }, { data: memberships }] = await Promise.all([
    admin.from("subscriptions").select("*").in("organization_id", orgIds),
    admin
      .from("memberships")
      .select("user_id, role, organization_id")
      .in("organization_id", orgIds)
      .eq("role", "owner"),
  ]);

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

  const authEmailById = new Map<string, string | null>();
  await Promise.all(
    ownerIds.map(async (uid) => {
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(uid);
        authEmailById.set(uid, authUser.user?.email ?? null);
      } catch {
        authEmailById.set(uid, null);
      }
    }),
  );

  const tenants: PlatformTenantRow[] = orgs.map((org) => {
    const ownerId = ownerIdByOrg.get(org.id as string);
    const owner = ownerId ? profilesById.get(ownerId) ?? null : null;
    return {
      organization: org,
      subscription: subByOrg.get(org.id as string) ?? null,
      owner,
      ownerAuthEmail: ownerId ? (authEmailById.get(ownerId) ?? null) : null,
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
  inventoryEnabled?: boolean;
  financeEnabled?: boolean;
  hrEnabled?: boolean;
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
  let planCode = (sub?.plan_code as string) || "aramis_starter";
  let maxSeats: number | undefined;
  if (input.packageCode) {
    const { data: pkg } = await admin
      .from("subscription_packages")
      .select("*")
      .eq("code", input.packageCode)
      .maybeSingle();
    if (pkg) {
      flags = packageDbFlags(pkg as PackageRow);
      planCode = pkg.code;
      maxSeats = Number(pkg.max_staff_seats) || 2;
    }
  }

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
      ...(maxSeats !== undefined ? { max_staff_seats: maxSeats } : {}),
      ...fu,
      notes:
        input.adminNotes ||
        `Trial started · ends ${trialEnds.toISOString().slice(0, 10)}`,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId);
  if (updSub) return { error: updSub.message };

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

/** @deprecated Prefer approveOrganizationAction — signup users set their own password */
export async function approveApplicationAction(input: {
  applicationId: string;
  menuEnabled?: boolean;
  orderingEnabled?: boolean;
  inventoryEnabled?: boolean;
  financeEnabled?: boolean;
  hrEnabled?: boolean;
  trialDays?: number;
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
  if (appErr || !app) return { error: appErr?.message || "Application not found" };
  if (app.status === "approved") {
    return { error: "Already approved", email: app.email as string };
  }

  // If they already signed up with this email, approve their org instead
  const email = String(app.email).toLowerCase();
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
      const res = await approveOrganizationAction({
        organizationId: membership.organization_id,
        trialDays: input.trialDays,
        menuEnabled: input.menuEnabled,
        orderingEnabled: input.orderingEnabled,
        inventoryEnabled: input.inventoryEnabled,
        financeEnabled: input.financeEnabled,
        hrEnabled: input.hrEnabled,
        adminNotes: input.adminNotes,
      });
      if ("error" in res) return res;
      await admin
        .from("applications")
        .update({
          status: "approved",
          organization_id: membership.organization_id,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          admin_notes: input.adminNotes || "Linked to existing account",
          updated_at: new Date().toISOString(),
        })
        .eq("id", app.id);
      return {
        ok: true as const,
        email,
        organizationId: membership.organization_id,
        trialEndsAt: res.trialEndsAt,
      };
    }
  }

  return {
    error:
      "This email has no account yet. Ask them to create an account at /signup, then onboard — approve from Onboarding.",
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
  inventoryEnabled: boolean;
  financeEnabled: boolean;
  hrEnabled: boolean;
  trialDays?: number;
  periodMonths?: number;
  maxStaffSeats?: number;
  notes?: string;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin, user } = gate;

  const patch: Record<string, unknown> = {
    status: input.status,
    menu_enabled: input.menuEnabled,
    ordering_enabled: input.orderingEnabled,
    inventory_enabled: input.inventoryEnabled,
    finance_enabled: input.financeEnabled,
    hr_enabled: input.hrEnabled,
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (input.maxStaffSeats !== undefined) {
    patch.max_staff_seats = Math.max(0, Math.floor(input.maxStaffSeats));
  }

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

  if (input.status === "trialing") {
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + (input.trialDays ?? TRIAL_DAYS));
    patch.trial_ends_at = trialEnds.toISOString();
  }

  const monthsToAdd = input.periodMonths ?? 0;
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
  return { ok: true as const };
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
      platform_login_password: password,
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId);

  await admin
    .from("applications")
    .update({ generated_password: password, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);

  return {
    ok: true as const,
    email: authUser.user.email,
    password,
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
  inventory_enabled?: boolean | null;
  finance_enabled?: boolean | null;
  hr_enabled?: boolean | null;
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
  revenueThisMonth: number;
  revenueAllTime: number;
  needsAttention: Array<{
    kind: "kyc" | "payment" | "expiring" | "followup";
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
  inventoryEnabled?: boolean;
  financeEnabled?: boolean;
  hrEnabled?: boolean;
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
  let maxSeats: number | undefined;
  if (packageCode) {
    const { data: pkg } = await admin
      .from("subscription_packages")
      .select("*")
      .eq("code", packageCode)
      .maybeSingle();
    if (pkg) {
      fromPackage = packageDbFlags(pkg as PackageRow);
      planCode = pkg.code;
      maxSeats = Number(pkg.max_staff_seats) || undefined;
    }
  }

  const fromProof = modulePatchFromProof(proof);
  const hasOverride =
    input.menuEnabled !== undefined ||
    input.orderingEnabled !== undefined ||
    input.inventoryEnabled !== undefined ||
    input.financeEnabled !== undefined ||
    input.hrEnabled !== undefined;

  const modulePatch = hasOverride
    ? resolveModuleFlags(input, { ...sub, ...fromPackage, ...fromProof })
    : Object.keys(fromPackage).length
      ? fromPackage
      : fromProof;

  const { error: subErr } = await admin
    .from("subscriptions")
    .update({
      status: "active",
      current_period_end: base.toISOString(),
      ...modulePatch,
      ...(planCode
        ? { plan_code: planCode, package_code: planCode }
        : {}),
      ...(maxSeats !== undefined ? { max_staff_seats: maxSeats } : {}),
      ...fu,
      notes:
        input.notes?.trim() ||
        `Extended from proof ${proof.id} · until ${base.toISOString().slice(0, 10)}`,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", proof.organization_id);
  if (subErr) return { error: subErr.message };

  await admin
    .from("organizations")
    .update({
      verification_status: "approved",
      verified_at: new Date().toISOString(),
      verified_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", proof.organization_id);

  const { error: updErr } = await admin
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
    .eq("id", proof.id);
  if (updErr) return { error: updErr.message };

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

  if (!includeInactive) {
    pkgQ = pkgQ.eq("active", true);
    modQ = modQ.eq("active", true);
  }

  const [{ data: packages, error: pkgErr }, { data: modules, error: modErr }] =
    await Promise.all([pkgQ, modQ]);

  if (pkgErr) return { error: pkgErr.message };
  if (modErr) return { error: modErr.message };

  return {
    packages: (packages || []) as PackageRow[],
    modulePrices: (modules || []) as ModulePriceRow[],
  };
}

/** Platform-only: full catalog including inactive. */
export async function listPricingCatalogAction() {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };

  const [{ data: packages, error: pkgErr }, { data: modules, error: modErr }] =
    await Promise.all([
      gate.admin
        .from("subscription_packages")
        .select("*")
        .order("sort_order", { ascending: true }),
      gate.admin
        .from("subscription_module_prices")
        .select("*")
        .order("sort_order", { ascending: true }),
    ]);

  if (pkgErr) return { error: pkgErr.message };
  if (modErr) return { error: modErr.message };

  return {
    packages: (packages || []) as PackageRow[],
    modulePrices: (modules || []) as ModulePriceRow[],
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
  inventoryEnabled: boolean;
  financeEnabled: boolean;
  hrEnabled: boolean;
  maxStaffSeats: number;
  active: boolean;
  sortOrder?: number;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };

  const code = input.code.trim().toLowerCase().replace(/\s+/g, "_");
  if (!code) return { error: "Package code required" };

  const row = {
    code,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    monthly_price_etb: Math.max(0, Number(input.monthlyPriceEtb) || 0),
    menu_enabled: input.menuEnabled,
    ordering_enabled: input.orderingEnabled,
    inventory_enabled: input.inventoryEnabled,
    finance_enabled: input.financeEnabled,
    hr_enabled: input.hrEnabled,
    max_staff_seats: Math.max(0, Math.floor(input.maxStaffSeats)),
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
  inventoryEnabled?: boolean;
  financeEnabled?: boolean;
  hrEnabled?: boolean;
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
  let planCode = (sub.plan_code as string) || "aramis_starter";
  let maxSeats: number | undefined;
  if (input.packageCode) {
    const { data: pkg } = await admin
      .from("subscription_packages")
      .select("*")
      .eq("code", input.packageCode)
      .maybeSingle();
    if (pkg) {
      flags = packageDbFlags(pkg as PackageRow);
      planCode = pkg.code;
      maxSeats = Number(pkg.max_staff_seats) || 2;
    }
  }

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
      ...(maxSeats !== undefined ? { max_staff_seats: maxSeats } : {}),
      ...fu,
      notes:
        input.notes ||
        `Trial started · ends ${trialEnds.toISOString().slice(0, 10)}`,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId);
  if (subErr) return { error: subErr.message };

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
          platform_login_password: password,
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
  inventoryEnabled?: boolean;
  financeEnabled?: boolean;
  hrEnabled?: boolean;
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
  let maxSeats: number | undefined;
  if (input.packageCode) {
    const { data: pkg } = await admin
      .from("subscription_packages")
      .select("*")
      .eq("code", input.packageCode)
      .maybeSingle();
    if (pkg) {
      flags = packageDbFlags(pkg as PackageRow);
      planCode = pkg.code;
      maxSeats = Number(pkg.max_staff_seats) || 2;
    }
  }

  const { error } = await admin
    .from("subscriptions")
    .update({
      status: "active",
      current_period_end: base.toISOString(),
      ...flags,
      ...(planCode
        ? { plan_code: planCode, package_code: planCode }
        : {}),
      ...(maxSeats !== undefined ? { max_staff_seats: maxSeats } : {}),
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

  const [
    { data: orgs },
    { data: subs },
    { data: proofs },
  ] = await Promise.all([
    admin.from("organizations").select("id, name, verification_status, created_at"),
    admin
      .from("subscriptions")
      .select(
        "organization_id, status, trial_ends_at, current_period_end, plan_code, follow_up_at, follow_up_note",
      ),
    admin
      .from("payment_proofs")
      .select("id, organization_id, amount, status, created_at, organizations(name)"),
  ]);

  const orgList = orgs || [];
  const subList = subs || [];
  const proofList = proofs || [];
  const orgName = new Map(
    orgList.map((o) => [o.id as string, String(o.name || "—")]),
  );

  const pendingKyc = orgList.filter(
    (o) => o.verification_status === "pending",
  ).length;
  const pendingPayments = proofList.filter((p) => p.status === "pending").length;

  let trialing = 0;
  let active = 0;
  let expired = 0;
  let pastDue = 0;
  let canceled = 0;
  let followUpsDue = 0;
  const now = Date.now();
  const tenDays = 10 * 24 * 60 * 60 * 1000;
  /** Surface follow-ups that are due or within the next 48h */
  const followSoon = 2 * 24 * 60 * 60 * 1000;

  const needsAttention: PlatformOverviewStats["needsAttention"] = [];

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
    if (st === "trialing") trialing += 1;
    else if (st === "active") active += 1;
    else if (st === "expired") expired += 1;
    else if (st === "past_due") pastDue += 1;
    else if (st === "canceled") canceled += 1;

    if (st === "trialing" || st === "active") {
      const endRaw =
        st === "trialing" ? s.trial_ends_at : s.current_period_end;
      if (endRaw) {
        const endMs = new Date(endRaw as string).getTime();
        if (endMs > now && endMs - now <= tenDays) {
          const days = Math.ceil((endMs - now) / (1000 * 60 * 60 * 24));
          needsAttention.push({
            kind: "expiring",
            organizationId: s.organization_id as string,
            name: orgName.get(s.organization_id as string) || "—",
            detail: `${st} ends in ${days}d`,
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

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  let revenueThisMonth = 0;
  let revenueAllTime = 0;
  for (const p of proofList) {
    if (p.status !== "approved") continue;
    const amt = Number(p.amount) || 0;
    revenueAllTime += amt;
    if (p.created_at && new Date(p.created_at as string) >= monthStart) {
      revenueThisMonth += amt;
    }
  }

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
      revenueThisMonth,
      revenueAllTime,
      needsAttention: needsAttention.slice(0, 25),
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
