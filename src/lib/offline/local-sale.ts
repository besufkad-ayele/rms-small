import { computeBill } from "@/lib/money";
import type { CloudSaleOrder } from "@/lib/cloud-sales";
import { dayKey, uid } from "@/lib/utils";
import { db, getMeta } from "@/lib/db";
import { applyLocalStockDeduction } from "./cache";
import type { CompleteSalePayload } from "./types";

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
  const bill = computeBill(subtotal);
  const now = new Date();
  const receipt =
    input.localOrder?.receipt_number || (await nextLocalReceipt(input.orgId));

  const order: CloudSaleOrder = {
    id: input.localOrder?.id || uid("sale"),
    organization_id: input.orgId,
    receipt_number: receipt,
    subtotal: bill.subtotal,
    service_charge: bill.serviceCharge,
    vat: bill.vat,
    total: bill.total,
    payment_method: input.paymentMethod,
    payment_reference: input.paymentReference?.trim() || null,
    cashier_name: input.cashierName,
    note: null,
    day_key: dayKey(now),
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
