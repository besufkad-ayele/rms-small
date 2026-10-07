import type { MenuCategory } from "@/lib/tenant";

/** Where a menu item is prepared. Stored as the menu tags `food` and `drink`. */
export type PrepKind = "food" | "drink";

export type PrepStation = "barista" | "kitchen";

export const PREP_CHOICES: {
  id: PrepKind;
  label: string;
  hint: string;
  station: PrepStation;
}[] = [
  {
    id: "drink",
    label: "Drink",
    hint: "Barista display",
    station: "barista",
  },
  {
    id: "food",
    label: "Food",
    hint: "Kitchen display",
    station: "kitchen",
  },
];

const DRINK_CATEGORIES = new Set<MenuCategory>([
  "hot-drinks",
  "soft-drinks",
  "cold-drinks",
  "juices",
  "beer",
  "wine",
  "cocktails",
]);

export function stationForKind(kind: PrepKind): PrepStation {
  return kind === "drink" ? "barista" : "kitchen";
}

export function prepKindFromTags(
  tags: string[] | null | undefined,
): PrepKind | null {
  const list = tags || [];
  const drink = list.includes("drink");
  const food = list.includes("food");
  if (drink === food) return null;
  return drink ? "drink" : "food";
}

/** Tag wins. Older items without a tag follow the category (tea → barista). */
export function prepKindForItem(item: {
  tags?: string[] | null;
  category?: string | null;
}): PrepKind {
  const tagged = prepKindFromTags(item.tags);
  if (tagged) return tagged;
  if (item.category && DRINK_CATEGORIES.has(item.category as MenuCategory)) {
    return "drink";
  }
  return "food";
}

export function withPrepKind(tags: string[], kind: PrepKind): string[] {
  return [...tags.filter((tag) => tag !== "food" && tag !== "drink"), kind];
}

export function assertPrepTag(tags: string[]): PrepKind {
  const kind = prepKindFromTags(tags);
  if (!kind) {
    throw new Error(
      "Choose Food or Drink. Drinks go to the barista. Food goes to the kitchen.",
    );
  }
  return kind;
}
