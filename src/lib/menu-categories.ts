import type { MenuCategory } from "@/lib/tenant";

/** Display order for POS / menu tabs */
export const MENU_CATEGORIES: {
  id: MenuCategory;
  label: string;
}[] = [
  { id: "hot-drinks", label: "Hot drinks" },
  { id: "soft-drinks", label: "Soft drinks" },
  { id: "cold-drinks", label: "Cold drinks" },
  { id: "juices", label: "Juices" },
  { id: "beer", label: "Beer" },
  { id: "wine", label: "Wine" },
  { id: "cocktails", label: "Cocktails" },
  { id: "breakfast", label: "Breakfast" },
  { id: "food", label: "Food" },
  { id: "pastry", label: "Pastry" },
  { id: "desserts", label: "Desserts" },
  { id: "snacks", label: "Snacks" },
  { id: "sides", label: "Sides" },
  { id: "other", label: "Other" },
];

export const MENU_CATEGORY_LABEL: Record<MenuCategory, string> =
  Object.fromEntries(MENU_CATEGORIES.map((c) => [c.id, c.label])) as Record<
    MenuCategory,
    string
  >;

export function categoryLabel(id: string): string {
  return MENU_CATEGORY_LABEL[id as MenuCategory] || id;
}
