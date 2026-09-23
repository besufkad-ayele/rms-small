import { createClient } from "@/lib/supabase/client";
import type { PaymentMethod } from "@/lib/tenant";

export type PaidBill = {
  id: string;
  organization_id: string;
  title: string;
  category: string;
  amount: number;
  paid_at: string;
  payment_method: PaymentMethod;
  reference: string | null;
  note: string | null;
  created_at: string;
};

export const BILL_CATEGORIES = [
  { id: "rent", label: "Rent" },
  { id: "utilities", label: "Utilities" },
  { id: "supplies", label: "Supplies" },
  { id: "salary", label: "Salary / wages" },
  { id: "tax", label: "Tax" },
  { id: "maintenance", label: "Maintenance" },
  { id: "transport", label: "Transport" },
  { id: "other", label: "Other" },
] as const;

/** Bills ordered by paid date (newest first), then created_at. */
export async function listPaidBills(orgId: string): Promise<PaidBill[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("paid_bills")
    .select("*")
    .eq("organization_id", orgId)
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as PaidBill[];
}

import type { ReportPeriod } from "@/lib/types";
import { dayKey, startOfMonth, startOfWeek, startOfYear } from "@/lib/utils";

export type SpendDashboard = {
  period: ReportPeriod;
  periodSpent: number;
  todaySpent: number;
  monthSpent: number;
  billCount: number;
  periodBillCount: number;
  recent: PaidBill[];
  periodBills: PaidBill[];
};

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

function inPeriod(paidAt: string, period: ReportPeriod): boolean {
  const start = periodStart(period);
  if (!start) return true;
  const day = String(paidAt).slice(0, 10);
  return day >= dayKey(start);
}

export async function getSpendDashboard(
  orgId: string,
  period: ReportPeriod = "all",
): Promise<SpendDashboard> {
  const bills = await listPaidBills(orgId);
  const today = dayKey();
  const monthPrefix = today.slice(0, 7);

  let todaySpent = 0;
  let monthSpent = 0;
  let periodSpent = 0;
  const periodBills: PaidBill[] = [];

  for (const b of bills) {
    const amt = Number(b.amount) || 0;
    const day = String(b.paid_at).slice(0, 10);
    if (day === today) todaySpent += amt;
    if (day.startsWith(monthPrefix)) monthSpent += amt;
    if (inPeriod(b.paid_at, period)) {
      periodSpent += amt;
      periodBills.push(b);
    }
  }

  return {
    period,
    periodSpent: Math.round(periodSpent * 100) / 100,
    todaySpent: Math.round(todaySpent * 100) / 100,
    monthSpent: Math.round(monthSpent * 100) / 100,
    billCount: bills.length,
    periodBillCount: periodBills.length,
    recent: bills.slice(0, 5),
    periodBills: periodBills.slice(0, 8),
  };
}

export async function createPaidBill(
  orgId: string,
  input: {
    title: string;
    category: string;
    amount: number;
    paidAt: string;
    paymentMethod: PaymentMethod;
    reference?: string;
    note?: string;
  },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("paid_bills")
    .insert({
      organization_id: orgId,
      title: input.title.trim(),
      category: input.category,
      amount: input.amount,
      paid_at: input.paidAt,
      payment_method: input.paymentMethod,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as PaidBill;
}

export async function deletePaidBill(orgId: string, id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("paid_bills")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) throw new Error(error.message);
}
