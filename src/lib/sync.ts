import { db } from "./db";
import { getBusiness } from "./auth";

export interface SyncExportPayload {
  exportedAt: string;
  business: Awaited<ReturnType<typeof getBusiness>>;
  users: Awaited<ReturnType<typeof db.users.toArray>>;
  inventory: Awaited<ReturnType<typeof db.inventory.toArray>>;
  menu: Awaited<ReturnType<typeof db.menu.toArray>>;
  orders: Awaited<ReturnType<typeof db.orders.toArray>>;
  dayCloses: Awaited<ReturnType<typeof db.dayCloses.toArray>>;
  meta: Awaited<ReturnType<typeof db.meta.toArray>>;
}

/** Build a full local backup. Call this before any destructive clear. */
export async function buildSyncExport(): Promise<SyncExportPayload> {
  const [business, users, inventory, menu, orders, dayCloses, meta] =
    await Promise.all([
      getBusiness(),
      db.users.toArray(),
      db.inventory.toArray(),
      db.menu.toArray(),
      db.orders.toArray(),
      db.dayCloses.toArray(),
      db.meta.toArray(),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    business,
    users: users.map((u) => ({ ...u, passwordHash: "[redacted]" })),
    inventory,
    menu,
    orders,
    dayCloses,
    meta,
  };
}

export async function downloadSyncExport(): Promise<void> {
  const payload = await buildSyncExport();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `rms-small-sync-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);

  const business = await getBusiness();
  if (business) {
    await db.business.put({
      ...business,
      lastSyncedAt: new Date().toISOString(),
    });
  }

  const closes = await db.dayCloses.toArray();
  await db.dayCloses.bulkPut(closes.map((c) => ({ ...c, synced: true })));
}

/**
 * Destructive wipe — only allowed after a sync export has run
 * (lastSyncedAt must be set and newer than last order/day-close).
 */
export async function clearLocalDataAfterSync(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const business = await getBusiness();
  if (!business?.lastSyncedAt) {
    return {
      ok: false,
      error: "Sync first. Export a backup before clearing this device.",
    };
  }

  const lastSynced = new Date(business.lastSyncedAt).getTime();
  const latestOrder = await db.orders.orderBy("createdAt").reverse().first();
  const latestClose = await db.dayCloses.orderBy("closedAt").reverse().first();
  const latestActivity = Math.max(
    latestOrder ? new Date(latestOrder.createdAt).getTime() : 0,
    latestClose ? new Date(latestClose.closedAt).getTime() : 0,
  );

  if (latestActivity > lastSynced) {
    return {
      ok: false,
      error:
        "New sales happened after the last sync. Export again, then clear.",
    };
  }

  await db.delete();
  return { ok: true };
}
