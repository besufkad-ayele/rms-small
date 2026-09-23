import { db, nextReceiptNumber } from "./db";
import { computeBill } from "./money";
import type {
  DayCloseRecord,
  MenuItem,
  OrderLine,
  PaymentMethod,
  ReportPeriod,
  SaleOrder,
} from "./types";
import {
  dayKey,
  startOfMonth,
  startOfWeek,
  startOfYear,
  uid,
} from "./utils";

export interface CartLine {
  menuItem: MenuItem;
  quantity: number;
}

export async function completeSale(input: {
  lines: CartLine[];
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  cashierName: string;
  note?: string;
}): Promise<SaleOrder> {
  if (input.lines.length === 0) {
    throw new Error("Cart is empty.");
  }

  const orderLines: OrderLine[] = input.lines.map(({ menuItem, quantity }) => ({
    menuItemId: menuItem.id,
    name: menuItem.name,
    unitPrice: menuItem.price,
    quantity,
    lineTotal: Math.round(menuItem.price * quantity * 100) / 100,
  }));

  const subtotal = orderLines.reduce((sum, l) => sum + l.lineTotal, 0);
  const bill = computeBill(subtotal);
  const now = new Date();
  const receiptNumber = await nextReceiptNumber();

  const order: SaleOrder = {
    id: uid("ord"),
    receiptNumber,
    lines: orderLines,
    subtotal: bill.subtotal,
    serviceCharge: bill.serviceCharge,
    vat: bill.vat,
    total: bill.total,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference?.trim() || undefined,
    cashierName: input.cashierName,
    note: input.note?.trim() || undefined,
    createdAt: now.toISOString(),
    dayKey: dayKey(now),
  };

  await db.transaction("rw", db.orders, db.menu, db.inventory, async () => {
    await db.orders.put(order);

    for (const line of input.lines) {
      const menu = await db.menu.get(line.menuItem.id);
      if (menu) {
        await db.menu.put({
          ...menu,
          voteCount: menu.voteCount + line.quantity,
          updatedAt: now.toISOString(),
        });
      }

      for (const recipe of line.menuItem.recipe) {
        const inv = await db.inventory.get(recipe.inventoryItemId);
        if (!inv) continue;
        const deduct = recipe.quantityRequired * line.quantity;
        await db.inventory.put({
          ...inv,
          stockQty: Math.max(0, Math.round((inv.stockQty - deduct) * 1000) / 1000),
          updatedAt: now.toISOString(),
        });
      }
    }
  });

  return order;
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

export async function getOrdersForPeriod(
  period: ReportPeriod,
): Promise<SaleOrder[]> {
  const start = periodStart(period);
  const all = await db.orders.orderBy("createdAt").reverse().toArray();
  if (!start) return all;
  const startMs = start.getTime();
  return all.filter((o) => new Date(o.createdAt).getTime() >= startMs);
}

export async function getSalesSummary(period: ReportPeriod) {
  const orders = await getOrdersForPeriod(period);
  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const count = orders.length;
  const itemsSold = orders.reduce(
    (s, o) => s + o.lines.reduce((ls, l) => ls + l.quantity, 0),
    0,
  );

  const byItem = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const order of orders) {
    for (const line of order.lines) {
      const prev = byItem.get(line.menuItemId) ?? {
        name: line.name,
        qty: 0,
        revenue: 0,
      };
      prev.qty += line.quantity;
      prev.revenue += line.lineTotal;
      byItem.set(line.menuItemId, prev);
    }
  }

  return {
    period,
    orderCount: count,
    itemsSold,
    revenue: Math.round(revenue * 100) / 100,
    byItem: [...byItem.values()].sort((a, b) => b.qty - a.qty),
    orders,
  };
}

export async function getTodayExpectedTotal(): Promise<number> {
  const summary = await getSalesSummary("today");
  return summary.revenue;
}

export async function saveDayClose(input: {
  dayKey: string;
  expectedSalesTotal: number;
  declaredCashTotal: number;
  note: string;
  proofImages: string[];
  closedBy: string;
}): Promise<DayCloseRecord> {
  const record: DayCloseRecord = {
    id: uid("close"),
    dayKey: input.dayKey,
    expectedSalesTotal: input.expectedSalesTotal,
    declaredCashTotal: input.declaredCashTotal,
    variance:
      Math.round((input.declaredCashTotal - input.expectedSalesTotal) * 100) /
      100,
    note: input.note.trim(),
    proofImages: input.proofImages,
    closedBy: input.closedBy,
    closedAt: new Date().toISOString(),
    synced: false,
  };
  await db.dayCloses.put(record);
  return record;
}

export async function listDayCloses(): Promise<DayCloseRecord[]> {
  return db.dayCloses.orderBy("closedAt").reverse().toArray();
}
