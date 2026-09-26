/** Curated menu tags — multi-select details beyond category. */
export const MENU_TAGS = [
  { id: "starters", label: "Starters", pinTop: true },
  { id: "traditional", label: "Traditional" },
  { id: "signature", label: "Signature" },
  { id: "popular", label: "Popular" },
  { id: "chef-special", label: "Chef special" },
  { id: "spicy", label: "Spicy" },
  { id: "mild", label: "Mild" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "halal", label: "Halal" },
  { id: "kids", label: "Kids" },
  { id: "seasonal", label: "Seasonal" },
  { id: "shareable", label: "Shareable" },
  { id: "new", label: "New" },
] as const;

export type MenuTagId = (typeof MENU_TAGS)[number]["id"];

const LABEL_BY_ID = Object.fromEntries(
  MENU_TAGS.map((t) => [t.id, t.label]),
) as Record<string, string>;

const PIN_TOP = new Set<string>(
  MENU_TAGS.filter((t) => "pinTop" in t && t.pinTop).map((t) => t.id),
);

export function tagLabel(id: string): string {
  return LABEL_BY_ID[id] || id.replace(/-/g, " ");
}

export function normalizeTags(tags: string[] | null | undefined): string[] {
  if (!tags?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const id = String(raw)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Starters / pinned tags sort first, then name. */
export function menuSortPriority(tags: string[] | null | undefined): number {
  const t = tags || [];
  if (t.some((x) => PIN_TOP.has(x))) return 0;
  if (t.includes("popular") || t.includes("signature")) return 1;
  if (t.includes("traditional")) return 2;
  if (t.includes("new")) return 3;
  return 4;
}

export function sortMenuByTags<T extends { name: string; tags?: string[] | null }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const pa = menuSortPriority(a.tags);
    const pb = menuSortPriority(b.tags);
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });
}
