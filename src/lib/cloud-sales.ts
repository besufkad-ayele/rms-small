import { createClient } from "@/lib/supabase/client";
import { computeBill } from "@/lib/money";
import { getOrgReceiptSettings } from "@/lib/org-tax";
import type { CloudMenuItem } from "@/lib/cloud-catalog";
import type {
  SaleOrderStatus,
  SalePaymentStatus,
} from "@/lib/tenant";
import { dayKey, startOfMonth, startOfWeek, startOfYear } from "@/lib/utils";
import type { ReportPeriod } from "@/lib/types";

/** Sale tender id — built-in or custom (e.g. custom-awash). */
export type SalePaymentMethodId = string;

/** Columns that may be missing until 20260928_payment_status is applied. */

function missingColumnFromError(message: string): string | null {
  const m =
    /Could not find the '([^']+)' column of 'sale_orders'/i.exec(message) ||
    /column ["']?sale_orders\.([^"'\s]+)["']? does not exist/i.exec(message) ||
    /Could not find the '([^']+)' column/i.exec(message);
  return m?.[1] ?? null;
}

/**
 * Insert a sale_orders row, stripping unknown columns when the DB migration
 * has not been applied yet (so offline sync still lands as open orders).
 */
export async function insertSaleOrderRow(
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const supabase = createClient();
  let payload: Record<string, unknown> = { ...row };
  // Prefer full payload; fall back by dropping schema-cache misses.
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await supabase
      .from("sale_orders")
      .insert(payload)
      .select("*")
      .single();
    if (!error && data) return data as Record<string, unknown>;
    const missing = error?.message
      ? missingColumnFromError(error.message)
      : null;
    if (!missing || !(missing in payload)) {
      throw new Error(error?.message || "Sale failed");
    }
    const next = { ...payload };
    delete next[missing];
    payload = next;
  }
  throw new Error("Sale failed after schema fallbacks");
}

export async function updateSaleOrderRow(
  orgId: string,
  orderId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const supabase = createClient();
  let payload: Record<string, unknown> = { ...patch };
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await supabase
      .from("sale_orders")
      .update(payload)
      .eq("id", orderId)
      .eq("organization_id", orgId)
      .neq("status", "canceled")
      .select("*, sale_order_lines(*)")
      .single();
    if (!error && data) return data as Record<string, unknown>;
    const missing = error?.message
      ? missingColumnFromError(error.message)
      : null;
    if (!missing || !(missing in payload)) {
      throw new Error(error?.message || "Update failed");
    }
    const next = { ...payload };
    delete next[missing];
    payload = next;
  }
  throw new Error("Update failed after schema fallbacks");
}

export interface CloudSaleOrder {
  id: string;
  organization_id: string;
  receipt_number: string;
  subtotal: number;
  service_charge: number;
  vat: number;
  total: number;
  payment_method: SalePaymentMethodId;
  payment_reference: string | null;
  /** Screenshot URL for CBE / Telebirr / other (owner review). */
  payment_proof_url?: string | null;
  cashier_name: string;
  note: string | null;
  day_key: string;
  status: SaleOrderStatus;
  /** Money state — finance + receipts only when paid. */
  payment_status: SalePaymentStatus;
  paid_at?: string | null;
  paid_by?: string | null;
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
  lines?: CloudSaleLine[];
  sale_order_lines?: CloudSaleLine[];
}

export type KitchenLineStatus = "placed" | "preparing" | "ready" | "served";

export interface CloudSaleLine {
  id?: string;
  name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  menu_item_id: string | null;
  /** 1 = first send. Later adds stay on the same bill as a new round. */
  round?: number | null;
  kitchen_status?: KitchenLineStatus | null;
  sent_at?: string | null;
}

export function orderLines(order: {
  lines?: CloudSaleLine[] | null;
  sale_order_lines?: CloudSaleLine[] | null;
}): CloudSaleLine[] {
  return order.sale_order_lines || order.lines || [];
}

export function lineRound(line: CloudSaleLine): number {
  const n = Number(line.round);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function lineKitchenStatus(
  line: CloudSaleLine,
  fallback: SaleOrderStatus,
): KitchenLineStatus {
  const s = line.kitchen_status;
  if (s === "placed" || s === "preparing" || s === "ready" || s === "served") {
    return s;
  }
  if (fallback === "completed" || fallback === "canceled") return "served";
  if (fallback === "preparing" || fallback === "ready") return fallback;
  return "placed";
}

/** Earliest open send wins, so a new round pulls the check back to the kitchen queue. */
export function deriveOrderStatus(
  lines: CloudSaleLine[],
  fallback: SaleOrderStatus = "placed",
): Exclude<SaleOrderStatus, "canceled"> {
  if (lines.length === 0) {
    return fallback === "canceled" || fallback === "completed" ? "placed" : fallback;
  }
  const statuses = lines.map((l) => lineKitchenStatus(l, fallback));
  if (statuses.every((s) => s === "served")) return "completed";
  if (statuses.some((s) => s === "placed")) return "placed";
  if (statuses.some((s) => s === "preparing")) return "preparing";
  return "ready";
}

async function insertSaleOrderLines(rows: Record<string, unknown>[]) {
  const supabase = createClient();
  let payload = rows.map((row) => ({ ...row }));
  for (let attempt = 0; attempt < 6; attempt++) {
    const { error } = await supabase.from("sale_order_lines").insert(payload);
    if (!error) return;
    const missing = missingColumnFromError(error.message);
    if (!missing || !payload.some((row) => missing in row)) {
      throw new Error(error.message);
    }
    payload = payload.map((row) => {
      const next = { ...row };
      delete next[missing];
      return next;
    });
  }
  throw new Error("Could not add items");
}

/**
 * Add dishes to an open check. Same receipt and total for finance.
 * The new dishes are a later kitchen round so the pass sees only what just came in.
 */
export async function appendOrderItems(input: {
  orgId: string;
  orderId: string;
  lines: { menuItem: CloudMenuItem; quantity: number }[];
  kitchenNote?: string;
}): Promise<{ order: CloudSaleOrder; round: number; reopenedPayment: boolean }> {
  if (input.lines.length === 0) throw new Error("Nothing to add.");
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sale_orders")
    .select("*, sale_order_lines(*)")
    .eq("id", input.orderId)
    .eq("organization_id", input.orgId)
    .single();
  if (error || !data) throw new Error(error?.message || "Order not found");
  const current = mapOrder(data as Record<string, unknown>);
  if (current.status === "canceled" || current.status === "completed") {
    throw new Error("This check is already closed.");
  }

  const existing = orderLines(current);
  const round =
    existing.length === 0
      ? 1
      : Math.max(...existing.map((line) => lineRound(line))) + 1;
  const now = new Date().toISOString();
  const added = input.lines.map(({ menuItem, quantity }) => ({
    order_id: current.id,
    menu_item_id: menuItem.id,
    name: menuItem.name,
    unit_price: menuItem.price,
    quantity,
    line_total: Math.round(menuItem.price * quantity * 100) / 100,
    round,
    kitchen_status: "placed",
    sent_at: now,
  }));
  await insertSaleOrderLines(added);

  for (const line of input.lines) {
    await supabase
      .from("menu_items")
      .update({
        vote_count: (line.menuItem.vote_count || 0) + line.quantity,
        updated_at: now,
      })
      .eq("id", line.menuItem.id);
  }
  await applyRecipeDelta(input.lines, -1);

  const allLines = [
    ...existing,
    ...added.map((line) => ({
      name: line.name,
      unit_price: line.unit_price,
      quantity: line.quantity,
      line_total: line.line_total,
      menu_item_id: line.menu_item_id,
      round,
      kitchen_status: "placed" as const,
      sent_at: now,
    })),
  ];
  const subtotal = allLines.reduce((s, line) => s + Number(line.line_total), 0);
  const bill = computeBill(subtotal, {
    vatPercent: Number(current.vat_percent ?? 15),
    servicePercent: Number(current.service_percent ?? 10),
  });
  const wasPaid = isOrderPaid(current);
  const note = input.kitchenNote?.trim();
  const kitchenNote = note
    ? [current.kitchen_note, `Send ${round}: ${note}`].filter(Boolean).join(" · ")
    : current.kitchen_note;

  const updated = await updateSaleOrderRow(input.orgId, current.id, {
    subtotal: bill.subtotal,
    service_charge: bill.serviceCharge,
    vat: bill.vat,
    total: bill.total,
    vat_percent: bill.vatPercent,
    service_percent: bill.servicePercent,
    status: "placed",
    kitchen_note: kitchenNote,
    ...(wasPaid
      ? { payment_status: "unpaid", paid_at: null, paid_by: null }
      : {}),
  });
  return { order: mapOrder(updated), round, reopenedPayment: wasPaid };
}

/** Move one kitchen send. Earlier sends on the same bill stay where they are. */
export async function updateKitchenRound(
  orgId: string,
  orderId: string,
  round: number,
  status: KitchenLineStatus,
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sale_orders")
    .select("*, sale_order_lines(*)")
    .eq("id", orderId)
    .eq("organization_id", orgId)
    .neq("status", "canceled")
    .single();
  if (error || !data) throw new Error(error?.message || "Order not found");
  const current = mapOrder(data as Record<string, unknown>);
  const { error: lineError } = await supabase
    .from("sale_order_lines")
    .update({ kitchen_status: status })
    .eq("order_id", orderId)
    .eq("round", round);
  if (lineError) {
    const missing = missingColumnFromError(lineError.message);
    if (missing) {
      await updateOrderStatus(
        orgId,
        orderId,
        status === "served" ? "completed" : status,
      );
      return;
    }
    throw new Error(lineError.message);
  }
  const nextLines = orderLines(current).map((line) =>
    lineRound(line) === round ? { ...line, kitchen_status: status } : line,
  );
  await updateSaleOrderRow(orgId, orderId, {
    status: deriveOrderStatus(nextLines, current.status),
  });
}

/** Treat missing payment_status (pre-migration rows) as paid. */
export function isOrderPaid(order: {
  payment_status?: SalePaymentStatus | null;
  status?: string | null;
}): boolean {
  if (order.status === "canceled") return false;
  return (order.payment_status ?? "paid") === "paid";
}

function mapOrder(row: Record<string, unknown>): CloudSaleOrder {
  const lines =
    (row.sale_order_lines as CloudSaleOrder["sale_order_lines"]) ||
    (row.lines as CloudSaleOrder["lines"]) ||
    [];
  return {
    ...(row as unknown as CloudSaleOrder),
    status: ((row.status as SaleOrderStatus) || "placed") as SaleOrderStatus,
    payment_status: ((row.payment_status as SalePaymentStatus) ||
      "paid") as SalePaymentStatus,
    lines,
  };
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
  paymentMethod: SalePaymentMethodId;
  paymentReference?: string;
  paymentProofUrl?: string | null;
  cashierName: string;
  placeLabel?: string;
  kitchenNote?: string;
  /** Defaults false — place order only; pay via Mark as paid. */
  markPaid?: boolean;
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
  const tax = await getOrgReceiptSettings(input.orgId);
  const bill = computeBill(subtotal, {
    vatPercent: tax.vat_percent,
    servicePercent: tax.service_percent,
  });
  const now = new Date();
  const receipt = await nextReceipt(input.orgId);
  const paid = Boolean(input.markPaid);

  const order = await insertSaleOrderRow({
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
    day_key: dayKey(now),
    status: "placed",
    payment_status: paid ? "paid" : "unpaid",
    paid_at: paid ? now.toISOString() : null,
    paid_by: paid ? input.cashierName : null,
    place_label: input.placeLabel?.trim() || null,
    kitchen_note: input.kitchenNote?.trim() || null,
    vat_percent: bill.vatPercent,
    service_percent: bill.servicePercent,
  });
  if (!order) throw new Error("Sale failed");

  const { error: lineErr } = await supabase.from("sale_order_lines").insert(
    orderLines.map((l) => ({ ...l, order_id: order.id as string })),
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

  return mapOrder({ ...order, lines: orderLines });
}

/** Waiter photo of a transfer. Does not mark the ticket paid. */
export async function attachOrderPaymentProof(input: {
  orgId: string;
  orderId: string;
  paymentProofUrl: string;
}) {
  const data = await updateSaleOrderRow(input.orgId, input.orderId, {
    payment_proof_url: input.paymentProofUrl.trim(),
  });
  return mapOrder(data);
}

/** Accept payment on an open ticket — unlocks receipt print + finance. */
export async function markOrderPaid(input: {
  orgId: string;
  orderId: string;
  paidBy: string;
  paymentMethod: SalePaymentMethodId;
  paymentReference?: string;
  paymentProofUrl?: string | null;
}) {
  const supabase = createClient();
  const now = new Date().toISOString();
  const data = await updateSaleOrderRow(input.orgId, input.orderId, {
    payment_status: "paid",
    paid_at: now,
    paid_by: input.paidBy,
    payment_method: input.paymentMethod,
    payment_reference: input.paymentReference?.trim() || null,
    payment_proof_url: input.paymentProofUrl?.trim() || null,
  });
  return mapOrder(data);
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
  return (data || []).map((o) => mapOrder(o as Record<string, unknown>));
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
  const kitchen = status === "completed" ? "served" : status;
  await supabase
    .from("sale_order_lines")
    .update({ kitchen_status: kitchen })
    .eq("order_id", orderId);
  return mapOrder(data as Record<string, unknown>);
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
  return mapOrder(data as Record<string, unknown>);
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
  return mapOrder({ ...updated, status: "canceled" });
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

  const all = (data || []).map((o) => mapOrder(o as Record<string, unknown>));
  // Finance: paid tickets only (unpaid kitchen orders do not count as revenue)
  const orders = all.filter((o) => isOrderPaid(o));
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

export type CloudXReport = {
  id: string;
  organization_id: string;
  day_key: string;
  system_total: number;
  cash_at_hand: number;
  variance: number;
  note: string;
  counted_by: string;
  counted_at: string;
};

/** Mid-shift cash count — does not close the day. */
export async function saveCloudXReport(input: {
  orgId: string;
  dayKey: string;
  systemTotal: number;
  cashAtHand: number;
  note?: string;
  countedBy: string;
}) {
  const supabase = createClient();
  const variance =
    Math.round((input.cashAtHand - input.systemTotal) * 100) / 100;
  const { data, error } = await supabase
    .from("x_reports")
    .insert({
      organization_id: input.orgId,
      day_key: input.dayKey,
      system_total: input.systemTotal,
      cash_at_hand: input.cashAtHand,
      variance,
      note: (input.note || "").trim(),
      counted_by: input.countedBy,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as CloudXReport;
}

export async function listCloudXReports(orgId: string, forDay?: string) {
  const supabase = createClient();
  let q = supabase
    .from("x_reports")
    .select("*")
    .eq("organization_id", orgId)
    .order("counted_at", { ascending: false })
    .limit(40);
  if (forDay) q = q.eq("day_key", forDay);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as CloudXReport[];
}
