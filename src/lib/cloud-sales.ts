import { createClient } from "@/lib/supabase/client";
import { computeBill } from "@/lib/money";
import { getOrgTaxSettings } from "@/lib/org-tax";
import type { CloudMenuItem } from "@/lib/cloud-catalog";
import type { PaymentMethod, SaleOrderStatus } from "@/lib/tenant";
import { dayKey, startOfMonth, startOfWeek, startOfYear } from "@/lib/utils";
import type { ReportPeriod } from "@/lib/types";

export interface CloudSaleOrder {
  id: string;
  organization_id: string;
  receipt_number: string;
  subtotal: number;
  service_charge: number;
  vat: number;
  total: number;
  payment_method: PaymentMethod;
  payment_reference: string | null;
  cashier_name: string;
  note: string | null;
  day_key: string;
  status: SaleOrderStatus;
  place_label: string | null;
  kitchen_note: string | null;
  canceled_at: string | null;
  canceled_by: string | null;
  vat_percent?: number | null;
  service_percent?: number | null;
  cancel_requested?: boolean;
  cancel_requested_by?: string | null;
  cancel_requested_at?: string | null;
  created_at: string;
  lines?: {
    name: string;
    unit_price: number;
    quantity: number;
    line_total: number;
    menu_item_id: string | null;
  }[];
  sale_order_lines?: {
    name: string;
    unit_price: number;
    quantity: number;
    line_total: number;
    menu_item_id: string | null;
  }[];
}

async function nextReceipt(orgId: string) {
  const supabase = createClient();
  const { data: meta } = await supabase
    .from("org_meta")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  const next = (meta?.receipt_seq ?? 0) + 1;
  await supabase.from("org_meta").upsert({
    organization_id: orgId,
    receipt_seq: next,
    seeded: meta?.seeded ?? false,
  });
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `AR-${stamp}-${String(next).padStart(4, "0")}`;
}

async function applyRecipeDelta(
  lines: { menuItem: CloudMenuItem; quantity: number }[],
  direction: 1 | -1,
) {
  const supabase = createClient();
  const now = new Date().toISOString();
  for (const line of lines) {
    for (const recipe of line.menuItem.recipe || []) {
      const { data: inv } = await supabase
        .from("inventory_items")
        .select("stock_qty")
        .eq("id", recipe.inventory_item_id)
        .single();
      if (!inv) continue;
      const delta = recipe.quantity_required * line.quantity * direction;
      const next = Math.max(0, Number(inv.stock_qty) + delta);
      await supabase
        .from("inventory_items")
        .update({
          stock_qty: Math.round(next * 1000) / 1000,
          updated_at: now,
        })
        .eq("id", recipe.inventory_item_id);
    }
  }
}

export async function completeCloudSale(input: {
  orgId: string;
  lines: { menuItem: CloudMenuItem; quantity: number }[];
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  cashierName: string;
  placeLabel?: string;
  kitchenNote?: string;
}) {
  if (input.lines.length === 0) throw new Error("Cart is empty.");
  const supabase = createClient();
  const orderLines = input.lines.map(({ menuItem, quantity }) => ({
    menu_item_id: menuItem.id,
    name: menuItem.name,
    unit_price: menuItem.price,
    quantity,
    line_total: Math.round(menuItem.price * quantity * 100) / 100,
  }));
  const subtotal = orderLines.reduce((s, l) => s + l.line_total, 0);
  const tax = await getOrgTaxSettings(input.orgId);
  const bill = computeBill(subtotal, {
    vatPercent: tax.vat_percent,
    servicePercent: tax.service_percent,
  });
  const now = new Date();
  const receipt = await nextReceipt(input.orgId);

  const { data: order, error } = await supabase
    .from("sale_orders")
    .insert({
      organization_id: input.orgId,
      receipt_number: receipt,
      subtotal: bill.subtotal,
      service_charge: bill.serviceCharge,
      vat: bill.vat,
      total: bill.total,
      payment_method: input.paymentMethod,
      payment_reference: input.paymentReference?.trim() || null,
      cashier_name: input.cashierName,
      day_key: dayKey(now),
      status: "placed",
      place_label: input.placeLabel?.trim() || null,
      kitchen_note: input.kitchenNote?.trim() || null,
      vat_percent: bill.vatPercent,
      service_percent: bill.servicePercent,
    })
    .select("*")
    .single();
  if (error || !order) throw new Error(error?.message || "Sale failed");

  const { error: lineErr } = await supabase.from("sale_order_lines").insert(
    orderLines.map((l) => ({ ...l, order_id: order.id })),
  );
  if (lineErr) throw new Error(lineErr.message);

  for (const line of input.lines) {
    await supabase
      .from("menu_items")
      .update({
        vote_count: (line.menuItem.vote_count || 0) + line.quantity,
        updated_at: now.toISOString(),
      })
      .eq("id", line.menuItem.id);
  }

  await applyRecipeDelta(input.lines, -1);

  return {
    ...order,
    status: (order.status || "placed") as SaleOrderStatus,
    lines: orderLines,
  } as CloudSaleOrder;
}

const OPEN_STATUSES: SaleOrderStatus[] = [
  "placed",
  "preparing",
  "ready",
];

export async function listCloudOrders(
  orgId: string,
  opts?: {
    dayKey?: string;
    statuses?: SaleOrderStatus[];
    limit?: number;
  },
) {
  const supabase = createClient();
  let q = supabase
    .from("sale_orders")
    .select("*, sale_order_lines(*)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  if (opts?.dayKey) q = q.eq("day_key", opts.dayKey);
  if (opts?.statuses?.length) q = q.in("status", opts.statuses);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map((o) => ({
    ...o,
    status: (o.status || "completed") as SaleOrderStatus,
    lines: o.sale_order_lines || [],
  })) as CloudSaleOrder[];
}

export async function listOpenOrders(orgId: string, forDay?: string) {
  return listCloudOrders(orgId, {
    dayKey: forDay || dayKey(new Date()),
    statuses: OPEN_STATUSES,
    limit: 80,
  });
}

export async function listKitchenOrders(orgId: string) {
  return listCloudOrders(orgId, {
    dayKey: dayKey(new Date()),
    statuses: ["placed", "preparing", "ready"],
    limit: 80,
  });
}

export async function updateOrderStatus(
  orgId: string,
  orderId: string,
  status: Exclude<SaleOrderStatus, "canceled">,
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sale_orders")
    .update({ status })
    .eq("id", orderId)
    .eq("organization_id", orgId)
    .neq("status", "canceled")
    .select("*, sale_order_lines(*)")
    .single();
  if (error) throw new Error(error.message);
  return {
    ...data,
    status: data.status as SaleOrderStatus,
    lines: data.sale_order_lines || [],
  } as CloudSaleOrder;
}

/** Cashier requests cancel — owner confirms in Cancel orders. */
export async function requestCancelOrder(input: {
  orgId: string;
  orderId: string;
  requestedBy: string;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sale_orders")
    .update({
      cancel_requested: true,
      cancel_requested_by: input.requestedBy,
      cancel_requested_at: new Date().toISOString(),
    })
    .eq("id", input.orderId)
    .eq("organization_id", input.orgId)
    .neq("status", "canceled")
    .select("*, sale_order_lines(*)")
    .single();
  if (error) throw new Error(error.message);
  return {
    ...data,
    status: data.status as SaleOrderStatus,
    lines: data.sale_order_lines || [],
  } as CloudSaleOrder;
}

/**
 * Owner-only cancel. Restores recipe stock and excludes order from revenue.
 * Callers must enforce owner role in the UI.
 */
export async function cancelCloudSale(input: {
  orgId: string;
  orderId: string;
  canceledBy: string;
  menuById: Map<string, CloudMenuItem>;
}) {
  const supabase = createClient();
  const { data: order, error } = await supabase
    .from("sale_orders")
    .select("*, sale_order_lines(*)")
    .eq("id", input.orderId)
    .eq("organization_id", input.orgId)
    .single();
  if (error || !order) throw new Error(error?.message || "Order not found");
  if (order.status === "canceled") throw new Error("Already canceled");

  const lines = (order.sale_order_lines || []) as {
    menu_item_id: string | null;
    quantity: number;
  }[];
  const restore: { menuItem: CloudMenuItem; quantity: number }[] = [];
  for (const line of lines) {
    if (!line.menu_item_id) continue;
    const menuItem = input.menuById.get(line.menu_item_id);
    if (menuItem) restore.push({ menuItem, quantity: line.quantity });
  }
  if (restore.length) await applyRecipeDelta(restore, 1);

  const { data: updated, error: upErr } = await supabase
    .from("sale_orders")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      canceled_by: input.canceledBy,
      cancel_requested: false,
    })
    .eq("id", input.orderId)
    .eq("organization_id", input.orgId)
    .select("*, sale_order_lines(*)")
    .single();
  if (upErr) throw new Error(upErr.message);
  return {
    ...updated,
    status: "canceled" as SaleOrderStatus,
    lines: updated.sale_order_lines || [],
  } as CloudSaleOrder;
}

function periodStart(period: ReportPeriod): Date | null {
  const now = new Date();
  switch (period) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "week":
      return startOfWeek(now);
    case "month":
      return startOfMonth(now);
    case "year":
      return startOfYear(now);
    case "all":
      return null;
  }
}

export async function getCloudSalesSummary(
  orgId: string,
  period: ReportPeriod,
) {
  const supabase = createClient();
  let q = supabase
    .from("sale_orders")
    .select("*, sale_order_lines(*)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  const start = periodStart(period);
  if (start) q = q.gte("created_at", start.toISOString());
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const all = (data || []) as CloudSaleOrder[];
  const orders = all.filter((o) => (o.status || "completed") !== "canceled");
  const revenue = orders.reduce((s, o) => s + Number(o.total), 0);
  const itemsSold = orders.reduce(
    (s, o) =>
      s +
      (o.sale_order_lines || o.lines || []).reduce(
        (ls: number, l: { quantity: number }) => ls + l.quantity,
        0,
      ),
    0,
  );

  const byItem = new Map<
    string,
    { name: string; qty: number; revenue: number }
  >();
  for (const order of orders) {
    for (const line of (order.sale_order_lines ||
      order.lines ||
      []) as {
      name: string;
      quantity: number;
      line_total: number;
      menu_item_id?: string | null;
    }[]) {
      const key = line.menu_item_id || line.name;
      const prev = byItem.get(key) || { name: line.name, qty: 0, revenue: 0 };
      prev.qty += line.quantity;
      prev.revenue += Number(line.line_total);
      byItem.set(key, prev);
    }
  }

  return {
    period,
    orderCount: orders.length,
    itemsSold,
    revenue: Math.round(revenue * 100) / 100,
    byItem: [...byItem.values()].sort((a, b) => b.qty - a.qty),
    orders,
  };
}

export async function saveCloudDayClose(input: {
  orgId: string;
  dayKey: string;
  expectedSalesTotal: number;
  declaredCashTotal: number;
  note: string;
  proofImages: string[];
  closedBy: string;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("day_closes")
    .insert({
      organization_id: input.orgId,
      day_key: input.dayKey,
      expected_sales_total: input.expectedSalesTotal,
      declared_cash_total: input.declaredCashTotal,
      variance:
        Math.round(
          (input.declaredCashTotal - input.expectedSalesTotal) * 100,
        ) / 100,
      note: input.note.trim(),
      proof_images: input.proofImages,
      closed_by: input.closedBy,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listCloudDayCloses(orgId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("day_closes")
    .select("*")
    .eq("organization_id", orgId)
    .order("closed_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}
