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
