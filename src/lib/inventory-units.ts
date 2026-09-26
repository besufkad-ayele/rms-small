import { createClient } from "@/lib/supabase/client";
import type { InventoryUnit, UnitKind } from "@/lib/tenant";

const BUILTIN_SEED: {
  code: string;
  label: string;
  kind: UnitKind;
  base_unit: string;
  to_base_factor: number;
}[] = [
  { code: "kg", label: "Kilogram", kind: "mass", base_unit: "g", to_base_factor: 1000 },
  { code: "g", label: "Gram", kind: "mass", base_unit: "g", to_base_factor: 1 },
  { code: "mg", label: "Milligram", kind: "mass", base_unit: "g", to_base_factor: 0.001 },
  { code: "L", label: "Liter", kind: "volume", base_unit: "mL", to_base_factor: 1000 },
  { code: "mL", label: "Milliliter", kind: "volume", base_unit: "mL", to_base_factor: 1 },
  { code: "pcs", label: "Piece", kind: "count", base_unit: "pcs", to_base_factor: 1 },
  { code: "pack", label: "Pack", kind: "count", base_unit: "pcs", to_base_factor: 1 },
  { code: "package", label: "Package", kind: "count", base_unit: "pcs", to_base_factor: 1 },
  { code: "box", label: "Box", kind: "count", base_unit: "pcs", to_base_factor: 1 },
  { code: "bottle", label: "Bottle", kind: "count", base_unit: "pcs", to_base_factor: 1 },
  { code: "can", label: "Can", kind: "count", base_unit: "pcs", to_base_factor: 1 },
];

export const UNIT_KIND_LABELS: Record<UnitKind, string> = {
  mass: "Mass",
  volume: "Volume",
  count: "Count",
  custom: "Custom",
};

export async function ensureOrgUnits(orgId: string): Promise<InventoryUnit[]> {
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("inventory_units")
    .select("*")
    .eq("organization_id", orgId)
    .order("kind")
    .order("label");

  if (existing && existing.length > 0) {
    return existing as InventoryUnit[];
  }

  // Prefer RPC; fall back to client insert if migration not applied yet
  const { error: rpcErr } = await supabase.rpc("seed_org_inventory_units", {
    p_org_id: orgId,
  });
  if (rpcErr) {
    await supabase.from("inventory_units").insert(
      BUILTIN_SEED.map((u) => ({
        organization_id: orgId,
        ...u,
        is_builtin: true,
      })),
    );
  }

  const { data } = await supabase
    .from("inventory_units")
    .select("*")
    .eq("organization_id", orgId)
    .order("kind")
    .order("label");
  return (data || []) as InventoryUnit[];
}

export async function listOrgUnits(orgId: string): Promise<InventoryUnit[]> {
  return ensureOrgUnits(orgId);
}

export async function createCustomUnit(
  orgId: string,
  input: { code: string; label: string },
): Promise<InventoryUnit> {
  const supabase = createClient();
  const code = input.code.trim().toLowerCase().replace(/\s+/g, "_");
  const label = input.label.trim() || code;
  if (!code) throw new Error("Unit code required");
  const { data, error } = await supabase
    .from("inventory_units")
    .insert({
      organization_id: orgId,
      code,
      label,
      kind: "custom",
      base_unit: code,
      to_base_factor: 1,
      is_builtin: false,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as InventoryUnit;
}

export function groupUnitsByKind(units: InventoryUnit[]) {
  const order: UnitKind[] = ["mass", "volume", "count", "custom"];
  return order
    .map((kind) => ({
      kind,
      label: UNIT_KIND_LABELS[kind],
      units: units.filter((u) => u.kind === kind),
    }))
    .filter((g) => g.units.length > 0);
}
