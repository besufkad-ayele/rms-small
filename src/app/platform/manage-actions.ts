"use server";

import { approvePaymentProofAction } from "@/app/platform/actions";
import {
  BACKUP_TTL_DAYS,
  expandResetSelection,
  RESET_CATEGORIES,
  RESET_CATEGORY_IDS,
  type ResetCategory,
} from "@/lib/org-data-reset";
import {
  backupRowCounts,
  captureOrgResetBackup,
  previewBackupPayload,
  purgeAtFromNow,
  purgeBackupArtifacts,
  purgeExpiredOrgBackups,
  restoreOrgResetBackup,
  toBackupSummary,
  type BackupPreviewItem,
  type OrgBackupPayload,
  type OrgDataBackupSummary,
} from "@/lib/org-data-backup";
import {
  fetchAllRows,
  removeStorageFolder,
  requirePlatformAdmin,
  storagePathFromUrl,
  type AdminClient,
} from "@/lib/platform-admin";
import type { PaymentMethod } from "@/lib/tenant";

export type { BackupPreviewItem, OrgDataBackupSummary } from "@/lib/org-data-backup";

const PAYMENT_METHODS: PaymentMethod[] = ["cash", "cbe", "telebirr", "other"];
const CHUNK = 200;

function now() {
  return new Date().toISOString();
}

async function orgIds(admin: AdminClient, table: string, orgId: string) {
  const res = await fetchAllRows<{ id: string }>((from, to) =>
    admin.from(table).select("id").eq("organization_id", orgId).range(from, to),
  );
  return res.rows.map((r) => r.id);
}

async function countIn(
  admin: AdminClient,
  table: string,
  column: string,
  ids: string[],
) {
  let total = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { count } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .in(column, ids.slice(i, i + CHUNK));
    total += count ?? 0;
  }
  return total;
}

async function deleteIn(
  admin: AdminClient,
  table: string,
  column: string,
  ids: string[],
) {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { error } = await admin
      .from(table)
      .delete()
      .in(column, ids.slice(i, i + CHUNK));
    if (error) return error.message;
  }
  return null;
}

async function countOrg(
  admin: AdminClient,
  table: string,
  orgId: string,
  filter?: { eq?: [string, unknown]; neq?: [string, unknown] },
) {
  let q = admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if (filter?.eq) q = q.eq(filter.eq[0], filter.eq[1]);
  if (filter?.neq) q = q.neq(filter.neq[0], filter.neq[1]);
  const { count } = await q;
  return count ?? 0;
}

/** Delete auth users that no longer belong to any org (never platform admins). */
async function deleteOrphanLogins(admin: AdminClient, userIds: string[]) {
  let deleted = 0;
  for (const uid of new Set(userIds)) {
    const { count } = await admin
      .from("memberships")
      .select("*", { count: "exact", head: true })
      .eq("user_id", uid);
    if ((count ?? 0) > 0) continue;
    const { data: profile } = await admin
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", uid)
      .maybeSingle();
    if (profile?.is_platform_admin) continue;
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (!error) deleted += 1;
  }
  return deleted;
}

async function loadOrgName(admin: AdminClient, orgId: string) {
  const { data } = await admin
    .from("organizations")
    .select("id, name, business_license_url, id_document_url")
    .eq("id", orgId)
    .maybeSingle();
  return data;
}

function nameMatches(expected: string, typed: string) {
  return expected.trim().toLowerCase() === typed.trim().toLowerCase();
}

// ═══════════════════════════════════════
// Restaurant (organization)
// ═══════════════════════════════════════

const ORG_EDITABLE = [
  "name",
  "org_type",
  "phone",
  "email",
  "address",
  "city",
  "region",
  "country",
  "tin",
  "vat_number",
  "website",
] as const;

export type OrgEditableField = (typeof ORG_EDITABLE)[number];

export async function updateOrganizationAction(input: {
  organizationId: string;
  fields: Partial<Record<OrgEditableField, string>>;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };

  const patch: Record<string, string | null> = {};
  for (const key of ORG_EDITABLE) {
    const v = input.fields[key];
    if (v === undefined) continue;
    patch[key] = v.trim() || null;
  }
  if ("name" in patch && !patch.name) return { error: "Name is required" };
  if (
    "org_type" in patch &&
    !["cafe", "restaurant", "other"].includes(String(patch.org_type))
  ) {
    return { error: "Invalid business type" };
  }
  const { error } = await gate.admin
    .from("organizations")
    .update({ ...patch, updated_at: now() })
    .eq("id", input.organizationId);
  if (error) return { error: error.message };
  return { ok: true as const };
}

export async function updateAdminNotesAction(input: {
  organizationId: string;
  notes: string;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { error } = await gate.admin
    .from("organizations")
    .update({ admin_notes: input.notes.trim() || null, updated_at: now() })
    .eq("id", input.organizationId);
  if (error) return { error: error.message };
  return { ok: true as const };
}

export async function deleteOrganizationAction(input: {
  organizationId: string;
  confirmName: string;
  deleteLogins: boolean;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin } = gate;

  const org = await loadOrgName(admin, input.organizationId);
  if (!org) return { error: "Restaurant not found" };
  if (!nameMatches(String(org.name), input.confirmName)) {
    return { error: "Typed name does not match the restaurant name" };
  }

  const { data: members } = await admin
    .from("memberships")
    .select("user_id")
    .eq("organization_id", input.organizationId);
  const userIds = (members || []).map((m) => m.user_id as string);

  await removeStorageFolder(admin, "menu-images", input.organizationId);
  await removeStorageFolder(admin, "payment-proofs", input.organizationId);
  const kyc = [org.business_license_url, org.id_document_url]
    .map((p) => storagePathFromUrl(p as string | null, "kyc-docs"))
    .filter((p): p is string => Boolean(p));
  if (kyc.length) await admin.storage.from("kyc-docs").remove(kyc);

  const { error } = await admin
    .from("organizations")
    .delete()
    .eq("id", input.organizationId);
  if (error) return { error: error.message };

  const loginsDeleted = input.deleteLogins
    ? await deleteOrphanLogins(admin, userIds)
    : 0;
  return { ok: true as const, loginsDeleted };
}

export async function setOwnerPasswordAction(input: {
  organizationId: string;
  password: string;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin } = gate;
  const password = input.password.trim();
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }
  const { data: membership } = await admin
    .from("memberships")
    .select("user_id")
    .eq("organization_id", input.organizationId)
    .eq("role", "owner")
    .maybeSingle();
  if (!membership) return { error: "Owner not found" };

  const { data: authUser, error } = await admin.auth.admin.updateUserById(
    membership.user_id,
    { password, email_confirm: true },
  );
  if (error) return { error: error.message };

  const { error: storeErr } = await admin
    .from("organizations")
    .update({ platform_login_password: password, updated_at: now() })
    .eq("id", input.organizationId);

  return {
    ok: true as const,
    email: authUser.user.email ?? null,
    password,
    stored: !storeErr,
  };
}

// ═══════════════════════════════════════
// Staff (memberships)
// ═══════════════════════════════════════

export type OrgMemberRow = {
  id: string;
  userId: string;
  role: string;
  active: boolean;
  fullName: string;
  phone: string | null;
  email: string | null;
  lastSignInAt: string | null;
  createdAt: string | null;
};

export async function listOrgMembersAction(organizationId: string): Promise<
  { members: OrgMemberRow[] } | { error: string }
> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin } = gate;

  const { data, error } = await admin
    .from("memberships")
    .select("id, user_id, role, active, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error) return { error: error.message };
  const rows = data || [];
  const ids = rows.map((r) => r.user_id as string);
  const { data: profiles } = ids.length
    ? await admin.from("profiles").select("id, full_name, phone").in("id", ids)
    : { data: [] };
  const profileById = new Map((profiles || []).map((p) => [p.id as string, p]));

  const members = await Promise.all(
    rows.map(async (r) => {
      const uid = r.user_id as string;
      let email: string | null = null;
      let lastSignInAt: string | null = null;
      try {
        const { data: u } = await admin.auth.admin.getUserById(uid);
        email = u.user?.email ?? null;
        lastSignInAt = u.user?.last_sign_in_at ?? null;
      } catch {
        /* auth user may be gone */
      }
      const p = profileById.get(uid);
      return {
        id: r.id as string,
        userId: uid,
        role: String(r.role),
        active: r.active !== false,
        fullName: String(p?.full_name || "—"),
        phone: (p?.phone as string | null) ?? null,
        email,
        lastSignInAt,
        createdAt: (r.created_at as string | null) ?? null,
      };
    }),
  );
  return { members };
}

export async function setMemberActiveAction(input: {
  membershipId: string;
  active: boolean;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { data: m } = await gate.admin
    .from("memberships")
    .select("role")
    .eq("id", input.membershipId)
    .maybeSingle();
  if (!m) return { error: "Member not found" };
  if (m.role === "owner") return { error: "The owner cannot be deactivated" };
  const { error } = await gate.admin
    .from("memberships")
    .update({ active: input.active })
    .eq("id", input.membershipId);
  if (error) return { error: error.message };
  return { ok: true as const };
}

export async function removeMemberAction(input: {
  membershipId: string;
  deleteLogin: boolean;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin } = gate;
  const { data: m } = await admin
    .from("memberships")
    .select("role, user_id")
    .eq("id", input.membershipId)
    .maybeSingle();
  if (!m) return { error: "Member not found" };
  if (m.role === "owner") {
    return { error: "The owner cannot be removed — delete the restaurant instead" };
  }
  const { error } = await admin
    .from("memberships")
    .delete()
    .eq("id", input.membershipId);
  if (error) return { error: error.message };
  const loginsDeleted = input.deleteLogin
    ? await deleteOrphanLogins(admin, [m.user_id as string])
    : 0;
  return { ok: true as const, loginsDeleted };
}

// ═══════════════════════════════════════
// Subscription payments
// ═══════════════════════════════════════

export async function createPaymentAction(input: {
  organizationId: string;
  amount: number;
  months: number;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  packageCode?: string | null;
  approveNow: boolean;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  if (!PAYMENT_METHODS.includes(input.method)) {
    return { error: "Invalid payment method" };
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) return { error: "Invalid amount" };
  const months = Math.min(12, Math.max(1, Math.floor(input.months || 1)));

  const { data, error } = await gate.admin
    .from("payment_proofs")
    .insert({
      organization_id: input.organizationId,
      amount,
      method: input.method,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || "Recorded by platform admin",
      months_requested: months,
      package_code: input.packageCode || null,
      expected_amount_etb: amount,
      status: "pending",
      submitted_by: gate.user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message || "Could not record payment" };

  if (!input.approveNow) return { ok: true as const, proofId: data.id as string };

  const res = await approvePaymentProofAction({
    proofId: data.id as string,
    months,
    notes: input.notes,
    packageCode: input.packageCode || null,
  });
  if ("error" in res) {
    return {
      error: `Payment saved as pending, but approval failed: ${res.error}`,
    };
  }
  return {
    ok: true as const,
    proofId: data.id as string,
    periodEnd: res.periodEnd,
  };
}

export async function updatePaymentAction(input: {
  proofId: string;
  amount: number;
  months: number;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  if (!PAYMENT_METHODS.includes(input.method)) {
    return { error: "Invalid payment method" };
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) return { error: "Invalid amount" };
  const { error } = await gate.admin
    .from("payment_proofs")
    .update({
      amount,
      months_requested: Math.min(12, Math.max(1, Math.floor(input.months || 1))),
      method: input.method,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .eq("id", input.proofId);
  if (error) return { error: error.message };
  return { ok: true as const };
}

/** Rejected → pending, so it can be reviewed again. */
export async function reopenPaymentAction(proofId: string) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { data, error } = await gate.admin
    .from("payment_proofs")
    .update({ status: "pending", reviewed_by: null, reviewed_at: null })
    .eq("id", proofId)
    .eq("status", "rejected")
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only rejected payments can be reopened" };
  return { ok: true as const };
}

export async function deletePaymentAction(input: {
  proofId: string;
  deleteFile: boolean;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin } = gate;
  const { data: proof } = await admin
    .from("payment_proofs")
    .select("id, image_url")
    .eq("id", input.proofId)
    .maybeSingle();
  if (!proof) return { error: "Payment not found" };

  const { error } = await admin
    .from("payment_proofs")
    .delete()
    .eq("id", input.proofId);
  if (error) return { error: error.message };

  if (input.deleteFile) {
    const path = storagePathFromUrl(proof.image_url as string | null, "payment-proofs");
    if (path) await admin.storage.from("payment-proofs").remove([path]);
  }
  return { ok: true as const };
}

// ═══════════════════════════════════════
// Packages
// ═══════════════════════════════════════

export async function deletePackageAction(packageId: string) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin } = gate;
  const { data: pkg } = await admin
    .from("subscription_packages")
    .select("code")
    .eq("id", packageId)
    .maybeSingle();
  if (!pkg) return { error: "Package not found" };

  const { count } = await admin
    .from("subscriptions")
    .select("*", { count: "exact", head: true })
    .or(`plan_code.eq.${pkg.code},package_code.eq.${pkg.code}`);
  if ((count ?? 0) > 0) {
    return {
      error: `${count} subscriber(s) are on this package. Move them first, or deactivate it instead.`,
    };
  }
  const { error } = await admin
    .from("subscription_packages")
    .delete()
    .eq("id", packageId);
  if (error) return { error: error.message };
  return { ok: true as const };
}

// ═══════════════════════════════════════
// Restaurant data reset
// ═══════════════════════════════════════

export async function getOrgDataCountsAction(organizationId: string): Promise<
  { counts: Record<ResetCategory, number> } | { error: string }
> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin } = gate;
  const id = organizationId;

  const [menuIds, invIds] = await Promise.all([
    orgIds(admin, "menu_items", id),
    orgIds(admin, "inventory_items", id),
  ]);

  const [
    sales,
    meta,
    closes,
    xReports,
    expenses,
    moves,
    costHistory,
    recipes,
    suppliers,
    units,
    staff,
    payments,
  ] = await Promise.all([
    countOrg(admin, "sale_orders", id),
    admin.from("org_meta").select("receipt_seq").eq("organization_id", id).maybeSingle(),
    countOrg(admin, "day_closes", id),
    countOrg(admin, "x_reports", id),
    countOrg(admin, "paid_bills", id),
    countOrg(admin, "inventory_movements", id),
    countIn(admin, "inventory_cost_history", "inventory_item_id", invIds),
    countIn(admin, "menu_recipes", "menu_item_id", menuIds),
    countOrg(admin, "inventory_suppliers", id),
    countOrg(admin, "inventory_units", id, { eq: ["is_builtin", false] }),
    countOrg(admin, "memberships", id, { neq: ["role", "owner"] }),
    countOrg(admin, "payment_proofs", id),
  ]);

  return {
    counts: {
      sales,
      receipt_counter: Number(meta.data?.receipt_seq ?? 0),
      day_closes: closes + xReports,
      expenses,
      stock_movements: moves,
      cost_history: costHistory,
      recipes,
      menu: menuIds.length,
      inventory: invIds.length,
      suppliers,
      units,
      staff,
      subscription_payments: payments,
    },
  };
}

export async function resetOrgDataAction(input: {
  organizationId: string;
  categories: ResetCategory[];
  confirmName: string;
  keepBackup?: boolean;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin, user } = gate;
  const id = input.organizationId;
  const keepBackup = input.keepBackup !== false;

  const org = await loadOrgName(admin, id);
  if (!org) return { error: "Restaurant not found" };
  if (!nameMatches(String(org.name), input.confirmName)) {
    return { error: "Typed name does not match the restaurant name" };
  }

  const valid = input.categories.filter((c) => RESET_CATEGORY_IDS.includes(c));
  const selected = expandResetSelection(valid);
  if (!selected.size) return { error: "Pick at least one kind of data" };

  await purgeExpiredOrgBackups(admin, id);

  let backupId: string | null = null;
  if (keepBackup) {
    const { data: inserted, error: insErr } = await admin
      .from("org_data_backups")
      .insert({
        organization_id: id,
        created_by: user.id,
        categories: [...selected],
        row_counts: {},
        payload: {},
        purge_at: purgeAtFromNow(),
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      return {
        error:
          insErr?.message?.includes("org_data_backups") ||
          insErr?.message?.includes("schema cache")
            ? "Database needs an update. Apply migration 20261007_org_data_backups.sql, then retry."
            : insErr?.message || "Could not start backup",
      };
    }
    backupId = inserted.id as string;
    const captured = await captureOrgResetBackup(admin, id, backupId, selected);
    if (captured.error) {
      await purgeBackupArtifacts(admin, backupId, captured.payload);
      await admin.from("org_data_backups").delete().eq("id", backupId);
      return { error: `Backup failed, nothing was deleted: ${captured.error}` };
    }
    const { error: saveErr } = await admin
      .from("org_data_backups")
      .update({
        payload: captured.payload,
        row_counts: backupRowCounts(captured.payload),
      })
      .eq("id", backupId);
    if (saveErr) {
      await purgeBackupArtifacts(admin, backupId, captured.payload);
      await admin.from("org_data_backups").delete().eq("id", backupId);
      return { error: `Backup failed, nothing was deleted: ${saveErr.message}` };
    }
  }

  const done: ResetCategory[] = [];
  const fail = (step: ResetCategory, message: string) => ({
    error: `Stopped at "${RESET_CATEGORIES.find((c) => c.id === step)?.label}": ${message}`,
    done,
    backupId,
    backupUntil: keepBackup ? purgeAtFromNow() : null,
  });
  const delOrg = async (table: string) => {
    const { error } = await admin.from(table).delete().eq("organization_id", id);
    return error?.message ?? null;
  };

  const menuIds = selected.has("recipes") ? await orgIds(admin, "menu_items", id) : [];
  const invIds =
    selected.has("cost_history") || selected.has("recipes")
      ? await orgIds(admin, "inventory_items", id)
      : [];

  for (const def of RESET_CATEGORIES) {
    const step = def.id;
    if (!selected.has(step)) continue;
    let err: string | null = null;
    switch (step) {
      case "sales":
        err = await delOrg("sale_orders");
        if (!err) await removeStorageFolder(admin, "payment-proofs", `${id}/sales`);
        break;
      case "receipt_counter": {
        const { error } = await admin
          .from("org_meta")
          .update({ receipt_seq: 0 })
          .eq("organization_id", id);
        err = error?.message ?? null;
        break;
      }
      case "day_closes":
        err = (await delOrg("day_closes")) || (await delOrg("x_reports"));
        break;
      case "expenses":
        err = await delOrg("paid_bills");
        break;
      case "stock_movements":
        err = await delOrg("inventory_movements");
        break;
      case "cost_history":
        err = await deleteIn(admin, "inventory_cost_history", "inventory_item_id", invIds);
        break;
      case "recipes":
        err =
          (await deleteIn(admin, "menu_recipes", "menu_item_id", menuIds)) ||
          (await deleteIn(admin, "menu_recipes", "inventory_item_id", invIds));
        break;
      case "menu":
        err = await delOrg("menu_items");
        if (!err) await removeStorageFolder(admin, "menu-images", id);
        break;
      case "inventory":
        err = await delOrg("inventory_items");
        break;
      case "suppliers":
        err = await delOrg("inventory_suppliers");
        break;
      case "units": {
        const { error } = await admin
          .from("inventory_units")
          .delete()
          .eq("organization_id", id)
          .eq("is_builtin", false);
        err = error?.message ?? null;
        break;
      }
      case "staff": {
        const { data: staff } = await admin
          .from("memberships")
          .select("user_id")
          .eq("organization_id", id)
          .neq("role", "owner");
        const { error } = await admin
          .from("memberships")
          .delete()
          .eq("organization_id", id)
          .neq("role", "owner");
        err = error?.message ?? null;
        if (!err && !keepBackup) {
          await deleteOrphanLogins(
            admin,
            (staff || []).map((s) => s.user_id as string),
          );
        }
        break;
      }
      case "subscription_payments":
        err = await delOrg("payment_proofs");
        if (!err) {
          await removeStorageFolder(admin, "payment-proofs", id, {
            skipFolders: ["sales", RECYCLE_FOLDER],
          });
        }
        break;
    }
    if (err) return fail(step, err);
    done.push(step);
  }

  await admin
    .from("organizations")
    .update({ updated_at: now() })
    .eq("id", id);
  return {
    ok: true as const,
    done,
    backupId,
    backupDays: keepBackup ? BACKUP_TTL_DAYS : 0,
  };
}

const RECYCLE_FOLDER = "_recycle";

export async function listOrgDataBackupsAction(organizationId: string): Promise<
  { error: string } | { backups: OrgDataBackupSummary[] }
> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  await purgeExpiredOrgBackups(gate.admin, organizationId);
  const { data, error } = await gate.admin
    .from("org_data_backups")
    .select("id, categories, row_counts, created_at, purge_at, restored_at, purged_at")
    .eq("organization_id", organizationId)
    .is("purged_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    if (
      error.message.includes("org_data_backups") ||
      error.message.includes("schema cache")
    ) {
      return { backups: [] };
    }
    return { error: error.message };
  }
  const now = Date.now();
  return {
    backups: (data || [])
      .filter((r) => new Date(String(r.purge_at)).getTime() > now)
      .map((r) =>
        toBackupSummary({
          id: String(r.id),
          categories: (r.categories || []) as string[],
          row_counts: (r.row_counts || {}) as Record<string, number>,
          created_at: String(r.created_at),
          purge_at: String(r.purge_at),
          restored_at: r.restored_at ? String(r.restored_at) : null,
        }),
      ),
  };
}

export async function getOrgDataBackupPreviewAction(input: {
  backupId: string;
  organizationId: string;
}): Promise<
  | { error: string }
  | {
      backup: OrgDataBackupSummary;
      items: BackupPreviewItem[];
    }
> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { data: row, error } = await gate.admin
    .from("org_data_backups")
    .select("id, categories, row_counts, created_at, purge_at, restored_at, payload, purged_at")
    .eq("id", input.backupId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!row || row.purged_at) return { error: "Backup not found" };
  const payload = (row.payload || {}) as OrgBackupPayload;
  const categories = (row.categories || []) as ResetCategory[];
  return {
    backup: toBackupSummary({
      id: String(row.id),
      categories,
      row_counts: (row.row_counts || {}) as Record<string, number>,
      created_at: String(row.created_at),
      purge_at: String(row.purge_at),
      restored_at: row.restored_at ? String(row.restored_at) : null,
    }),
    items: previewBackupPayload(payload, categories),
  };
}

export async function restoreOrgDataBackupAction(input: {
  backupId: string;
  organizationId: string;
  categories?: ResetCategory[];
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin } = gate;
  await purgeExpiredOrgBackups(admin, input.organizationId);

  const { data: row, error } = await admin
    .from("org_data_backups")
    .select("*")
    .eq("id", input.backupId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!row) return { error: "Backup not found" };
  if (row.purged_at) return { error: "This backup was already permanently removed" };
  if (new Date(String(row.purge_at)).getTime() <= Date.now()) {
    await purgeBackupArtifacts(
      admin,
      row.id,
      (row.payload as OrgBackupPayload | null) ?? null,
    );
    await admin
      .from("org_data_backups")
      .update({ purged_at: now(), payload: {} })
      .eq("id", row.id);
    return { error: "This backup expired after 3 days and has been removed" };
  }

  const restored = await restoreOrgResetBackup(
    admin,
    input.organizationId,
    row.payload as OrgBackupPayload,
    input.categories,
  );
  if (restored.error) return { error: restored.error };

  await admin
    .from("org_data_backups")
    .update({
      restored_at: now(),
      restore_note: restored.note || null,
    })
    .eq("id", row.id);
  await admin
    .from("organizations")
    .update({ updated_at: now() })
    .eq("id", input.organizationId);
  return { ok: true as const, note: restored.note || null };
}

export async function discardOrgDataBackupAction(input: {
  backupId: string;
  organizationId: string;
}) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { admin } = gate;
  const { data: row, error } = await admin
    .from("org_data_backups")
    .select("id, payload, purged_at")
    .eq("id", input.backupId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!row) return { error: "Backup not found" };
  if (row.purged_at) return { ok: true as const };
  await purgeBackupArtifacts(
    admin,
    row.id,
    (row.payload as OrgBackupPayload | null) ?? null,
  );
  const { error: upd } = await admin
    .from("org_data_backups")
    .update({ purged_at: now(), payload: {} })
    .eq("id", row.id);
  if (upd) return { error: upd.message };
  return { ok: true as const };
}
