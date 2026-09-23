import { createClient } from "@/lib/supabase/client";
import type { ReportPeriod } from "@/lib/types";
import { startOfMonth, startOfWeek, startOfYear } from "@/lib/utils";

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

export type OrderFinanceRow = {
  orderId: string;
  receiptNumber: string;
  createdAt: string;
  dayKey: string;
  cashier: string;
  paymentMethod: string;
  paymentReference: string;
  itemCount: number;
  itemsSummary: string;
  subtotal: number;
  serviceCharge: number;
  vat: number;
  total: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
};

export type ItemFinanceRow = {
  menuItemId: string;
  name: string;
  quantity: number;
  revenue: number;
  unitCost: number;
  cogs: number;
  grossProfit: number;
  orderCount: number;
};

export type FinanceDashboard = {
  period: ReportPeriod;
  orderCount: number;
  itemsSold: number;
  revenue: number;
  subtotal: number;
  serviceCharge: number;
  vat: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  byOrder: OrderFinanceRow[];
  byItem: ItemFinanceRow[];
};

async function recipeUnitCostMap(orgId: string) {
  const supabase = createClient();
  const { data: recipes } = await supabase
    .from("menu_recipes")
    .select("menu_item_id, quantity_required, inventory_item_id");
  const { data: inventory } = await supabase
    .from("inventory_items")
    .select("id, cost_per_unit")
    .eq("organization_id", orgId);

  const costByInv = new Map(
    (inventory || []).map((i) => [i.id, Number(i.cost_per_unit) || 0]),
  );
  const unitCostByMenu = new Map<string, number>();

  for (const r of recipes || []) {
    const add =
      Number(r.quantity_required) * (costByInv.get(r.inventory_item_id) || 0);
    unitCostByMenu.set(
      r.menu_item_id,
      (unitCostByMenu.get(r.menu_item_id) || 0) + add,
    );
  }
  return unitCostByMenu;
}

export async function getFinanceDashboard(
  orgId: string,
  period: ReportPeriod,
): Promise<FinanceDashboard> {
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

  const unitCostByMenu = await recipeUnitCostMap(orgId);
  const orders = data || [];

  const byOrder: OrderFinanceRow[] = [];
  const itemMap = new Map<string, ItemFinanceRow>();

  let revenue = 0;
  let subtotal = 0;
  let serviceCharge = 0;
  let vat = 0;
  let cogs = 0;
  let itemsSold = 0;

  for (const order of orders) {
    const lines = (order.sale_order_lines || []) as {
      menu_item_id: string | null;
      name: string;
      quantity: number;
      line_total: number;
      unit_price: number;
    }[];

    let orderCogs = 0;
    const parts: string[] = [];
    const orderMenus = new Set<string>();

    for (const line of lines) {
      const qty = Number(line.quantity) || 0;
      const lineRev = Number(line.line_total) || 0;
      const unitCost = line.menu_item_id
        ? unitCostByMenu.get(line.menu_item_id) || 0
        : 0;
      const lineCogs = unitCost * qty;
      orderCogs += lineCogs;
      itemsSold += qty;
      parts.push(`${line.name}×${qty}`);
      if (line.menu_item_id) orderMenus.add(line.menu_item_id);

      const key = line.menu_item_id || line.name;
      const prev = itemMap.get(key) || {
        menuItemId: key,
        name: line.name,
        quantity: 0,
        revenue: 0,
        unitCost,
        cogs: 0,
        grossProfit: 0,
        orderCount: 0,
      };
      prev.quantity += qty;
      prev.revenue += lineRev;
      prev.cogs += lineCogs;
      prev.unitCost = unitCost;
      itemMap.set(key, prev);
    }

    // Count distinct orders contributing per item
    for (const menuId of orderMenus) {
      const row = itemMap.get(menuId);
      if (row) row.orderCount += 1;
    }

    const total = Number(order.total) || 0;
    revenue += total;
    subtotal += Number(order.subtotal) || 0;
    serviceCharge += Number(order.service_charge) || 0;
    vat += Number(order.vat) || 0;
    cogs += orderCogs;
    const grossProfit = Math.round((total - orderCogs) * 100) / 100;

    byOrder.push({
      orderId: order.id,
      receiptNumber: order.receipt_number,
      createdAt: order.created_at,
      dayKey: order.day_key,
      cashier: order.cashier_name,
      paymentMethod: order.payment_method,
      paymentReference: order.payment_reference || "",
      itemCount: lines.reduce((s, l) => s + Number(l.quantity), 0),
      itemsSummary: parts.join(", "),
      subtotal: Number(order.subtotal) || 0,
      serviceCharge: Number(order.service_charge) || 0,
      vat: Number(order.vat) || 0,
      total,
      cogs: Math.round(orderCogs * 100) / 100,
      grossProfit,
      grossMarginPct:
        total > 0 ? Math.round((grossProfit / total) * 1000) / 10 : 0,
    });
  }

  const byItem = [...itemMap.values()]
    .map((row) => ({
      ...row,
      revenue: Math.round(row.revenue * 100) / 100,
      cogs: Math.round(row.cogs * 100) / 100,
      grossProfit: Math.round((row.revenue - row.cogs) * 100) / 100,
      unitCost: Math.round(row.unitCost * 10000) / 10000,
    }))
    .sort((a, b) => b.quantity - a.quantity);

  const grossProfit = Math.round((revenue - cogs) * 100) / 100;

  return {
    period,
    orderCount: orders.length,
    itemsSold,
    revenue: Math.round(revenue * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    serviceCharge: Math.round(serviceCharge * 100) / 100,
    vat: Math.round(vat * 100) / 100,
    cogs: Math.round(cogs * 100) / 100,
    grossProfit,
    grossMarginPct:
      revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
    byOrder,
    byItem,
  };
}
