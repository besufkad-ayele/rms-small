export type ResetCategory =
  | "sales"
  | "receipt_counter"
  | "day_closes"
  | "expenses"
  | "stock_movements"
  | "cost_history"
  | "recipes"
  | "menu"
  | "inventory"
  | "suppliers"
  | "units"
  | "staff"
  | "subscription_payments";

export type ResetGroup = "sales" | "finance" | "menu" | "inventory" | "staff" | "billing";

export type ResetCategoryDef = {
  id: ResetCategory;
  label: string;
  detail: string;
  group: ResetGroup;
  /** Also removed automatically (database cascade or data integrity). */
  requires: ResetCategory[];
};

export const RESET_GROUP_LABELS: Record<ResetGroup, string> = {
  sales: "Sales",
  finance: "Finance",
  menu: "Menu",
  inventory: "Inventory",
  staff: "Staff",
  billing: "Aramis payments",
};

export const BACKUP_TTL_DAYS = 3;

/** Listed in delete order: children before the rows they point at. */
export const RESET_CATEGORIES: ResetCategoryDef[] = [
  {
    id: "sales",
    label: "Sales & orders",
    detail: "Every order, order line, and sale payment photo.",
    group: "sales",
    requires: [],
  },
  {
    id: "receipt_counter",
    label: "Receipt number counter",
    detail: "Restart receipts at #1. Needs sales cleared to avoid duplicates.",
    group: "sales",
    requires: ["sales"],
  },
  {
    id: "day_closes",
    label: "Day closes & X-reports",
    detail: "Cash counts and end-of-day closes.",
    group: "finance",
    requires: [],
  },
  {
    id: "expenses",
    label: "Paid bills / expenses",
    detail: "Finance expense records.",
    group: "finance",
    requires: [],
  },
  {
    id: "stock_movements",
    label: "Stock movements",
    detail: "Receive / issue history. Stock quantities are not changed.",
    group: "inventory",
    requires: [],
  },
  {
    id: "cost_history",
    label: "Cost price history",
    detail: "Past cost-per-unit changes for inventory items.",
    group: "inventory",
    requires: [],
  },
  {
    id: "recipes",
    label: "Recipes",
    detail: "Links between menu items and ingredients.",
    group: "menu",
    requires: [],
  },
  {
    id: "menu",
    label: "Menu items",
    detail: "Menu items and their photos. Past sales keep item names.",
    group: "menu",
    requires: ["recipes"],
  },
  {
    id: "inventory",
    label: "Inventory items",
    detail: "Stock items. Their movements, cost history and recipes go too.",
    group: "inventory",
    requires: ["stock_movements", "cost_history", "recipes"],
  },
  {
    id: "suppliers",
    label: "Suppliers",
    detail: "Supplier list. Past movements keep everything but the link.",
    group: "inventory",
    requires: [],
  },
  {
    id: "units",
    label: "Custom units",
    detail: "Units the café added. Built-in units stay.",
    group: "inventory",
    requires: [],
  },
  {
    id: "staff",
    label: "Staff accounts",
    detail: "Every member except the owner. Their logins are deleted if unused elsewhere.",
    group: "staff",
    requires: [],
  },
  {
    id: "subscription_payments",
    label: "Subscription payment proofs",
    detail: "Uploaded payments to Aramis. Access dates are not changed.",
    group: "billing",
    requires: [],
  },
];

export const RESET_CATEGORY_IDS = RESET_CATEGORIES.map((c) => c.id);

export const RESET_PRESETS: Array<{
  id: string;
  label: string;
  hint: string;
  ids: ResetCategory[];
}> = [
  {
    id: "finance",
    label: "Finance only",
    hint: "Bills, day closes, X-reports",
    ids: ["expenses", "day_closes"],
  },
  {
    id: "menu",
    label: "Menu only",
    hint: "Items, photos, recipes",
    ids: ["menu"],
  },
  {
    id: "inventory",
    label: "Inventory only",
    hint: "Stock, movements, cost history",
    ids: ["inventory"],
  },
  {
    id: "sales",
    label: "Sales only",
    hint: "Orders and receipt counter",
    ids: ["sales", "receipt_counter"],
  },
  {
    id: "staff",
    label: "Staff only",
    hint: "Non-owner members",
    ids: ["staff"],
  },
  {
    id: "ops",
    label: "All operations",
    hint: "Keep staff & Aramis payments",
    ids: [
      "sales",
      "receipt_counter",
      "day_closes",
      "expenses",
      "menu",
      "inventory",
      "suppliers",
      "units",
    ],
  },
  {
    id: "all",
    label: "Everything",
    hint: "All categories below",
    ids: RESET_CATEGORY_IDS,
  },
];

/** Selected categories plus everything they require, transitively. */
export function expandResetSelection(
  selected: Iterable<ResetCategory>,
): Set<ResetCategory> {
  const out = new Set<ResetCategory>();
  const byId = new Map(RESET_CATEGORIES.map((c) => [c.id, c]));
  const visit = (id: ResetCategory) => {
    if (out.has(id)) return;
    out.add(id);
    for (const r of byId.get(id)?.requires || []) visit(r);
  };
  for (const id of selected) visit(id);
  return out;
}

/** Categories that force `id` on, given the current selection. */
export function requiredBy(
  id: ResetCategory,
  selected: Set<ResetCategory>,
): ResetCategory[] {
  return RESET_CATEGORIES.filter(
    (c) => c.id !== id && selected.has(c.id) && expandResetSelection([c.id]).has(id),
  ).map((c) => c.id);
}
