import { db, getMeta } from "./db";
import type { InventoryItem, MenuItem } from "./types";
import { uid } from "./utils";

const SAMPLE_INVENTORY: Omit<
  InventoryItem,
  "id" | "createdAt" | "updatedAt" | "costHistory"
>[] = [
  {
    name: "Coffee beans",
    unit: "kg",
    stockQty: 12,
    lowStockThreshold: 2,
    costPerUnit: 850,
  },
  {
    name: "Milk",
    unit: "L",
    stockQty: 20,
    lowStockThreshold: 4,
    costPerUnit: 95,
  },
  {
    name: "Sugar",
    unit: "kg",
    stockQty: 8,
    lowStockThreshold: 1,
    costPerUnit: 120,
  },
  {
    name: "Tea leaves",
    unit: "kg",
    stockQty: 3,
    lowStockThreshold: 0.5,
    costPerUnit: 400,
  },
  {
    name: "Bread rolls",
    unit: "pcs",
    stockQty: 40,
    lowStockThreshold: 10,
    costPerUnit: 15,
  },
];

export async function seedDemoCatalogIfNeeded(): Promise<void> {
  const meta = await getMeta();
  if (meta.seeded) return;

  const now = new Date().toISOString();
  const inventoryRows: InventoryItem[] = SAMPLE_INVENTORY.map((row) => ({
    ...row,
    id: uid("inv"),
    costHistory: [{ cost: row.costPerUnit, recordedAt: now, note: "Initial" }],
    createdAt: now,
    updatedAt: now,
  }));

  const byName = Object.fromEntries(inventoryRows.map((i) => [i.name, i]));

  const menuRows: MenuItem[] = [
    {
      id: uid("menu"),
      name: "Espresso",
      category: "hot-drinks",
      price: 45,
      available: true,
      description: "Single shot",
      voteCount: 0,
      recipe: [
        {
          inventoryItemId: byName["Coffee beans"].id,
          quantityRequired: 0.018,
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid("menu"),
      name: "Macchiato",
      category: "hot-drinks",
      price: 55,
      available: true,
      description: "Espresso with milk foam",
      voteCount: 0,
      recipe: [
        {
          inventoryItemId: byName["Coffee beans"].id,
          quantityRequired: 0.018,
        },
        { inventoryItemId: byName["Milk"].id, quantityRequired: 0.05 },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid("menu"),
      name: "Tea",
      category: "hot-drinks",
      price: 35,
      available: true,
      description: "Black tea",
      voteCount: 0,
      recipe: [
        { inventoryItemId: byName["Tea leaves"].id, quantityRequired: 0.005 },
        { inventoryItemId: byName["Sugar"].id, quantityRequired: 0.01 },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid("menu"),
      name: "Fresh juice",
      category: "cold-drinks",
      price: 80,
      available: true,
      description: "Seasonal",
      voteCount: 0,
      recipe: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid("menu"),
      name: "Sandwich",
      category: "food",
      price: 120,
      available: true,
      description: "Daily special",
      voteCount: 0,
      recipe: [
        { inventoryItemId: byName["Bread rolls"].id, quantityRequired: 1 },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];

  await db.transaction("rw", db.inventory, db.menu, db.meta, async () => {
    await db.inventory.bulkPut(inventoryRows);
    await db.menu.bulkPut(menuRows);
    await db.meta.put({ ...meta, seeded: true });
  });
}
