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
import { saveCloudDayClose } from "@/lib/cloud-sales";
import { createClient } from "@/lib/supabase/client";
import type { CloudSaleOrder } from "@/lib/cloud-sales";
import {
  listSyncQueue,
  removeSyncQueueItem,
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

/**
 * Push a locally recorded sale to Supabase.
 * Idempotent: safe to retry if order header landed but lines did not.
 */
async function pushLocalSale(payload: CompleteSalePayload) {
  const order = payload.localOrder;
  if (!order) throw new Error("Missing local order for sync.");
  if (!order.receipt_number) throw new Error("Missing receipt number for sync.");

  const supabase = createClient();
  const orderLines = (order.lines || []).map((l) => ({
    menu_item_id: l.menu_item_id || null,
    name: l.name,
    unit_price: Number(l.unit_price),
    quantity: Math.max(1, Math.round(Number(l.quantity))),
    line_total: Number(l.line_total),
  }));

  if (orderLines.length === 0) {
    throw new Error("Sale has no lines to sync.");
  }

  const findExisting = async () => {
    const { data, error } = await supabase
      .from("sale_orders")
      .select("id")
      .eq("organization_id", payload.orgId)
      .eq("receipt_number", order.receipt_number)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as { id: string } | null;
  };

  let existing = await findExisting();
  let orderId = existing?.id ?? null;

  if (!orderId) {
    const { data: inserted, error } = await supabase
      .from("sale_orders")
      .insert({
        organization_id: payload.orgId,
        receipt_number: order.receipt_number,
        subtotal: Number(order.subtotal),
        service_charge: Number(order.service_charge),
        vat: Number(order.vat),
        total: Number(order.total),
        payment_method: order.payment_method,
        payment_reference: order.payment_reference,
        cashier_name: order.cashier_name || "Cashier",
        day_key: order.day_key,
        created_at: order.created_at,
      })
      .select("id")
      .single();

    if (error) {
      // Race: another attempt inserted the same receipt
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
        existing = await findExisting();
        orderId = existing?.id ?? null;
        if (!orderId) throw new Error(error.message);
      } else {
        throw new Error(error.message || "Sale sync failed");
      }
    } else {
      orderId = inserted.id;
    }
  }

  const { count, error: countErr } = await supabase
    .from("sale_order_lines")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  if (countErr) throw new Error(countErr.message);

  const needsLines = !count || count === 0;
  if (needsLines) {
    const { error: lineErr } = await supabase.from("sale_order_lines").insert(
      orderLines.map((l) => ({ ...l, order_id: orderId })),
    );
    if (lineErr) throw new Error(lineErr.message);
  }

  // Only adjust stock/votes the first time lines land (avoid double deduction).
  if (needsLines) {
    const sourceLines =
      payload.lines?.length > 0
        ? payload.lines
        : orderLines.map((l) => ({
            menuItem: {
              id: l.menu_item_id || "",
              organization_id: payload.orgId,
              name: l.name,
              category: "other" as const,
              price: l.unit_price,
              available: true,
              description: "",
              vote_count: 0,
              recipe: [] as {
                inventory_item_id: string;
                quantity_required: number;
              }[],
            },
            quantity: l.quantity,
          }));

    for (const line of sourceLines) {
      if (!line.menuItem?.id) continue;
      const { data: menuRow } = await supabase
        .from("menu_items")
        .select("vote_count")
        .eq("id", line.menuItem.id)
        .maybeSingle();
      if (menuRow) {
        await supabase
          .from("menu_items")
          .update({
            vote_count: (menuRow.vote_count || 0) + line.quantity,
            updated_at: new Date().toISOString(),
          })
          .eq("id", line.menuItem.id);
      }

      for (const recipe of line.menuItem.recipe || []) {
        const { data: inv } = await supabase
          .from("inventory_items")
          .select("stock_qty")
          .eq("id", recipe.inventory_item_id)
          .maybeSingle();
        if (!inv) continue;
        const next = Math.max(
          0,
          Number(inv.stock_qty) - recipe.quantity_required * line.quantity,
        );
        await supabase
          .from("inventory_items")
          .update({
            stock_qty: Math.round(next * 1000) / 1000,
            updated_at: new Date().toISOString(),
          })
          .eq("id", recipe.inventory_item_id);
      }
    }
  }

  return { id: orderId } as CloudSaleOrder;
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
  if (options?.resetFailed) {
    await resetSyncRetries(orgId);
  }

  const queue = await listSyncQueue(orgId);
  const pending = queue.filter((i) => i.status !== "syncing");
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
