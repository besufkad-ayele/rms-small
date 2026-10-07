import {
  createPaidBill,
  deletePaidBill,
} from "@/lib/cloud-bills";
import {
  deleteInventory,
  deleteMenu,
  upsertInventory,
  upsertMenu,
} from "@/lib/cloud-catalog";
import {
  completeCloudSale,
  saveCloudDayClose,
  saveCloudXReport,
} from "@/lib/cloud-sales";
import {
  listSyncQueue,
  removeSyncQueueItem,
  resetStuckSyncing,
  resetSyncRetries,
  updateSyncQueueItem,
} from "./queue";
import type {
  CompleteSalePayload,
  SyncQueueItem,
  SyncResult,
} from "./types";

const MAX_RETRIES_PERMANENT = 8;
const MAX_RETRIES_TRANSIENT = 40;

function isTransientError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("network") ||
    m.includes("timeout") ||
    m.includes("abort") ||
    m.includes("offline") ||
    m.includes("load failed") ||
    m.includes("fetch")
  );
}

function maxRetriesFor(message: string | undefined): number {
  return message && isTransientError(message)
    ? MAX_RETRIES_TRANSIENT
    : MAX_RETRIES_PERMANENT;
}

function linesForPush(payload: CompleteSalePayload) {
  if (payload.lines.length > 0) return payload.lines;
  const raw = payload.localOrder?.lines || payload.localOrder?.sale_order_lines || [];
  return raw.map((l) => ({
    menuItem: {
      id: l.menu_item_id || "",
      organization_id: payload.orgId,
      name: l.name,
      category: "other" as const,
      price: Number(l.unit_price),
      available: true,
      description: "",
      vote_count: 0,
      recipe: [],
    },
    quantity: Math.max(1, Math.round(Number(l.quantity))),
  }));
}

/**
 * Push a locally recorded sale to Supabase.
 * Idempotent on client_order_id via completeCloudSale / complete_sale RPC.
 */
async function pushLocalSale(payload: CompleteSalePayload) {
  const order = payload.localOrder;
  if (!order) throw new Error("Missing local order for sync.");

  const lines = linesForPush(payload);
  if (lines.length === 0) throw new Error("Sale has no lines to sync.");

  const source = order.source === "online" ? "online" : "pos";
  await completeCloudSale({
    orgId: payload.orgId,
    lines,
    paymentMethod: order.payment_method,
    paymentReference: order.payment_reference ?? payload.paymentReference,
    paymentProofUrl: order.payment_proof_url ?? payload.paymentProofUrl,
    cashierName: order.cashier_name || payload.cashierName,
    placeLabel: order.place_label ?? payload.placeLabel,
    kitchenNote: order.kitchen_note ?? payload.kitchenNote,
    markPaid: Boolean(payload.markPaid || order.payment_status === "paid"),
    clientOrderId: order.id,
    createdAt: order.created_at,
    source,
    guestName: order.guest_name,
    guestPhone: order.guest_phone,
    guestNote: order.guest_note,
    dayKey: order.day_key,
  });
}

async function runItem(item: SyncQueueItem): Promise<void> {
  switch (item.actionType) {
    case "COMPLETE_SALE": {
      await pushLocalSale(item.payload as CompleteSalePayload);
      break;
    }
    case "UPSERT_INVENTORY": {
      const p = item.payload as {
        orgId: string;
        input: Parameters<typeof upsertInventory>[1];
      };
      await upsertInventory(p.orgId, p.input);
      break;
    }
    case "DELETE_INVENTORY": {
      const p = item.payload as { orgId: string; id: string };
      await deleteInventory(p.orgId, p.id);
      break;
    }
    case "UPSERT_MENU": {
      const p = item.payload as {
        orgId: string;
        input: Parameters<typeof upsertMenu>[1];
      };
      await upsertMenu(p.orgId, p.input);
      break;
    }
    case "DELETE_MENU": {
      const p = item.payload as { orgId: string; id: string };
      await deleteMenu(p.orgId, p.id);
      break;
    }
    case "SAVE_DAY_CLOSE": {
      const p = item.payload as Parameters<typeof saveCloudDayClose>[0];
      await saveCloudDayClose(p);
      break;
    }
    case "SAVE_X_REPORT": {
      const p = item.payload as Parameters<typeof saveCloudXReport>[0];
      await saveCloudXReport(p);
      break;
    }
    case "CREATE_PAID_BILL": {
      const p = item.payload as {
        orgId: string;
        input: Parameters<typeof createPaidBill>[1];
      };
      await createPaidBill(p.orgId, p.input);
      break;
    }
    case "DELETE_PAID_BILL": {
      const p = item.payload as { orgId: string; id: string };
      await deletePaidBill(p.orgId, p.id);
      break;
    }
    default:
      throw new Error(`Unknown sync action: ${item.actionType as string}`);
  }
}

export async function processSyncQueue(
  orgId?: string,
  options?: { resetFailed?: boolean },
): Promise<SyncResult> {
  await resetStuckSyncing(orgId);
  if (options?.resetFailed) {
    await resetSyncRetries(orgId);
  }

  const queue = await listSyncQueue(orgId);
  const pending = queue.filter(
    (i) => i.status === "pending" || i.status === "failed",
  );
  const result: SyncResult = {
    totalProcessed: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  for (const item of pending) {
    const limit = maxRetriesFor(item.errorMessage);
    if (item.retryCount >= limit) {
      result.failed++;
      result.errors.push(
        item.errorMessage
          ? `${item.actionType}: ${item.errorMessage}`
          : `${item.actionType} exceeded max retries`,
      );
      await updateSyncQueueItem(item.id, {
        status: "failed",
        errorMessage: item.errorMessage || "Exceeded max retries",
      });
      continue;
    }

    result.totalProcessed++;
    await updateSyncQueueItem(item.id, { status: "syncing" });

    try {
      await runItem(item);
      await removeSyncQueueItem(item.id);
      result.succeeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      await updateSyncQueueItem(item.id, {
        status: "pending",
        errorMessage: message,
        incrementRetry: true,
      });
      result.failed++;
      result.errors.push(`${item.actionType}: ${message}`);
    }
  }

  return result;
}
