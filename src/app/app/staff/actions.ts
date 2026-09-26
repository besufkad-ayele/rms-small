"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  defaultPermissionsForRole,
  maxStaffSeats,
  permissionsFromFlags,
  type StaffPermissions,
} from "@/lib/permissions";
import type { MemberRole, Subscription } from "@/lib/tenant";

export type StaffMemberRow = {
  membershipId: string;
  userId: string;
  role: MemberRole;
  active: boolean;
  fullName: string;
  email: string | null;
  phone: string | null;
  permissions: StaffPermissions;
  createdAt: string;
};

async function requireOrgOwner(): Promise<
  | {
      user: { id: string };
      admin: ReturnType<typeof createAdminClient>;
      organizationId: string;
      subscription: Subscription;
    }
  | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("memberships")
    .select("*")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership || membership.active === false) {
    return { error: "Only the business owner can manage staff." };
  }

  const { data: subscription } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", membership.organization_id)
    .single();

  if (!subscription) {
    return { error: "Subscription not found." };
  }

  return {
    user,
    admin,
    organizationId: membership.organization_id as string,
    subscription: subscription as Subscription,
  };
}

export async function getStaffSeatInfoAction(): Promise<
  | { seatsUsed: number; seatsMax: number; planCode: string }
  | { error: string }
> {
  const gate = await requireOrgOwner();
  if ("error" in gate) return { error: gate.error };
  const { admin, organizationId, subscription } = gate;

  const { count, error } = await admin
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .neq("role", "owner")
    .eq("active", true);
  if (error) return { error: error.message };

  return {
    seatsUsed: count ?? 0,
    seatsMax: maxStaffSeats(subscription),
    planCode: subscription.plan_code,
  };
}

export async function listStaffAction(): Promise<
  { staff: StaffMemberRow[] } | { error: string }
> {
  const gate = await requireOrgOwner();
  if ("error" in gate) return { error: gate.error };
  const { admin, organizationId } = gate;

  const { data: rows, error } = await admin
    .from("memberships")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error) return { error: error.message };

  const staff: StaffMemberRow[] = [];
  for (const m of rows || []) {
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, phone, email")
      .eq("id", m.user_id)
      .maybeSingle();
    const { data: authUser } = await admin.auth.admin.getUserById(m.user_id);
    staff.push({
      membershipId: m.id,
      userId: m.user_id,
      role: m.role,
      active: m.active !== false,
      fullName: profile?.full_name || "Team member",
      email: authUser.user?.email || profile?.email || null,
      phone: profile?.phone || null,
      permissions: permissionsFromFlags(m),
      createdAt: m.created_at,
    });
  }
  return { staff };
}

export async function createStaffAction(input: {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  role: Exclude<MemberRole, "owner">;
  permissions?: Partial<StaffPermissions>;
}): Promise<
  | { ok: true; email: string; password: string; fullName: string }
  | { error: string }
> {
  const gate = await requireOrgOwner();
  if ("error" in gate) return { error: gate.error };
  const { user, admin, organizationId, subscription } = gate;

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const password = input.password;
  if (!fullName) return { error: "Name is required." };
  if (!email || !email.includes("@")) return { error: "Valid email is required." };
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }
  if (input.role === ("owner" as MemberRole)) {
    return { error: "Cannot create another owner this way." };
  }

  const seatsMax = maxStaffSeats(subscription);
  const { count } = await admin
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .neq("role", "owner")
    .eq("active", true);
  if ((count ?? 0) >= seatsMax) {
    return {
      error: `Staff seat limit reached (${seatsMax}). Upgrade your package for more seats.`,
    };
  }

  const defaults = defaultPermissionsForRole(input.role);
  const perms = permissionsFromFlags({ ...defaults, ...input.permissions });
  // Never grant staff management / billing unless explicitly toggled by owner
  if (!input.permissions?.can_manage_staff) perms.can_manage_staff = false;
  if (!input.permissions?.can_billing) perms.can_billing = false;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      phone: input.phone?.trim() || null,
      staff_of: organizationId,
    },
  });
  if (createErr || !created.user) {
    return { error: createErr?.message || "Could not create login." };
  }

  const userId = created.user.id;

  await admin.from("profiles").upsert({
    id: userId,
    full_name: fullName,
    phone: input.phone?.trim() || null,
    email,
    updated_at: new Date().toISOString(),
  });

  const { error: memErr } = await admin.from("memberships").insert({
    organization_id: organizationId,
    user_id: userId,
    role: input.role,
    ...perms,
    active: true,
    invited_by: user.id,
  });
  if (memErr) {
    await admin.auth.admin.deleteUser(userId);
    return { error: memErr.message };
  }

  return { ok: true, email, password, fullName };
}

export async function updateStaffPermissionsAction(input: {
  membershipId: string;
  role?: Exclude<MemberRole, "owner">;
  permissions: Partial<StaffPermissions>;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireOrgOwner();
  if ("error" in gate) return { error: gate.error };
  const { admin, organizationId } = gate;

  const { data: row } = await admin
    .from("memberships")
    .select("*")
    .eq("id", input.membershipId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!row) return { error: "Staff member not found." };
  if (row.role === "owner") {
    return { error: "Owner permissions cannot be changed here." };
  }

  const perms = permissionsFromFlags({ ...row, ...input.permissions });
  const { error } = await admin
    .from("memberships")
    .update({
      ...(input.role ? { role: input.role } : {}),
      ...perms,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.membershipId);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function setStaffActiveAction(input: {
  membershipId: string;
  active: boolean;
}): Promise<{ ok: true } | { error: string }> {
  const gate = await requireOrgOwner();
  if ("error" in gate) return { error: gate.error };
  const { admin, organizationId, subscription } = gate;

  const { data: row } = await admin
    .from("memberships")
    .select("*")
    .eq("id", input.membershipId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!row) return { error: "Staff member not found." };
  if (row.role === "owner") return { error: "Cannot deactivate the owner." };

  if (input.active) {
    const seatsMax = maxStaffSeats(subscription);
    const { count } = await admin
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .neq("role", "owner")
      .eq("active", true);
    if ((count ?? 0) >= seatsMax) {
      return {
        error: `Staff seat limit reached (${seatsMax}). Upgrade to reactivate.`,
      };
    }
  }

  const { error } = await admin
    .from("memberships")
    .update({
      active: input.active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.membershipId);
  if (error) return { error: error.message };

  // Block / allow auth login
  await admin.auth.admin.updateUserById(row.user_id, {
    ban_duration: input.active ? "none" : "876000h",
  });

  return { ok: true };
}

export async function resetStaffPasswordAction(input: {
  membershipId: string;
  password: string;
}): Promise<{ ok: true; password: string } | { error: string }> {
  const gate = await requireOrgOwner();
  if ("error" in gate) return { error: gate.error };
  const { admin, organizationId } = gate;

  if (input.password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const { data: row } = await admin
    .from("memberships")
    .select("*")
    .eq("id", input.membershipId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!row) return { error: "Staff member not found." };
  if (row.role === "owner") {
    return { error: "Reset the owner password from account settings." };
  }

  const { error } = await admin.auth.admin.updateUserById(row.user_id, {
    password: input.password,
    email_confirm: true,
  });
  if (error) return { error: error.message };
  return { ok: true, password: input.password };
}
