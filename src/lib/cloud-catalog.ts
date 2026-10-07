import { createClient } from "@/lib/supabase/client";
import { optionalText, requireNumber, requireText } from "@/lib/form-sanitize";
import { assertPrepTag, prepKindForItem } from "@/lib/prep-station";
import { normalizeTags } from "@/lib/menu-tags";
import type { MenuCategory } from "@/lib/tenant";

export interface CloudInventoryItem {
  id: string;
  organization_id: string;
  name: string;
  unit: string;
  unit_id?: string | null;
  stock_qty: number;
  low_stock_threshold: number;
  cost_per_unit: number;
  expiry_date?: string | null;
  last_purchased_at?: string | null;
  default_supplier_id?: string | null;
  updated_at: string;
  cost_history?: { cost_per_unit: number; recorded_at: string; note: string | null }[];
}

export interface CloudMenuItem {
  id: string;
  organization_id: string;
  name: string;
  category: MenuCategory;
  price: number;
  available: boolean;
  description: string;
  tags?: string[];
  image_url?: string | null;
  vote_count: number;
  updated_at?: string;
  recipe?: { inventory_item_id: string; quantity_required: number }[];
}

export async function listInventory(orgId: string) {
  return listInventoryChangedSince(orgId, null);
}

export async function listInventoryChangedSince(
  orgId: string,
  sinceIso: string | null,
) {
  const supabase = createClient();
  let q = supabase
    .from("inventory_items")
    .select("*")
    .eq("organization_id", orgId)
    .order("name");
  if (sinceIso) q = q.gt("updated_at", sinceIso);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const items = (data || []) as CloudInventoryItem[];
  if (items.length === 0) return items;

  const ids = items.map((i) => i.id);
  const { data: hist } = await supabase
    .from("inventory_cost_history")
    .select("inventory_item_id, cost_per_unit, recorded_at, note")
    .in("inventory_item_id", ids)
    .order("recorded_at", { ascending: false });

  const byId = new Map<string, CloudInventoryItem["cost_history"]>();
  for (const row of hist || []) {
    const list = byId.get(row.inventory_item_id) || [];
    if (list.length < 12) list.push(row);
    byId.set(row.inventory_item_id, list);
  }
  return items.map((i) => ({ ...i, cost_history: byId.get(i.id) || [] }));
}

export type InventoryStockRow = {
  id: string;
  name: string;
  stock_qty: number;
  unit: string;
  value: number;
};

export type InventoryExpiryRow = InventoryStockRow & {
  expiry_date: string;
  daysLeft: number;
};

export type InventoryDashboard = {
  itemCount: number;
  lowStockCount: number;
  outCount: number;
  healthyCount: number;
  expiringCount: number;
  expiredCount: number;
  stockValue: number;
  lowStock: { id: string; name: string; stock_qty: number; unit: string }[];
  expiring: InventoryExpiryRow[];
  expired: InventoryExpiryRow[];
  topValue: InventoryStockRow[];
};

const EXPIRING_WINDOW_DAYS = 14;

function daysUntilDate(iso: string, today = new Date()): number | null {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export function summarizeInventory(
  items: CloudInventoryItem[],
): InventoryDashboard {
  const lowStock = items.filter(
    (i) => Number(i.stock_qty) <= Number(i.low_stock_threshold),
  );
  const out = items.filter((i) => Number(i.stock_qty) <= 0);
  const stockValue = items.reduce(
    (s, i) => s + Number(i.stock_qty) * Number(i.cost_per_unit),
    0,
  );
  const dated = items.flatMap((i) => {
    if (!i.expiry_date) return [];
    const daysLeft = daysUntilDate(i.expiry_date);
    if (daysLeft == null) return [];
    return [
      {
        id: i.id,
        name: i.name,
        stock_qty: Number(i.stock_qty),
        unit: i.unit,
        value:
          Math.round(Number(i.stock_qty) * Number(i.cost_per_unit) * 100) / 100,
        expiry_date: i.expiry_date.slice(0, 10),
        daysLeft,
      },
    ];
  });
  const expiring = dated
    .filter((i) => i.daysLeft >= 0 && i.daysLeft <= EXPIRING_WINDOW_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const expired = dated
    .filter((i) => i.daysLeft < 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const topValue = [...items]
    .map((i) => ({
      id: i.id,
      name: i.name,
      stock_qty: Number(i.stock_qty),
      unit: i.unit,
      value:
        Math.round(Number(i.stock_qty) * Number(i.cost_per_unit) * 100) / 100,
    }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);

  return {
    itemCount: items.length,
    lowStockCount: lowStock.length,
    outCount: out.length,
    healthyCount: items.length - lowStock.length,
    expiringCount: expiring.length,
    expiredCount: expired.length,
    stockValue: Math.round(stockValue * 100) / 100,
    lowStock: lowStock.slice(0, 5).map((i) => ({
      id: i.id,
      name: i.name,
      stock_qty: Number(i.stock_qty),
      unit: i.unit,
    })),
    expiring: expiring.slice(0, 5),
    expired: expired.slice(0, 5),
    topValue,
  };
}

export async function upsertInventory(
  orgId: string,
  input: {
    id?: string;
    name: string;
    unit: string;
    unit_id?: string | null;
    stock_qty: number;
    low_stock_threshold: number;
    cost_per_unit: number;
  },
): Promise<string> {
  const supabase = createClient();
  const payload = {
    organization_id: orgId,
    name: requireText("Name", input.name, 120),
    unit: requireText("Unit", input.unit, 32),
    unit_id: input.unit_id || null,
    stock_qty: requireNumber("Stock quantity", Number(input.stock_qty), { min: 0 }),
    low_stock_threshold: requireNumber(
      "Low-stock alert",
      Number(input.low_stock_threshold),
      { min: 0 },
    ),
    cost_per_unit: requireNumber("Cost", Number(input.cost_per_unit), { min: 0 }),
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { error } = await supabase
      .from("inventory_items")
      .update(payload)
      .eq("id", input.id)
      .eq("organization_id", orgId);
    if (error) throw new Error(error.message);
    return input.id;
  }
  const { data, error } = await supabase
    .from("inventory_items")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message || "Create failed");
  return data.id as string;
}

export async function deleteInventory(orgId: string, id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) throw new Error(error.message);
}

export async function listMenu(orgId: string) {
  return listMenuChangedSince(orgId, null);
}

/** Full menu, or only rows with updated_at newer than `sinceIso`. */
export async function listMenuChangedSince(
  orgId: string,
  sinceIso: string | null,
) {
  const supabase = createClient();
  let q = supabase
    .from("menu_items")
    .select("*, menu_recipes(inventory_item_id, quantity_required)")
    .eq("organization_id", orgId)
    .order("vote_count", { ascending: false });
  if (sinceIso) q = q.gt("updated_at", sinceIso);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map((row) => {
    const r = row as CloudMenuItem & {
      menu_recipes?: CloudMenuItem["recipe"];
      tags?: string[] | null;
    };
    return {
      ...r,
      tags: Array.isArray(r.tags) ? r.tags : [],
      recipe: r.menu_recipes || [],
    };
  });
}

export async function upsertMenu(
  orgId: string,
  input: {
    id?: string;
    name: string;
    category: MenuCategory;
    price: number;
    available: boolean;
    description: string;
    tags?: string[];
    image_url?: string | null;
    recipe: { inventory_item_id: string; quantity_required: number }[];
  },
) {
  const supabase = createClient();
  const tags = normalizeTags(input.tags);
  assertPrepTag(tags);
  let menuId = input.id;
  const base = {
    name: requireText("Name", input.name, 80),
    category: input.category,
    price: requireNumber("Price", Number(input.price), { min: 0 }),
    available: input.available,
    description: optionalText(input.description || "", 800),
    tags,
    updated_at: new Date().toISOString(),
  };
  const withImage =
    input.image_url !== undefined
      ? { ...base, image_url: input.image_url }
      : base;

  if (menuId) {
    const { error } = await supabase
      .from("menu_items")
      .update(withImage)
      .eq("id", menuId)
      .eq("organization_id", orgId);
    if (error) throw new Error(error.message);
    await supabase.from("menu_recipes").delete().eq("menu_item_id", menuId);
  } else {
    const { data, error } = await supabase
      .from("menu_items")
      .insert({
        organization_id: orgId,
        ...withImage,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "Menu create failed");
    menuId = data.id;
  }

  if (input.recipe.length > 0) {
    const { error } = await supabase.from("menu_recipes").insert(
      input.recipe.map((r) => ({
        menu_item_id: menuId,
        inventory_item_id: r.inventory_item_id,
        quantity_required: r.quantity_required,
      })),
    );
    if (error) throw new Error(error.message);
  }
  return menuId as string;
}

export async function deleteMenu(orgId: string, id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("menu_items")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) throw new Error(error.message);
}

/** Opt-in only — new orgs start empty. Call from UI “Load sample data”. */
export async function seedOrgCatalog(orgId: string) {
  const supabase = createClient();
  const { data: meta } = await supabase
    .from("org_meta")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (meta?.seeded) return;

  const { data: inv, error: invErr } = await supabase
    .from("inventory_items")
    .insert([
      {
        organization_id: orgId,
        name: "Coffee beans",
        unit: "kg",
        stock_qty: 12,
        low_stock_threshold: 2,
        cost_per_unit: 850,
      },
      {
        organization_id: orgId,
        name: "Milk",
        unit: "L",
        stock_qty: 20,
        low_stock_threshold: 4,
        cost_per_unit: 95,
      },
      {
        organization_id: orgId,
        name: "Bread rolls",
        unit: "pcs",
        stock_qty: 40,
        low_stock_threshold: 10,
        cost_per_unit: 15,
      },
      {
        organization_id: orgId,
        name: "Coca-Cola cans",
        unit: "pcs",
        stock_qty: 48,
        low_stock_threshold: 12,
        cost_per_unit: 25,
      },
      {
        organization_id: orgId,
        name: "Orange juice",
        unit: "L",
        stock_qty: 10,
        low_stock_threshold: 2,
        cost_per_unit: 120,
      },
    ])
    .select("*");
  if (invErr) throw new Error(invErr.message);

  const byName = Object.fromEntries((inv || []).map((i) => [i.name, i]));
  const { data: menu, error: menuErr } = await supabase
    .from("menu_items")
    .insert([
      {
        organization_id: orgId,
        name: "Espresso",
        category: "hot-drinks",
        price: 45,
        available: true,
        description: "Single shot · ~30ml",
      },
      {
        organization_id: orgId,
        name: "Macchiato",
        category: "hot-drinks",
        price: 55,
        available: true,
        description: "Espresso with milk foam",
      },
      {
        organization_id: orgId,
        name: "Tea",
        category: "hot-drinks",
        price: 35,
        available: true,
        description: "Black tea · lemon optional",
      },
      {
        organization_id: orgId,
        name: "Coca-Cola",
        category: "soft-drinks",
        price: 40,
        available: true,
        description: "330ml can · chilled",
      },
      {
        organization_id: orgId,
        name: "Sprite",
        category: "soft-drinks",
        price: 40,
        available: true,
        description: "330ml can · chilled",
      },
      {
        organization_id: orgId,
        name: "Iced latte",
        category: "cold-drinks",
        price: 70,
        available: true,
        description: "Espresso over ice with milk",
      },
      {
        organization_id: orgId,
        name: "Fresh orange",
        category: "juices",
        price: 65,
        available: true,
        description: "Fresh squeezed · glass",
      },
      {
        organization_id: orgId,
        name: "St. George",
        category: "beer",
        price: 80,
        available: true,
        description: "330ml bottle",
      },
      {
        organization_id: orgId,
        name: "House wine glass",
        category: "wine",
        price: 120,
        available: true,
        description: "Red or white · 150ml",
      },
      {
        organization_id: orgId,
        name: "Ful plate",
        category: "breakfast",
        price: 90,
        available: true,
        description: "With bread & egg",
      },
      {
        organization_id: orgId,
        name: "Sandwich",
        category: "food",
        price: 120,
        available: true,
        description: "Daily special · ask counter",
      },
      {
        organization_id: orgId,
        name: "Croissant",
        category: "pastry",
        price: 50,
        available: true,
        description: "Butter croissant",
      },
      {
        organization_id: orgId,
        name: "Tiramisù",
        category: "desserts",
        price: 95,
        available: true,
        description: "House dessert",
      },
      {
        organization_id: orgId,
        name: "Chips",
        category: "snacks",
        price: 35,
        available: true,
        description: "Small pack",
      },
      {
        organization_id: orgId,
        name: "Side salad",
        category: "sides",
        price: 45,
        available: true,
        description: "Fresh greens",
      },
    ])
    .select("*");
  if (menuErr) throw new Error(menuErr.message);

  for (const item of menu || []) {
    const kind = prepKindForItem(item);
    await supabase
      .from("menu_items")
      .update({ tags: [kind] })
      .eq("id", item.id);
    item.tags = [kind];
  }

  const espresso = (menu || []).find((m) => m.name === "Espresso");
  const macchiato = (menu || []).find((m) => m.name === "Macchiato");
  const sandwich = (menu || []).find((m) => m.name === "Sandwich");
  const coke = (menu || []).find((m) => m.name === "Coca-Cola");
  const orange = (menu || []).find((m) => m.name === "Fresh orange");
  const recipes = [];
  if (espresso && byName["Coffee beans"]) {
    recipes.push({
      menu_item_id: espresso.id,
      inventory_item_id: byName["Coffee beans"].id,
      quantity_required: 0.018,
    });
  }
  if (macchiato && byName["Coffee beans"] && byName["Milk"]) {
    recipes.push(
      {
        menu_item_id: macchiato.id,
        inventory_item_id: byName["Coffee beans"].id,
        quantity_required: 0.018,
      },
      {
        menu_item_id: macchiato.id,
        inventory_item_id: byName["Milk"].id,
        quantity_required: 0.05,
      },
    );
  }
  if (sandwich && byName["Bread rolls"]) {
    recipes.push({
      menu_item_id: sandwich.id,
      inventory_item_id: byName["Bread rolls"].id,
      quantity_required: 1,
    });
  }
  if (coke && byName["Coca-Cola cans"]) {
    recipes.push({
      menu_item_id: coke.id,
      inventory_item_id: byName["Coca-Cola cans"].id,
      quantity_required: 1,
    });
  }
  if (orange && byName["Orange juice"]) {
    recipes.push({
      menu_item_id: orange.id,
      inventory_item_id: byName["Orange juice"].id,
      quantity_required: 0.25,
    });
  }
  if (recipes.length) {
    await supabase.from("menu_recipes").insert(recipes);
  }

  await supabase.from("org_meta").upsert({
    organization_id: orgId,
    receipt_seq: meta?.receipt_seq ?? 0,
    seeded: true,
  });
}
