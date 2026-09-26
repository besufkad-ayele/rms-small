import {
  createPaidBill,
  deletePaidBill,
  listPaidBills,
  type PaidBill,
} from "@/lib/cloud-bills";
import {
  deleteInventory,
  deleteMenu,
  listInventoryChangedSince,
  listMenuChangedSince,
  upsertInventory,
  upsertMenu,
  type CloudInventoryItem,
  type CloudMenuItem,
} from "@/lib/cloud-catalog";
import {
  completeCloudSale,
  saveCloudDayClose,
  type CloudSaleOrder,
} from "@/lib/cloud-sales";
import {
  cacheCatalog,
  cacheInventory,
  cacheMenu,
  cachePaidBills,
  getCachedInventory,
  getCachedMenu,
  getCachedPaidBills,
  getCatalogSyncMeta,
  mergeInventoryCache,
  mergeMenuCache,
  setCatalogSyncMeta,
} from "./cache";
import { getConnectionSnapshot } from "./connection";
import { recordSaleLocally } from "./local-sale";
import { enqueueSyncAction } from "./queue";
import type { CompleteSalePayload, SaleLineInput } from "./types";

/** Force a full catalog re-download at most this often (unless Sync now). */
const FULL_PULL_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

function canReachCloud(): boolean {
  return getConnectionSnapshot().status !== "down";
}

function shouldPreferCloud(): boolean {
  return getConnectionSnapshot().fastEnough;
}

function latestUpdatedAt(
  rows: { updated_at?: string }[],
  fallback: string,
): string {
  let max = fallback;
  for (const row of rows) {
    if (row.updated_at && row.updated_at > max) max = row.updated_at;
  }
  return max;
}

/**
 * Pull only menu rows changed since last pull (B), or full menu if needed.
 * Merges into local cache.
 */
export async function pullMenuChanges(
  orgId: string,
  options?: { full?: boolean },
): Promise<CloudMenuItem[]> {
  const meta = await getCatalogSyncMeta(orgId);
  const cached = (await getCachedMenu(orgId)) || [];
  const wantFull =
    options?.full ||
    !meta.menuPulledAt ||
    cached.length === 0 ||
    (meta.lastFullPullAt
      ? Date.now() - new Date(meta.lastFullPullAt).getTime() > FULL_PULL_MAX_AGE_MS
      : true);

  const since = wantFull ? null : meta.menuPulledAt;
  const changed = await listMenuChangedSince(orgId, since);
  const next = wantFull
    ? changed
    : await mergeMenuCache(orgId, changed);

  if (wantFull) {
    await cacheMenu(orgId, next);
  }

  const pulledAt = latestUpdatedAt(changed, new Date().toISOString());
  await setCatalogSyncMeta(orgId, {
    menuPulledAt: pulledAt,
    ...(wantFull ? { lastFullPullAt: new Date().toISOString() } : {}),
  });
  return wantFull ? next : (await getCachedMenu(orgId)) || next;
}

export async function pullInventoryChanges(
  orgId: string,
  options?: { full?: boolean },
): Promise<CloudInventoryItem[]> {
  const meta = await getCatalogSyncMeta(orgId);
  const cached = (await getCachedInventory(orgId)) || [];
  const wantFull =
    options?.full ||
    !meta.inventoryPulledAt ||
    cached.length === 0 ||
    (meta.lastFullPullAt
      ? Date.now() - new Date(meta.lastFullPullAt).getTime() > FULL_PULL_MAX_AGE_MS
      : true);

  const since = wantFull ? null : meta.inventoryPulledAt;
  const changed = await listInventoryChangedSince(orgId, since);
  const next = wantFull
    ? changed
    : await mergeInventoryCache(orgId, changed);

  if (wantFull) {
    await cacheInventory(orgId, next);
  }

  const pulledAt = latestUpdatedAt(changed, new Date().toISOString());
  await setCatalogSyncMeta(orgId, {
    inventoryPulledAt: pulledAt,
    ...(wantFull ? { lastFullPullAt: new Date().toISOString() } : {}),
  });
  return wantFull ? next : (await getCachedInventory(orgId)) || next;
}

/**
 * A+B: return local cache immediately; if online, refresh only changes
 * in the background (or await when no cache yet).
 */
export async function loadMenuResilient(
  orgId: string,
  onFresh?: (menu: CloudMenuItem[]) => void,
): Promise<CloudMenuItem[]> {
  const cached = await getCachedMenu(orgId);
  if (cached && cached.length > 0) {
    if (canReachCloud()) {
      void pullMenuChanges(orgId)
        .then((fresh) => onFresh?.(fresh))
        .catch(() => undefined);
    }
    return cached;
  }

  if (!canReachCloud()) {
    throw new Error(
      "Menu is not on this device yet. Connect once to download it, then it works offline.",
    );
  }

  const fresh = await pullMenuChanges(orgId, { full: true });
  onFresh?.(fresh);
  return fresh;
}

export async function loadInventoryResilient(
  orgId: string,
  onFresh?: (items: CloudInventoryItem[]) => void,
): Promise<CloudInventoryItem[]> {
  const cached = await getCachedInventory(orgId);
  if (cached && cached.length > 0) {
    if (canReachCloud()) {
      void pullInventoryChanges(orgId)
        .then((fresh) => onFresh?.(fresh))
        .catch(() => undefined);
    }
    return cached;
  }

  if (!canReachCloud()) {
    throw new Error(
      "Inventory is not on this device yet. Connect once to download it.",
    );
  }

  const fresh = await pullInventoryChanges(orgId, { full: true });
  onFresh?.(fresh);
  return fresh;
}

export async function loadCatalogResilient(
  orgId: string,
  onFresh?: (bundle: {
    menu: CloudMenuItem[];
    inventory: CloudInventoryItem[];
  }) => void,
) {
  const [menuCached, invCached] = await Promise.all([
    getCachedMenu(orgId),
    getCachedInventory(orgId),
  ]);
  const hasCache =
    (menuCached && menuCached.length > 0) ||
    (invCached && invCached.length > 0);

  if (hasCache) {
    if (canReachCloud()) {
      void (async () => {
        const [menu, inventory] = await Promise.all([
          pullMenuChanges(orgId),
          pullInventoryChanges(orgId),
        ]);
        onFresh?.({ menu, inventory });
      })().catch(() => undefined);
    }
    return {
      menu: menuCached || [],
      inventory: invCached || [],
    };
  }

  if (!canReachCloud()) {
    throw new Error(
      "Catalog is not on this device yet. Connect once to download it.",
    );
  }

  const [menu, inventory] = await Promise.all([
    pullMenuChanges(orgId, { full: true }),
    pullInventoryChanges(orgId, { full: true }),
  ]);
  await cacheCatalog(orgId, { menu, inventory });
  onFresh?.({ menu, inventory });
  return { menu, inventory };
}

/** Prefetch full catalog while online (call after login). */
export async function prefetchCatalog(orgId: string): Promise<void> {
  if (!canReachCloud()) return;
  await Promise.all([
    pullMenuChanges(orgId, { full: true }),
    pullInventoryChanges(orgId, { full: true }),
  ]);
}

export async function completeSaleResilient(input: {
  orgId: string;
  lines: SaleLineInput[];
  paymentMethod: CompleteSalePayload["paymentMethod"];
  paymentReference?: string;
  cashierName: string;
  placeLabel?: string;
  kitchenNote?: string;
}): Promise<{ order: CloudSaleOrder; offlineQueued: boolean }> {
  const payload: CompleteSalePayload = {
    orgId: input.orgId,
    lines: input.lines,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference,
    cashierName: input.cashierName,
  };

  if (shouldPreferCloud()) {
    try {
      const order = await completeCloudSale(input);
      void pullMenuChanges(input.orgId).catch(() => undefined);
      void pullInventoryChanges(input.orgId).catch(() => undefined);
      return { order, offlineQueued: false };
    } catch {
      // Fall through — never lose the sale
    }
  }

  const localOrder = await recordSaleLocally(payload);
  await enqueueSyncAction(input.orgId, "COMPLETE_SALE", {
    ...payload,
    localOrder,
  });
  return { order: localOrder, offlineQueued: true };
}

export async function upsertInventoryResilient(
  orgId: string,
  input: Parameters<typeof upsertInventory>[1],
): Promise<{ offlineQueued: boolean }> {
  if (canReachCloud()) {
    try {
      await upsertInventory(orgId, input);
      await pullInventoryChanges(orgId, { full: true });
      return { offlineQueued: false };
    } catch {
      // queue
    }
  }
  await enqueueSyncAction(orgId, "UPSERT_INVENTORY", { orgId, input });
  return { offlineQueued: true };
}

export async function deleteInventoryResilient(
  orgId: string,
  id: string,
): Promise<{ offlineQueued: boolean }> {
  if (canReachCloud()) {
    try {
      await deleteInventory(orgId, id);
      const cached = (await getCachedInventory(orgId)) || [];
      await cacheInventory(
        orgId,
        cached.filter((i) => i.id !== id),
      );
      return { offlineQueued: false };
    } catch {
      // queue
    }
  }
  await enqueueSyncAction(orgId, "DELETE_INVENTORY", { orgId, id });
  const cached = (await getCachedInventory(orgId)) || [];
  await cacheInventory(
    orgId,
    cached.filter((i) => i.id !== id),
  );
  return { offlineQueued: true };
}

export async function upsertMenuResilient(
  orgId: string,
  input: Parameters<typeof upsertMenu>[1],
): Promise<{ offlineQueued: boolean }> {
  if (canReachCloud()) {
    try {
      await upsertMenu(orgId, input);
      // Only re-pull changes after a write (B) — full if first time
      await pullMenuChanges(orgId, { full: true });
      return { offlineQueued: false };
    } catch {
      // queue
    }
  }
  await enqueueSyncAction(orgId, "UPSERT_MENU", { orgId, input });
  return { offlineQueued: true };
}

export async function deleteMenuResilient(
  orgId: string,
  id: string,
): Promise<{ offlineQueued: boolean }> {
  if (canReachCloud()) {
    try {
      await deleteMenu(orgId, id);
      const cached = (await getCachedMenu(orgId)) || [];
      await cacheMenu(
        orgId,
        cached.filter((m) => m.id !== id),
      );
      return { offlineQueued: false };
    } catch {
      // queue
    }
  }
  await enqueueSyncAction(orgId, "DELETE_MENU", { orgId, id });
  const cached = (await getCachedMenu(orgId)) || [];
  await cacheMenu(
    orgId,
    cached.filter((m) => m.id !== id),
  );
  return { offlineQueued: true };
}

export async function saveDayCloseResilient(
  input: Parameters<typeof saveCloudDayClose>[0],
): Promise<{ offlineQueued: boolean }> {
  if (canReachCloud()) {
    try {
      await saveCloudDayClose(input);
      return { offlineQueued: false };
    } catch {
      // queue
    }
  }
  await enqueueSyncAction(input.orgId, "SAVE_DAY_CLOSE", input);
  return { offlineQueued: true };
}

export async function createPaidBillResilient(
  orgId: string,
  input: Parameters<typeof createPaidBill>[1],
): Promise<{ offlineQueued: boolean; bill?: PaidBill }> {
  if (canReachCloud()) {
    try {
      const bill = await createPaidBill(orgId, input);
      const bills = await listPaidBills(orgId);
      await cachePaidBills(orgId, bills);
      return { offlineQueued: false, bill };
    } catch {
      // queue
    }
  }
  await enqueueSyncAction(orgId, "CREATE_PAID_BILL", { orgId, input });
  return { offlineQueued: true };
}

export async function deletePaidBillResilient(
  orgId: string,
  id: string,
): Promise<{ offlineQueued: boolean }> {
  if (canReachCloud()) {
    try {
      await deletePaidBill(orgId, id);
      const bills = await listPaidBills(orgId);
      await cachePaidBills(orgId, bills);
      return { offlineQueued: false };
    } catch {
      // queue
    }
  }
  await enqueueSyncAction(orgId, "DELETE_PAID_BILL", { orgId, id });
  const cached = (await getCachedPaidBills(orgId)) || [];
  await cachePaidBills(
    orgId,
    cached.filter((b) => b.id !== id),
  );
  return { offlineQueued: true };
}

export async function loadPaidBillsResilient(
  orgId: string,
): Promise<PaidBill[]> {
  const cached = await getCachedPaidBills(orgId);
  if (cached && cached.length >= 0 && !canReachCloud()) {
    return cached;
  }
  if (cached && cached.length > 0 && canReachCloud()) {
    void listPaidBills(orgId)
      .then((bills) => cachePaidBills(orgId, bills))
      .catch(() => undefined);
    return cached;
  }
  try {
    const bills = await listPaidBills(orgId);
    await cachePaidBills(orgId, bills);
    return bills;
  } catch (err) {
    if (cached) return cached;
    throw err instanceof Error ? err : new Error("Bills unavailable offline");
  }
}
