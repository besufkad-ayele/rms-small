import { createClient } from "@/lib/supabase/client";

export type CloudInventorySupplier = {
  id: string;
  organization_id: string;
  name: string;
  phone: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CloudInventoryMovement = {
  id: string;
  organization_id: string;
  inventory_item_id: string;
  kind: "in" | "out";
  quantity: number;
  supplier_id: string | null;
  buyer_user_id: string | null;
  buyer_name: string | null;
  purchased_at: string | null;
  expires_at: string | null;
  cost_per_unit: number | null;
  issued_by_user_id: string | null;
  issued_by_name: string | null;
  issued_at: string | null;
  detail: string | null;
  note: string | null;
  created_at: string;
  inventory_items?: { name: string; unit: string } | null;
  inventory_suppliers?: { name: string; phone: string | null } | null;
};

export async function listSuppliers(orgId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("inventory_suppliers")
    .select("*")
    .eq("organization_id", orgId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data || []) as CloudInventorySupplier[];
}

export async function upsertSupplier(
  orgId: string,
  input: {
    id?: string;
    name: string;
    phone?: string;
    location?: string;
    notes?: string;
  },
) {
  const supabase = createClient();
  const payload = {
    organization_id: orgId,
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    location: input.location?.trim() || null,
    notes: input.notes?.trim() || "",
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { data, error } = await supabase
      .from("inventory_suppliers")
      .update(payload)
      .eq("id", input.id)
      .eq("organization_id", orgId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as CloudInventorySupplier;
  }
  const { data, error } = await supabase
    .from("inventory_suppliers")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as CloudInventorySupplier;
}

export async function listMovements(
  orgId: string,
  opts?: { kind?: "in" | "out"; limit?: number },
) {
  const supabase = createClient();
  let q = supabase
    .from("inventory_movements")
    .select(
      "*, inventory_items(name, unit), inventory_suppliers(name, phone)",
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 80);
  if (opts?.kind) q = q.eq("kind", opts.kind);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as CloudInventoryMovement[];
}

/** Receive stock into the system (inventory injection). */
export async function receiveInventory(input: {
  orgId: string;
  inventoryItemId: string;
  quantity: number;
  supplierId?: string | null;
  buyerUserId: string;
  buyerName: string;
  purchasedAt: string;
  expiresAt: string;
  costPerUnit?: number;
  note?: string;
}) {
  if (input.quantity <= 0) throw new Error("Quantity must be positive.");
  const supabase = createClient();
  const { data: inv, error: invErr } = await supabase
    .from("inventory_items")
    .select("stock_qty, cost_per_unit")
    .eq("id", input.inventoryItemId)
    .eq("organization_id", input.orgId)
    .single();
  if (invErr || !inv) throw new Error(invErr?.message || "Item not found");

  const nextQty =
    Math.round((Number(inv.stock_qty) + input.quantity) * 1000) / 1000;
  const cost =
    input.costPerUnit != null && input.costPerUnit >= 0
      ? input.costPerUnit
      : Number(inv.cost_per_unit);

  const { error: moveErr } = await supabase.from("inventory_movements").insert({
    organization_id: input.orgId,
    inventory_item_id: input.inventoryItemId,
    kind: "in",
    quantity: input.quantity,
    supplier_id: input.supplierId || null,
    buyer_user_id: input.buyerUserId,
    buyer_name: input.buyerName,
    purchased_at: input.purchasedAt,
    expires_at: input.expiresAt,
    cost_per_unit: cost,
    note: input.note?.trim() || "",
  });
  if (moveErr) throw new Error(moveErr.message);

  const patch: Record<string, unknown> = {
    stock_qty: nextQty,
    last_purchased_at: input.purchasedAt,
    expiry_date: input.expiresAt,
    updated_at: new Date().toISOString(),
  };
  if (input.costPerUnit != null && input.costPerUnit >= 0) {
    patch.cost_per_unit = input.costPerUnit;
  }
  if (input.supplierId) patch.default_supplier_id = input.supplierId;

  const { error: upErr } = await supabase
    .from("inventory_items")
    .update(patch)
    .eq("id", input.inventoryItemId)
    .eq("organization_id", input.orgId);
  if (upErr) throw new Error(upErr.message);
}

/** Issue / take out inventory (chef or responsible person). */
export async function issueInventory(input: {
  orgId: string;
  inventoryItemId: string;
  quantity: number;
  issuedByUserId: string;
  issuedByName: string;
  detail?: string;
  note?: string;
}) {
  if (input.quantity <= 0) throw new Error("Quantity must be positive.");
  const supabase = createClient();
  const { data: inv, error: invErr } = await supabase
    .from("inventory_items")
    .select("stock_qty")
    .eq("id", input.inventoryItemId)
    .eq("organization_id", input.orgId)
    .single();
  if (invErr || !inv) throw new Error(invErr?.message || "Item not found");

  const current = Number(inv.stock_qty);
  if (input.quantity > current) {
    throw new Error(`Only ${current} in stock.`);
  }
  const nextQty = Math.round((current - input.quantity) * 1000) / 1000;
  const now = new Date().toISOString();

  const { error: moveErr } = await supabase.from("inventory_movements").insert({
    organization_id: input.orgId,
    inventory_item_id: input.inventoryItemId,
    kind: "out",
    quantity: input.quantity,
    issued_by_user_id: input.issuedByUserId,
    issued_by_name: input.issuedByName,
    issued_at: now,
    detail: input.detail?.trim() || "",
    note: input.note?.trim() || "",
  });
  if (moveErr) throw new Error(moveErr.message);

  const { error: upErr } = await supabase
    .from("inventory_items")
    .update({ stock_qty: nextQty, updated_at: now })
    .eq("id", input.inventoryItemId)
    .eq("organization_id", input.orgId);
  if (upErr) throw new Error(upErr.message);
}
