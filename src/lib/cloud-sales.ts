import { createClient } from "@/lib/supabase/client";
import { computeBill } from "@/lib/money";
import type { CloudMenuItem } from "@/lib/cloud-catalog";
import type { PaymentMethod } from "@/lib/tenant";
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

export async function completeCloudSale(input: {
  orgId: string;
  lines: { menuItem: CloudMenuItem; quantity: number }[];
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  cashierName: string;
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
  const bill = computeBill(subtotal);
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

    for (const recipe of line.menuItem.recipe || []) {
      const { data: inv } = await supabase
        .from("inventory_items")
        .select("stock_qty")
        .eq("id", recipe.inventory_item_id)
        .single();
      if (!inv) continue;
      const next =
        Math.max(
          0,
          Number(inv.stock_qty) - recipe.quantity_required * line.quantity,
        );
      await supabase
        .from("inventory_items")
        .update({
          stock_qty: Math.round(next * 1000) / 1000,
          updated_at: now.toISOString(),
        })
        .eq("id", recipe.inventory_item_id);
    }
  }

  return { ...order, lines: orderLines } as CloudSaleOrder;
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

  const orders = (data || []) as CloudSaleOrder[];
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
