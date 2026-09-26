import type { CloudInventoryItem, CloudMenuItem } from "@/lib/cloud-catalog";
import type { PaidBill } from "@/lib/cloud-bills";
import { db } from "@/lib/db";
import type { CatalogBundle } from "./types";

function menuKey(orgId: string) {
  return `menu:${orgId}`;
}
function inventoryKey(orgId: string) {
  return `inventory:${orgId}`;
}
function billsKey(orgId: string) {
  return `bills:${orgId}`;
}
function syncMetaKey(orgId: string) {
  return `syncMeta:${orgId}`;
}

export type CatalogSyncMeta = {
  menuPulledAt: string | null;
  inventoryPulledAt: string | null;
  lastFullPullAt: string | null;
};

async function putCache(key: string, orgId: string, data: unknown) {
  await db.cloudCache.put({
    key,
    orgId,
    updatedAt: new Date().toISOString(),
    data,
  });
}

async function getCache<T>(key: string): Promise<T | null> {
  const row = await db.cloudCache.get(key);
  return (row?.data as T) ?? null;
}

export async function getCatalogSyncMeta(
  orgId: string,
): Promise<CatalogSyncMeta> {
  return (
    (await getCache<CatalogSyncMeta>(syncMetaKey(orgId))) || {
      menuPulledAt: null,
      inventoryPulledAt: null,
      lastFullPullAt: null,
    }
  );
}

export async function setCatalogSyncMeta(
  orgId: string,
  patch: Partial<CatalogSyncMeta>,
) {
  const prev = await getCatalogSyncMeta(orgId);
  await putCache(syncMetaKey(orgId), orgId, { ...prev, ...patch });
}

export async function cacheMenu(orgId: string, menu: CloudMenuItem[]) {
  await putCache(menuKey(orgId), orgId, menu);
}

export async function cacheInventory(
  orgId: string,
  inventory: CloudInventoryItem[],
) {
  await putCache(inventoryKey(orgId), orgId, inventory);
}

export async function cacheCatalog(orgId: string, bundle: CatalogBundle) {
  await Promise.all([
    cacheMenu(orgId, bundle.menu),
    cacheInventory(orgId, bundle.inventory),
  ]);
}

export async function getCachedMenu(
  orgId: string,
): Promise<CloudMenuItem[] | null> {
  return getCache<CloudMenuItem[]>(menuKey(orgId));
}

export async function getCachedInventory(
  orgId: string,
): Promise<CloudInventoryItem[] | null> {
  return getCache<CloudInventoryItem[]>(inventoryKey(orgId));
}

export async function cachePaidBills(orgId: string, bills: PaidBill[]) {
  await putCache(billsKey(orgId), orgId, bills);
}

export async function getCachedPaidBills(
  orgId: string,
): Promise<PaidBill[] | null> {
  return getCache<PaidBill[]>(billsKey(orgId));
}

/** Merge changed rows into the local menu cache (A+B incremental). */
export async function mergeMenuCache(
  orgId: string,
  changed: CloudMenuItem[],
): Promise<CloudMenuItem[]> {
  const prev = (await getCachedMenu(orgId)) || [];
  if (changed.length === 0) return prev;
  const map = new Map(prev.map((m) => [m.id, m]));
  for (const row of changed) map.set(row.id, row);
  const next = [...map.values()].sort(
    (a, b) => (b.vote_count || 0) - (a.vote_count || 0),
  );
  await cacheMenu(orgId, next);
  return next;
}

export async function mergeInventoryCache(
  orgId: string,
  changed: CloudInventoryItem[],
): Promise<CloudInventoryItem[]> {
  const prev = (await getCachedInventory(orgId)) || [];
  if (changed.length === 0) return prev;
  const map = new Map(prev.map((i) => [i.id, i]));
  for (const row of changed) map.set(row.id, row);
  const next = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  await cacheInventory(orgId, next);
  return next;
}

/** Apply local stock deductions after an offline sale. */
export async function applyLocalStockDeduction(
  orgId: string,
  lines: { menuItem: CloudMenuItem; quantity: number }[],
) {
  const inventory = (await getCachedInventory(orgId)) || [];
  const menu = (await getCachedMenu(orgId)) || [];
  const invMap = new Map(inventory.map((i) => [i.id, { ...i }]));
  const menuMap = new Map(menu.map((m) => [m.id, { ...m }]));
  const now = new Date().toISOString();

  for (const line of lines) {
    const m = menuMap.get(line.menuItem.id);
    if (m) {
      m.vote_count = (m.vote_count || 0) + line.quantity;
      m.updated_at = now;
      menuMap.set(m.id, m);
    }
    for (const recipe of line.menuItem.recipe || []) {
      const inv = invMap.get(recipe.inventory_item_id);
      if (!inv) continue;
      const next = Math.max(
        0,
        Number(inv.stock_qty) - recipe.quantity_required * line.quantity,
      );
      inv.stock_qty = Math.round(next * 1000) / 1000;
      inv.updated_at = now;
      invMap.set(inv.id, inv);
    }
  }

  await cacheCatalog(orgId, {
    menu: [...menuMap.values()],
    inventory: [...invMap.values()],
  });
}
