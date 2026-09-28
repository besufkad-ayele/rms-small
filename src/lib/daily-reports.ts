import {
  isOrderPaid,
  listCloudDayCloses,
  listCloudOrders,
  listCloudXReports,
  type CloudSaleOrder,
  type CloudXReport,
} from "@/lib/cloud-sales";
import type { PaymentMethod } from "@/lib/tenant";
import { dayKey } from "@/lib/utils";

export type PaymentBucket = {
  method: PaymentMethod | string;
  orderCount: number;
  total: number;
};

export type StatusBucket = {
  status: string;
  orderCount: number;
  total: number;
};

export type DailyItemRow = {
  name: string;
  quantity: number;
  revenue: number;
};

/** Live system snapshot for the day — classic X-report (does not close). */
export type XReport = {
  dayKey: string;
  generatedAt: string;
  /** Paid order count (finance). */
  orderCount: number;
  itemsSold: number;
  /** Paid revenue only. */
  revenue: number;
  subtotal: number;
  serviceCharge: number;
  vat: number;
  openCount: number;
  openTotal: number;
  completedCount: number;
  completedTotal: number;
  unpaidCount: number;
  unpaidTotal: number;
  canceledCount: number;
  canceledTotal: number;
  byPayment: PaymentBucket[];
  byStatus: StatusBucket[];
  topItems: DailyItemRow[];
  orders: CloudSaleOrder[];
};

export type XCashCount = {
  id: string;
  dayKey: string;
  systemTotal: number;
  cashAtHand: number;
  variance: number;
  note: string;
  countedBy: string;
  countedAt: string;
};

export type ZCloseRow = {
  id: string;
  dayKey: string;
  expectedSalesTotal: number;
  declaredCashTotal: number;
  variance: number;
  note: string;
  closedBy: string;
  closedAt: string;
};

/** Comparison at the daily sales point: live X vs last Z close. */
export type DailySalesPoint = {
  x: XReport;
  /** Latest mid-shift cash count for the day (if any). */
  latestXCount: XCashCount | null;
  xCounts: XCashCount[];
  z: ZCloseRow | null;
  /** Declared − system expected (from last Z, or null if no close yet). */
  variance: number | null;
  /** Live X revenue − Z expected (drift since close was saved). */
  driftSinceClose: number | null;
};

function mapXCount(row: CloudXReport): XCashCount {
  return {
    id: row.id,
    dayKey: row.day_key,
    systemTotal: Number(row.system_total) || 0,
    cashAtHand: Number(row.cash_at_hand) || 0,
    variance: Number(row.variance) || 0,
    note: row.note || "",
    countedBy: row.counted_by,
    countedAt: row.counted_at,
  };
}

function lineQty(order: CloudSaleOrder) {
  return (order.sale_order_lines || order.lines || []).reduce(
    (s, l) => s + Number(l.quantity),
    0,
  );
}

export function buildXReport(
  orders: CloudSaleOrder[],
  forDay: string,
): XReport {
  const active = orders.filter((o) => o.status !== "canceled");
  const canceled = orders.filter((o) => o.status === "canceled");
  const paid = active.filter((o) => isOrderPaid(o));
  const unpaid = active.filter((o) => !isOrderPaid(o));

  let revenue = 0;
  let subtotal = 0;
  let serviceCharge = 0;
  let vat = 0;
  let itemsSold = 0;
  let openCount = 0;
  let openTotal = 0;
  let completedCount = 0;
  let completedTotal = 0;

  const pay = new Map<string, PaymentBucket>();
  const status = new Map<string, StatusBucket>();
  const items = new Map<string, DailyItemRow>();

  // Kitchen open/completed across all active tickets
  for (const o of active) {
    const total = Number(o.total) || 0;
    const st = o.status || "completed";
    const sb = status.get(st) || { status: st, orderCount: 0, total: 0 };
    sb.orderCount += 1;
    sb.total += total;
    status.set(st, sb);

    if (st === "completed") {
      completedCount += 1;
      completedTotal += total;
    } else {
      openCount += 1;
      openTotal += total;
    }
  }

  // Finance buckets — paid only
  for (const o of paid) {
    const total = Number(o.total) || 0;
    revenue += total;
    subtotal += Number(o.subtotal) || 0;
    serviceCharge += Number(o.service_charge) || 0;
    vat += Number(o.vat) || 0;
    itemsSold += lineQty(o);

    const method = o.payment_method || "other";
    const pb = pay.get(method) || {
      method,
      orderCount: 0,
      total: 0,
    };
    pb.orderCount += 1;
    pb.total += total;
    pay.set(method, pb);

    for (const line of o.sale_order_lines || o.lines || []) {
      const key = line.menu_item_id || line.name;
      const prev = items.get(key) || {
        name: line.name,
        quantity: 0,
        revenue: 0,
      };
      prev.quantity += Number(line.quantity) || 0;
      prev.revenue += Number(line.line_total) || 0;
      items.set(key, prev);
    }
  }

  let unpaidTotal = 0;
  for (const o of unpaid) unpaidTotal += Number(o.total) || 0;

  let canceledTotal = 0;
  for (const o of canceled) canceledTotal += Number(o.total) || 0;

  return {
    dayKey: forDay,
    generatedAt: new Date().toISOString(),
    orderCount: paid.length,
    itemsSold,
    revenue: Math.round(revenue * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    serviceCharge: Math.round(serviceCharge * 100) / 100,
    vat: Math.round(vat * 100) / 100,
    openCount,
    openTotal: Math.round(openTotal * 100) / 100,
    completedCount,
    completedTotal: Math.round(completedTotal * 100) / 100,
    unpaidCount: unpaid.length,
    unpaidTotal: Math.round(unpaidTotal * 100) / 100,
    canceledCount: canceled.length,
    canceledTotal: Math.round(canceledTotal * 100) / 100,
    byPayment: [...pay.values()]
      .map((p) => ({ ...p, total: Math.round(p.total * 100) / 100 }))
      .sort((a, b) => b.total - a.total),
    byStatus: [...status.values()]
      .map((s) => ({ ...s, total: Math.round(s.total * 100) / 100 }))
      .sort((a, b) => b.total - a.total),
    topItems: [...items.values()]
      .map((i) => ({
        ...i,
        revenue: Math.round(i.revenue * 100) / 100,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 12),
    orders: active,
  };
}

export async function getDailySalesPoint(
  orgId: string,
  forDay = dayKey(),
): Promise<DailySalesPoint> {
  const [orders, closes, xRows] = await Promise.all([
    listCloudOrders(orgId, { dayKey: forDay, limit: 500 }),
    listCloudDayCloses(orgId),
    listCloudXReports(orgId, forDay).catch(() => [] as CloudXReport[]),
  ]);
  const x = buildXReport(orders, forDay);
  const xCounts = xRows.map(mapXCount);
  const latestXCount = xCounts[0] ?? null;
  const raw = closes.find((c) => c.day_key === forDay) ?? null;
  const z: ZCloseRow | null = raw
    ? {
        id: raw.id,
        dayKey: raw.day_key,
        expectedSalesTotal: Number(raw.expected_sales_total) || 0,
        declaredCashTotal: Number(raw.declared_cash_total) || 0,
        variance: Number(raw.variance) || 0,
        note: raw.note || "",
        closedBy: raw.closed_by,
        closedAt: raw.closed_at,
      }
    : null;

  return {
    x,
    latestXCount,
    xCounts,
    z,
    variance: z ? z.variance : null,
    driftSinceClose: z
      ? Math.round((x.revenue - z.expectedSalesTotal) * 100) / 100
      : null,
  };
}
