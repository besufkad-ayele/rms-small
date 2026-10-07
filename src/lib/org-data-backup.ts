import { BACKUP_TTL_DAYS, type ResetCategory } from "@/lib/org-data-reset";
import {
  copyStorageFolder,
  fetchAllRows,
  removeStorageFolder,
  type AdminClient,
} from "@/lib/platform-admin";

const CHUNK = 200;
export const RECYCLE_PREFIX = "_recycle";

export type StorageMove = {
  bucket: string;
  fromPrefix: string;
  toPrefix: string;
  skipFolders?: string[];
};

export type OrgBackupPayload = {
  version: 1;
  tables: Record<string, Record<string, unknown>[]>;
  orgMeta?: { receipt_seq: number };
  storage: StorageMove[];
};

export type OrgDataBackupSummary = {
  id: string;
  categories: ResetCategory[];
  rowCounts: Record<string, number>;
  createdAt: string;
  purgeAt: string;
  restoredAt: string | null;
  hoursLeft: number;
};

const RESTORE_TABLES = [
  "inventory_units",
  "inventory_suppliers",
  "inventory_items",
  "inventory_cost_history",
  "inventory_movements",
  "menu_items",
  "menu_recipes",
  "sale_orders",
  "sale_order_lines",
  "day_closes",
  "x_reports",
  "paid_bills",
  "payment_proofs",
  "memberships",
] as const;

const OPTIONAL_FKS: Record<string, string[]> = {
  inventory_items: ["default_supplier_id"],
  inventory_movements: ["supplier_id", "buyer_user_id", "issued_by_user_id"],
  sale_order_lines: ["menu_item_id"],
  paid_bills: ["created_by"],
  payment_proofs: ["submitted_by", "reviewed_by"],
  memberships: ["invited_by"],
};

type Row = Record<string, unknown>;

async function fetchOrg(
  admin: AdminClient,
  table: string,
  orgId: string,
  filter?: { eq?: [string, unknown]; neq?: [string, unknown] },
) {
  const res = await fetchAllRows<Row>((from, to) => {
    let q = admin.from(table).select("*").eq("organization_id", orgId);
    if (filter?.eq) q = q.eq(filter.eq[0], filter.eq[1]);
    if (filter?.neq) q = q.neq(filter.neq[0], filter.neq[1]);
    return q.range(from, to);
  });
  return res;
}

async function fetchIn(
  admin: AdminClient,
  table: string,
  column: string,
  ids: string[],
) {
  const rows: Row[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const res = await fetchAllRows<Row>((from, to) =>
      admin.from(table).select("*").in(column, slice).range(from, to),
    );
    if (res.error) return res;
    rows.push(...res.rows);
  }
  return { rows, error: null as string | null };
}

function idsOf(rows: Row[]) {
  return rows.map((r) => String(r.id));
}

function recyclePrefix(backupId: string, fromPrefix: string) {
  return `${RECYCLE_PREFIX}/${backupId}/${fromPrefix}`;
}

/** Snapshot selected tables + copy related files aside. Does not delete live data. */
export async function captureOrgResetBackup(
  admin: AdminClient,
  orgId: string,
  backupId: string,
  selected: Set<ResetCategory>,
): Promise<{ payload: OrgBackupPayload; error: string | null }> {
  const tables: OrgBackupPayload["tables"] = {};
  const storage: StorageMove[] = [];
  const put = (table: string, rows: Row[]) => {
    if (rows.length) tables[table] = rows;
  };

  const menuRes = await fetchOrg(admin, "menu_items", orgId);
  if (menuRes.error) return { payload: emptyPayload(), error: menuRes.error };
  const invRes = await fetchOrg(admin, "inventory_items", orgId);
  if (invRes.error) return { payload: emptyPayload(), error: invRes.error };
  const menuIds = idsOf(menuRes.rows);
  const invIds = idsOf(invRes.rows);

  if (selected.has("units")) {
    const res = await fetchOrg(admin, "inventory_units", orgId, {
      eq: ["is_builtin", false],
    });
    if (res.error) return { payload: emptyPayload(), error: res.error };
    put("inventory_units", res.rows);
  }
  if (selected.has("suppliers")) {
    const res = await fetchOrg(admin, "inventory_suppliers", orgId);
    if (res.error) return { payload: emptyPayload(), error: res.error };
    put("inventory_suppliers", res.rows);
  }
  if (selected.has("inventory")) put("inventory_items", invRes.rows);
  if (selected.has("cost_history") && invIds.length) {
    const res = await fetchIn(admin, "inventory_cost_history", "inventory_item_id", invIds);
    if (res.error) return { payload: emptyPayload(), error: res.error };
    put("inventory_cost_history", res.rows);
  }
  if (selected.has("stock_movements")) {
    const res = await fetchOrg(admin, "inventory_movements", orgId);
    if (res.error) return { payload: emptyPayload(), error: res.error };
    put("inventory_movements", res.rows);
  }
  if (selected.has("menu")) put("menu_items", menuRes.rows);
  if (selected.has("recipes")) {
    const byMenu = menuIds.length
      ? await fetchIn(admin, "menu_recipes", "menu_item_id", menuIds)
      : { rows: [] as Row[], error: null };
    if (byMenu.error) return { payload: emptyPayload(), error: byMenu.error };
    const byInv = invIds.length
      ? await fetchIn(admin, "menu_recipes", "inventory_item_id", invIds)
      : { rows: [] as Row[], error: null };
    if (byInv.error) return { payload: emptyPayload(), error: byInv.error };
    const seen = new Set<string>();
    const recipes: Row[] = [];
    for (const row of [...byMenu.rows, ...byInv.rows]) {
      const id = String(row.id);
      if (seen.has(id)) continue;
      seen.add(id);
      recipes.push(row);
    }
    put("menu_recipes", recipes);
  }
  if (selected.has("sales")) {
    const orders = await fetchOrg(admin, "sale_orders", orgId);
    if (orders.error) return { payload: emptyPayload(), error: orders.error };
    put("sale_orders", orders.rows);
    const orderIds = idsOf(orders.rows);
    if (orderIds.length) {
      const lines = await fetchIn(admin, "sale_order_lines", "order_id", orderIds);
      if (lines.error) return { payload: emptyPayload(), error: lines.error };
      put("sale_order_lines", lines.rows);
    }
  }
  if (selected.has("day_closes")) {
    const closes = await fetchOrg(admin, "day_closes", orgId);
    if (closes.error) return { payload: emptyPayload(), error: closes.error };
    put("day_closes", closes.rows);
    const x = await fetchOrg(admin, "x_reports", orgId);
    if (x.error) return { payload: emptyPayload(), error: x.error };
    put("x_reports", x.rows);
  }
  if (selected.has("expenses")) {
    const res = await fetchOrg(admin, "paid_bills", orgId);
    if (res.error) return { payload: emptyPayload(), error: res.error };
    put("paid_bills", res.rows);
  }
  if (selected.has("subscription_payments")) {
    const res = await fetchOrg(admin, "payment_proofs", orgId);
    if (res.error) return { payload: emptyPayload(), error: res.error };
    put("payment_proofs", res.rows);
  }
  if (selected.has("staff")) {
    const res = await fetchOrg(admin, "memberships", orgId, {
      neq: ["role", "owner"],
    });
    if (res.error) return { payload: emptyPayload(), error: res.error };
    put("memberships", res.rows);
  }

  let orgMeta: OrgBackupPayload["orgMeta"];
  if (selected.has("receipt_counter")) {
    const { data } = await admin
      .from("org_meta")
      .select("receipt_seq")
      .eq("organization_id", orgId)
      .maybeSingle();
    orgMeta = { receipt_seq: Number(data?.receipt_seq ?? 0) };
  }

  if (selected.has("menu")) {
    storage.push({
      bucket: "menu-images",
      fromPrefix: orgId,
      toPrefix: recyclePrefix(backupId, orgId),
    });
  }
  if (selected.has("sales")) {
    storage.push({
      bucket: "payment-proofs",
      fromPrefix: `${orgId}/sales`,
      toPrefix: recyclePrefix(backupId, `${orgId}/sales`),
    });
  }
  if (selected.has("subscription_payments")) {
    storage.push({
      bucket: "payment-proofs",
      fromPrefix: orgId,
      toPrefix: recyclePrefix(backupId, orgId),
      skipFolders: ["sales"],
    });
  }

  for (const move of storage) {
    const copied = await copyStorageFolder(
      admin,
      move.bucket,
      move.fromPrefix,
      move.toPrefix,
      move.skipFolders ? { skipFolders: move.skipFolders } : undefined,
    );
    if (copied.error) {
      return { payload: emptyPayload(), error: copied.error };
    }
  }

  return {
    payload: { version: 1, tables, orgMeta, storage },
    error: null,
  };
}

function emptyPayload(): OrgBackupPayload {
  return { version: 1, tables: {}, storage: [] };
}

export function backupRowCounts(payload: OrgBackupPayload) {
  const counts: Record<string, number> = {};
  for (const [table, rows] of Object.entries(payload.tables)) {
    counts[table] = rows.length;
  }
  if (payload.orgMeta) counts.receipt_seq = payload.orgMeta.receipt_seq;
  return counts;
}

export function purgeAtFromNow(now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() + BACKUP_TTL_DAYS);
  return d.toISOString();
}

function hoursLeft(purgeAt: string, now = Date.now()) {
  return Math.max(0, Math.round((new Date(purgeAt).getTime() - now) / 3_600_000));
}

export function toBackupSummary(row: {
  id: string;
  categories: string[] | null;
  row_counts: Record<string, number> | null;
  created_at: string;
  purge_at: string;
  restored_at: string | null;
}): OrgDataBackupSummary {
  return {
    id: row.id,
    categories: (row.categories || []) as ResetCategory[],
    rowCounts: row.row_counts || {},
    createdAt: row.created_at,
    purgeAt: row.purge_at,
    restoredAt: row.restored_at,
    hoursLeft: hoursLeft(row.purge_at),
  };
}

async function insertRows(admin: AdminClient, table: string, rows: Row[]) {
  if (!rows.length) return null;
  const optional = OPTIONAL_FKS[table] || [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const first = await admin.from(table).upsert(chunk, { onConflict: "id" });
    if (!first.error) continue;
    if (!optional.length) return first.error.message;
    const softened = chunk.map((row) => {
      const next = { ...row };
      for (const key of optional) next[key] = null;
      return next;
    });
    const retry = await admin.from(table).upsert(softened, { onConflict: "id" });
    if (retry.error) return retry.error.message;
  }
  return null;
}

/** Put backed-up rows and files back. Live rows with the same ids are replaced. */
export async function restoreOrgResetBackup(
  admin: AdminClient,
  orgId: string,
  payload: OrgBackupPayload,
  categories?: ResetCategory[],
): Promise<{ error: string | null; note?: string }> {
  const filtered =
    categories && categories.length
      ? filterBackupPayload(payload, categories)
      : payload;
  return restoreFiltered(admin, orgId, filtered);
}

async function restoreFiltered(
  admin: AdminClient,
  orgId: string,
  payload: OrgBackupPayload,
): Promise<{ error: string | null; note?: string }> {
  const notes: string[] = [];
  const memberships = payload.tables.memberships || [];
  if (memberships.length) {
    const userIds = memberships.map((m) => String(m.user_id)).filter(Boolean);
    const existing = new Set<string>();
    for (let i = 0; i < userIds.length; i += CHUNK) {
      const { data } = await admin
        .from("profiles")
        .select("id")
        .in("id", userIds.slice(i, i + CHUNK));
      for (const p of data || []) existing.add(String(p.id));
    }
    const keep = memberships.filter((m) => existing.has(String(m.user_id)));
    const skipped = memberships.length - keep.length;
    payload.tables.memberships = keep;
    if (skipped) {
      notes.push(
        `${skipped} staff login(s) no longer exist and could not be restored`,
      );
    }
    if (keep.length) {
      const restoreUsers = keep.map((m) => String(m.user_id));
      for (let i = 0; i < restoreUsers.length; i += CHUNK) {
        await admin
          .from("memberships")
          .delete()
          .eq("organization_id", orgId)
          .neq("role", "owner")
          .in("user_id", restoreUsers.slice(i, i + CHUNK));
      }
    }
  }

  if ((payload.tables.sale_orders || []).length) {
    const { data: live } = await admin
      .from("sale_orders")
      .select("id, receipt_number")
      .eq("organization_id", orgId);
    const backupIds = new Set(
      (payload.tables.sale_orders || []).map((r) => String(r.id)),
    );
    const clashes = (live || []).filter(
      (r) =>
        !backupIds.has(String(r.id)) &&
        (payload.tables.sale_orders || []).some(
          (b) => String(b.receipt_number) === String(r.receipt_number),
        ),
    );
    if (clashes.length) {
      const sample = clashes
        .slice(0, 5)
        .map((r) => `#${r.receipt_number}`)
        .join(", ");
      return {
        error: `New sales were created after this reset (${sample}). Reset sales again first, then restore.`,
      };
    }
  }

  for (const table of RESTORE_TABLES) {
    const rows = payload.tables[table];
    if (!rows?.length) continue;
    const err = await insertRows(admin, table, rows);
    if (err) return { error: `Could not restore ${table}: ${err}` };
  }

  if (payload.orgMeta) {
    const { data: meta } = await admin
      .from("org_meta")
      .select("receipt_seq")
      .eq("organization_id", orgId)
      .maybeSingle();
    const next = Math.max(
      Number(meta?.receipt_seq ?? 0),
      payload.orgMeta.receipt_seq,
    );
    const { error } = await admin
      .from("org_meta")
      .update({ receipt_seq: next })
      .eq("organization_id", orgId);
    if (error) return { error: error.message };
  }

  for (const move of payload.storage || []) {
    const copied = await copyStorageFolder(
      admin,
      move.bucket,
      move.toPrefix,
      move.fromPrefix,
      move.skipFolders ? { skipFolders: move.skipFolders } : undefined,
    );
    if (copied.error) {
      notes.push(`Files for ${move.bucket} could not all be copied back`);
    }
  }

  return { error: null, note: notes.length ? notes.join(". ") : undefined };
}

const CATEGORY_TABLES: Record<ResetCategory, string[]> = {
  sales: ["sale_orders", "sale_order_lines"],
  receipt_counter: [],
  day_closes: ["day_closes", "x_reports"],
  expenses: ["paid_bills"],
  stock_movements: ["inventory_movements"],
  cost_history: ["inventory_cost_history"],
  recipes: ["menu_recipes"],
  menu: ["menu_items"],
  inventory: ["inventory_items"],
  suppliers: ["inventory_suppliers"],
  units: ["inventory_units"],
  staff: ["memberships"],
  subscription_payments: ["payment_proofs"],
};

const SAMPLE_FIELD: Record<string, string> = {
  menu_items: "name",
  sale_orders: "receipt_number",
  paid_bills: "title",
  inventory_items: "name",
  inventory_suppliers: "name",
  inventory_units: "label",
  day_closes: "day_key",
  x_reports: "day_key",
  payment_proofs: "reference",
};

export function filterBackupPayload(
  payload: OrgBackupPayload,
  selected: Iterable<ResetCategory>,
): OrgBackupPayload {
  const want = new Set(selected);
  const tables: OrgBackupPayload["tables"] = {};
  for (const cat of want) {
    for (const table of CATEGORY_TABLES[cat] || []) {
      if (payload.tables[table]) tables[table] = payload.tables[table];
    }
  }
  const storage = (payload.storage || []).filter((move) => {
    if (move.bucket === "menu-images") return want.has("menu");
    if (move.fromPrefix.includes("/sales")) return want.has("sales");
    return want.has("subscription_payments");
  });
  return {
    version: 1,
    tables,
    orgMeta: want.has("receipt_counter") ? payload.orgMeta : undefined,
    storage,
  };
}

export type BackupPreviewItem = {
  category: ResetCategory;
  count: number;
  samples: string[];
};

export function previewBackupPayload(
  payload: OrgBackupPayload,
  categories: ResetCategory[],
): BackupPreviewItem[] {
  return categories.map((category) => {
    const tables = CATEGORY_TABLES[category] || [];
    let count = 0;
    const samples: string[] = [];
    for (const table of tables) {
      const rows = payload.tables[table] || [];
      count += rows.length;
      const field = SAMPLE_FIELD[table];
      if (field) {
        for (const row of rows) {
          if (samples.length >= 8) break;
          const v = row[field];
          if (v) samples.push(String(v));
        }
      }
    }
    if (category === "receipt_counter" && payload.orgMeta) {
      count = 1;
      samples.push(`receipt #${payload.orgMeta.receipt_seq}`);
    }
    return { category, count, samples };
  });
}

export async function purgeBackupArtifacts(
  admin: AdminClient,
  backupId: string,
  payload: OrgBackupPayload | null,
) {
  const seen = new Set<string>();
  for (const move of payload?.storage || []) {
    const key = `${move.bucket}:${move.toPrefix}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await removeStorageFolder(admin, move.bucket, move.toPrefix);
  }
  if (!payload?.storage?.length) {
    await removeStorageFolder(admin, "menu-images", `${RECYCLE_PREFIX}/${backupId}`);
    await removeStorageFolder(
      admin,
      "payment-proofs",
      `${RECYCLE_PREFIX}/${backupId}`,
    );
  }
}

export async function purgeExpiredOrgBackups(admin: AdminClient, orgId?: string) {
  let q = admin
    .from("org_data_backups")
    .select("id, payload")
    .is("purged_at", null)
    .lte("purge_at", new Date().toISOString());
  if (orgId) q = q.eq("organization_id", orgId);
  const { data, error } = await q;
  if (error || !data?.length) return { purged: 0, error: error?.message ?? null };
  let purged = 0;
  for (const row of data) {
    await purgeBackupArtifacts(
      admin,
      row.id,
      (row.payload as OrgBackupPayload | null) ?? null,
    );
    const { error: upd } = await admin
      .from("org_data_backups")
      .update({ purged_at: new Date().toISOString(), payload: {} })
      .eq("id", row.id);
    if (!upd) purged += 1;
  }
  return { purged, error: null as string | null };
}
