"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { SubStatus } from "@/lib/tenant";

const TRIAL_DAYS = Number(process.env.NEXT_PUBLIC_TRIAL_DAYS || 14);

function generatePassword() {
  const chunk = () => Math.random().toString(36).slice(2, 8);
  return `Ar${chunk()}${chunk()}!`.slice(0, 14);
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

  const tenants: PlatformTenantRow[] = [];
  for (const org of orgs || []) {
    const { data: sub } = await admin
      .from("subscriptions")
      .select("*")
      .eq("organization_id", org.id)
      .maybeSingle();
    const { data: membership } = await admin
      .from("memberships")
      .select("user_id, role")
      .eq("organization_id", org.id)
      .eq("role", "owner")
      .maybeSingle();

    let owner = null;
    let ownerAuthEmail: string | null = null;
    if (membership?.user_id) {
      const { data: profile } = await admin
        .from("profiles")
        .select("id, full_name, phone, email")
        .eq("id", membership.user_id)
        .maybeSingle();
      owner = profile;
      const { data: authUser } = await admin.auth.admin.getUserById(
        membership.user_id,
      );
      ownerAuthEmail = authUser.user?.email ?? null;
    }

    tenants.push({
      organization: org,
      subscription: sub,
      owner,
      ownerAuthEmail,
    });
  }

  return { tenants };
}

/** Approve onboarded org: start trial + issue login password for admin to send. */
export async function approveOrganizationAction(input: {
  organizationId: string;
  trialDays?: number;
  inventoryEnabled?: boolean;
  financeEnabled?: boolean;
  adminNotes?: string;
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

  const password = generatePassword();
  const { data: authUser, error: pwErr } = await admin.auth.admin.updateUserById(
    membership.user_id,
    { password, email_confirm: true },
  );
  if (pwErr) return { error: pwErr.message };

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  const days = input.trialDays ?? TRIAL_DAYS;
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + days);

  const inventory =
    input.inventoryEnabled ?? Boolean(sub?.inventory_enabled ?? true);
  const finance = input.financeEnabled ?? Boolean(sub?.finance_enabled ?? true);

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
      inventory_enabled: inventory,
      finance_enabled: finance,
      trial_ends_at: trialEnds.toISOString(),
      notes: input.adminNotes || `Trial started (${days} days)`,
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
    password,
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
  inventoryEnabled?: boolean;
  financeEnabled?: boolean;
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
        inventoryEnabled: input.inventoryEnabled,
        financeEnabled: input.financeEnabled,
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
  inventoryEnabled: boolean;
  financeEnabled: boolean;
  trialDays?: number;
  periodMonths?: number;
  notes?: string;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin, user } = gate;

  const patch: Record<string, unknown> = {
    status: input.status,
    inventory_enabled: input.inventoryEnabled,
    finance_enabled: input.financeEnabled,
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

  if (input.status === "trialing") {
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + (input.trialDays ?? TRIAL_DAYS));
    patch.trial_ends_at = trialEnds.toISOString();
  }

  if (input.status === "active") {
    const end = new Date();
    end.setMonth(end.getMonth() + (input.periodMonths ?? 1));
    patch.current_period_end = end.toISOString();
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
    { password },
  );
  if (error) return { error: error.message };

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
  created_at?: string;
  notes?: string | null;
  organizations?: { name?: string } | null;
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

/** Approve payment: mark proof approved and extend subscription by months. */
export async function approvePaymentProofAction(input: {
  proofId: string;
  months?: number;
  notes?: string;
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

  const base =
    sub.current_period_end && new Date(sub.current_period_end).getTime() > Date.now()
      ? new Date(sub.current_period_end)
      : sub.status === "trialing" &&
          new Date(sub.trial_ends_at).getTime() > Date.now()
        ? new Date(sub.trial_ends_at)
        : new Date();

  base.setMonth(base.getMonth() + months);

  const { error: subErr } = await admin
    .from("subscriptions")
    .update({
      status: "active",
      current_period_end: base.toISOString(),
      notes: input.notes?.trim() || `Extended +${months} month(s) from proof ${proof.id}`,
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
      notes: input.notes?.trim() || `Approved · +${months} month(s)`,
      months_requested: months,
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
