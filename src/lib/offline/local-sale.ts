import { computeBill } from "@/lib/money";
import type { CloudSaleOrder } from "@/lib/cloud-sales";
import { getOrgReceiptSettings } from "@/lib/org-tax";
import { dayKey } from "@/lib/utils";
import { db, getMeta } from "@/lib/db";
import { applyLocalStockDeduction } from "./cache";
import type { CompleteSalePayload } from "./types";
import { ensureClientOrderId } from "./sale-identity";

async function nextLocalReceipt(orgId: string): Promise<string> {
  return db.transaction("rw", db.meta, async () => {
    const meta = await getMeta();
    const next = meta.receiptSeq + 1;
    await db.meta.put({ ...meta, receiptSeq: next });
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    return `AR-${stamp}-${String(next).padStart(4, "0")}-${orgId.slice(0, 4)}`;
  });
}

/**
 * Persist a sale on-device so financial data is never lost when the
 * network is down. Returns a CloudSaleOrder-shaped record for receipts.
 * Rates come from finance receipt settings cache (same source as online).
 */
export async function recordSaleLocally(
  input: CompleteSalePayload,
): Promise<CloudSaleOrder> {
  if (input.lines.length === 0) throw new Error("Cart is empty.");

  const orderLines = input.lines.map(({ menuItem, quantity }) => ({
    menu_item_id: menuItem.id,
    name: menuItem.name,
    unit_price: menuItem.price,
    quantity,
    line_total: Math.round(menuItem.price * quantity * 100) / 100,
  }));
  const subtotal = orderLines.reduce((s, l) => s + l.line_total, 0);
  const tax = await getOrgReceiptSettings(input.orgId);
  const bill = computeBill(subtotal, {
    vatPercent: tax.vat_percent,
    servicePercent: tax.service_percent,
  });
  const now = new Date();
  const receipt =
    input.localOrder?.receipt_number || (await nextLocalReceipt(input.orgId));
  const paid = Boolean(input.markPaid);
  const id = ensureClientOrderId(input.localOrder?.id);

  const order: CloudSaleOrder = {
    id,
    client_order_id: id,
    organization_id: input.orgId,
    receipt_number: receipt,
    subtotal: bill.subtotal,
    service_charge: bill.serviceCharge,
    vat: bill.vat,
    total: bill.total,
    payment_method: input.paymentMethod,
    payment_reference: input.paymentReference?.trim() || null,
    payment_proof_url: input.paymentProofUrl?.trim() || null,
    cashier_name: input.cashierName,
    note: null,
    day_key: dayKey(now),
    status: "placed",
    payment_status: paid ? "paid" : "unpaid",
    paid_at: paid ? now.toISOString() : null,
    paid_by: paid ? input.cashierName : null,
    place_label: input.placeLabel?.trim() || null,
    kitchen_note: input.kitchenNote?.trim() || null,
    canceled_at: null,
    canceled_by: null,
    vat_percent: bill.vatPercent,
    service_percent: bill.servicePercent,
    created_at: now.toISOString(),
    lines: orderLines,
  };

  await db.orders.put({
    id: order.id,
    receiptNumber: order.receipt_number,
    lines: orderLines.map((l) => ({
      menuItemId: l.menu_item_id || "",
      name: l.name,
      unitPrice: l.unit_price,
      quantity: l.quantity,
      lineTotal: l.line_total,
    })),
    subtotal: order.subtotal,
    serviceCharge: order.service_charge,
    vat: order.vat,
    total: order.total,
    paymentMethod: order.payment_method,
    paymentReference: order.payment_reference || undefined,
    cashierName: order.cashier_name,
    createdAt: order.created_at,
    dayKey: order.day_key,
  });

  await applyLocalStockDeduction(input.orgId, input.lines);
  return order;
}

export async function listQueuedLocalSales(
  orgId: string,
): Promise<Array<{ order: CloudSaleOrder; queueId: string }>> {
  const queued = await db.syncQueue.where("orgId").equals(orgId).toArray();
  const result: Array<{ order: CloudSaleOrder; queueId: string }> = [];

  for (const item of queued) {
    if (item.actionType !== "COMPLETE_SALE") continue;
    const payload = item.payload;
    if (!payload || typeof payload !== "object" || !("localOrder" in payload)) {
      continue;
    }
    const order = payload.localOrder;
    if (
      !order ||
      typeof order !== "object" ||
      !("id" in order) ||
      typeof order.id !== "string" ||
      !("organization_id" in order) ||
      order.organization_id !== orgId ||
      !("receipt_number" in order) ||
      typeof order.receipt_number !== "string" ||
      !("created_at" in order) ||
      typeof order.created_at !== "string" ||
      !("lines" in order) ||
      !Array.isArray(order.lines)
    ) {
      continue;
    }
    result.push({
      order: order as CloudSaleOrder,
      queueId: item.id,
    });
  }

  return result;
}
