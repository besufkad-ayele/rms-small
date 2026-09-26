import { db } from "@/lib/db";
import { uid } from "@/lib/utils";
import type {
  SyncActionType,
  SyncQueueItem,
  SyncQueueStatus,
} from "./types";

export async function enqueueSyncAction(
  orgId: string,
  actionType: SyncActionType,
  payload: unknown,
): Promise<SyncQueueItem> {
  const item: SyncQueueItem = {
    id: uid("sync"),
    orgId,
    actionType,
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
  };
  await db.syncQueue.put(item);
  return item;
}

export async function listSyncQueue(orgId?: string): Promise<SyncQueueItem[]> {
  const all = await db.syncQueue.orderBy("createdAt").toArray();
  if (!orgId) return all;
  return all.filter((i) => i.orgId === orgId);
}

export async function countPendingSync(orgId?: string): Promise<number> {
  const items = await listSyncQueue(orgId);
  return items.filter((i) => i.status !== "syncing").length;
}

export async function updateSyncQueueItem(
  id: string,
  patch: {
    status?: SyncQueueStatus;
    errorMessage?: string;
    incrementRetry?: boolean;
  },
): Promise<void> {
  const item = await db.syncQueue.get(id);
  if (!item) return;
  await db.syncQueue.put({
    ...item,
    status: patch.status ?? item.status,
    errorMessage: patch.errorMessage ?? item.errorMessage,
    retryCount: patch.incrementRetry ? item.retryCount + 1 : item.retryCount,
  });
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  await db.syncQueue.delete(id);
}

/** Manual Sync now — give failed / exhausted items another chance. */
export async function resetSyncRetries(orgId?: string): Promise<void> {
  const items = await listSyncQueue(orgId);
  await Promise.all(
    items.map((item) =>
      db.syncQueue.put({
        ...item,
        retryCount: 0,
        status: "pending",
      }),
    ),
  );
}

export async function getSyncQueueErrors(
  orgId?: string,
): Promise<{ actionType: string; errorMessage: string }[]> {
  const items = await listSyncQueue(orgId);
  return items
    .filter((i) => i.errorMessage)
    .map((i) => ({
      actionType: i.actionType,
      errorMessage: i.errorMessage || "",
    }));
}
