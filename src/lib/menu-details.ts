/**
 * Extra menu fields stored inside menu_items.description as labelled lines,
 * so no schema change is needed. Customer text stays first.
 */
export type MenuDetails = {
  summary: string;
  ingredients: string;
  portion: string;
  prepMinutes: number | null;
  kitchenNote: string;
};

export const EMPTY_MENU_DETAILS: MenuDetails = {
  summary: "",
  ingredients: "",
  portion: "",
  prepMinutes: null,
  kitchenNote: "",
};

const LABELS = {
  ingredients: "Ingredients",
  portion: "Portion",
  prep: "Prep",
  kitchen: "Kitchen",
} as const;

const LINE = /^(Ingredients|Portion|Prep|Kitchen):\s*(.*)$/;

export function parseMenuDescription(raw: string | null | undefined): MenuDetails {
  const details: MenuDetails = { ...EMPTY_MENU_DETAILS };
  const summary: string[] = [];
  for (const line of String(raw || "").split("\n")) {
    const match = LINE.exec(line.trim());
    if (!match) {
      summary.push(line);
      continue;
    }
    const value = match[2].trim();
    if (match[1] === LABELS.ingredients) details.ingredients = value;
    else if (match[1] === LABELS.portion) details.portion = value;
    else if (match[1] === LABELS.kitchen) details.kitchenNote = value;
    else {
      const minutes = Number.parseInt(value, 10);
      details.prepMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : null;
    }
  }
  details.summary = summary.join("\n").trim();
  return details;
}

export function composeMenuDescription(details: MenuDetails): string {
  const lines: string[] = [];
  if (details.summary.trim()) lines.push(details.summary.trim(), "");
  if (details.ingredients.trim()) {
    lines.push(`${LABELS.ingredients}: ${oneLine(details.ingredients)}`);
  }
  if (details.portion.trim()) {
    lines.push(`${LABELS.portion}: ${oneLine(details.portion)}`);
  }
  if (details.prepMinutes && details.prepMinutes > 0) {
    lines.push(`${LABELS.prep}: ${Math.round(details.prepMinutes)} min`);
  }
  if (details.kitchenNote.trim()) {
    lines.push(`${LABELS.kitchen}: ${oneLine(details.kitchenNote)}`);
  }
  return lines.join("\n").trim();
}

function oneLine(value: string) {
  return value.replace(/\s*\n\s*/g, ", ").trim();
}

export const MENU_ALLERGENS = [
  { id: "allergen-gluten", label: "Gluten" },
  { id: "allergen-dairy", label: "Dairy" },
  { id: "allergen-egg", label: "Egg" },
  { id: "allergen-nuts", label: "Nuts" },
  { id: "allergen-peanut", label: "Peanut" },
  { id: "allergen-soy", label: "Soy" },
  { id: "allergen-fish", label: "Fish" },
  { id: "allergen-shellfish", label: "Shellfish" },
  { id: "allergen-sesame", label: "Sesame" },
] as const;

export const MENU_SPICE_LEVELS = [
  { id: "", label: "Not spicy" },
  { id: "spice-mild", label: "Mild" },
  { id: "spice-medium", label: "Medium" },
  { id: "spice-hot", label: "Hot" },
] as const;

export const DETAIL_TAG_LABELS: Record<string, string> = Object.fromEntries([
  ...MENU_ALLERGENS.map((a) => [a.id, a.label]),
  ...MENU_SPICE_LEVELS.filter((s) => s.id).map((s) => [s.id, `${s.label} spice`]),
]);

export function isDetailTag(tag: string) {
  return tag.startsWith("allergen-") || tag.startsWith("spice-");
}
