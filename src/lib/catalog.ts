import { db } from "./db";
import type {
  InventoryItem,
  MenuItem,
  PricePoint,
  RecipeLine,
} from "./types";
import { uid } from "./utils";

const MAX_COST_HISTORY = 12;

function pushCostHistory(
  history: PricePoint[],
  cost: number,
  note?: string,
): PricePoint[] {
  const next = [
    ...history,
    { cost, recordedAt: new Date().toISOString(), note },
  ];
  return next.slice(-MAX_COST_HISTORY);
}

export async function listInventory(): Promise<InventoryItem[]> {
  return db.inventory.orderBy("name").toArray();
}

export async function upsertInventory(input: {
  id?: string;
  name: string;
  unit: string;
  stockQty: number;
  lowStockThreshold: number;
  costPerUnit: number;
  note?: string;
}): Promise<InventoryItem> {
  const now = new Date().toISOString();
  const existing = input.id ? await db.inventory.get(input.id) : undefined;

  if (existing) {
    const costChanged = existing.costPerUnit !== input.costPerUnit;
    const updated: InventoryItem = {
      ...existing,
      name: input.name.trim(),
      unit: input.unit.trim(),
      stockQty: input.stockQty,
      lowStockThreshold: input.lowStockThreshold,
      costPerUnit: input.costPerUnit,
      costHistory: costChanged
        ? pushCostHistory(existing.costHistory, input.costPerUnit, input.note)
        : existing.costHistory,
      updatedAt: now,
    };
    await db.inventory.put(updated);
    return updated;
  }

  const created: InventoryItem = {
    id: uid("inv"),
    name: input.name.trim(),
    unit: input.unit.trim(),
    stockQty: input.stockQty,
    lowStockThreshold: input.lowStockThreshold,
    costPerUnit: input.costPerUnit,
    costHistory: [
      {
        cost: input.costPerUnit,
        recordedAt: now,
        note: input.note ?? "Initial",
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  await db.inventory.put(created);
  return created;
}

export async function deleteInventory(id: string): Promise<void> {
  await db.inventory.delete(id);
}

export async function listMenu(): Promise<MenuItem[]> {
  return db.menu.orderBy("name").toArray();
}

export async function upsertMenuItem(input: {
  id?: string;
  name: string;
  category: MenuItem["category"];
  price: number;
  available: boolean;
  description: string;
  recipe: RecipeLine[];
}): Promise<MenuItem> {
  const now = new Date().toISOString();
  const existing = input.id ? await db.menu.get(input.id) : undefined;

  if (existing) {
    const updated: MenuItem = {
      ...existing,
      name: input.name.trim(),
      category: input.category,
      price: input.price,
      available: input.available,
      description: input.description.trim(),
      recipe: input.recipe,
      updatedAt: now,
    };
    await db.menu.put(updated);
    return updated;
  }

  const created: MenuItem = {
    id: uid("menu"),
    name: input.name.trim(),
    category: input.category,
    price: input.price,
    available: input.available,
    description: input.description.trim(),
    voteCount: 0,
    recipe: input.recipe,
    createdAt: now,
    updatedAt: now,
  };
  await db.menu.put(created);
  return created;
}

export async function deleteMenuItem(id: string): Promise<void> {
  await db.menu.delete(id);
}

export async function toggleMenuAvailability(
  id: string,
  available: boolean,
): Promise<void> {
  const item = await db.menu.get(id);
  if (!item) return;
  await db.menu.put({
    ...item,
    available,
    updatedAt: new Date().toISOString(),
  });
}
