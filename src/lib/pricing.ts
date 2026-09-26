import type { AppModule } from "@/lib/tenant";

export type ModulePriceRow = {
  module_code: AppModule;
  label: string;
  description: string | null;
  monthly_price_etb: number;
  active: boolean;
  sort_order: number;
  updated_at?: string;
};

export type PackageRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthly_price_etb: number;
  menu_enabled: boolean;
  ordering_enabled: boolean;
  inventory_enabled: boolean;
  finance_enabled: boolean;
  hr_enabled: boolean;
  max_staff_seats: number;
  active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type ModuleToggleMap = Record<AppModule, boolean>;

export type AmountLineItem = {
  code: string;
  label: string;
  monthly_etb: number;
};

export type AmountBreakdown = {
  mode: "package" | "modules";
  package_code?: string | null;
  package_name?: string | null;
  months: number;
  monthly_total_etb: number;
  total_etb: number;
  line_items: AmountLineItem[];
};

export const PRICING_MODULES: AppModule[] = [
  "menu",
  "ordering",
  "inventory",
  "finance",
  "hr",
];

export function packageModuleFlags(pkg: PackageRow): ModuleToggleMap {
  return {
    menu: pkg.menu_enabled,
    ordering: pkg.ordering_enabled,
    inventory: pkg.inventory_enabled,
    finance: pkg.finance_enabled,
    hr: pkg.hr_enabled,
  };
}

/** DB column patch from a package row. */
export function packageDbFlags(pkg: PackageRow) {
  return {
    menu_enabled: pkg.menu_enabled,
    ordering_enabled: pkg.ordering_enabled,
    inventory_enabled: pkg.inventory_enabled,
    finance_enabled: pkg.finance_enabled,
    hr_enabled: pkg.hr_enabled,
  };
}

/** Calculate payable amount from package OR selected modules × months. */
export function calculateAmount(input: {
  months: number;
  packages: PackageRow[];
  modulePrices: ModulePriceRow[];
  packageCode?: string | null;
  modules?: Partial<ModuleToggleMap> | null;
}): AmountBreakdown {
  const months = Math.min(12, Math.max(1, Math.floor(input.months || 1)));

  if (input.packageCode) {
    const pkg = input.packages.find(
      (p) => p.code === input.packageCode && p.active,
    );
    if (pkg) {
      const monthly = Number(pkg.monthly_price_etb) || 0;
      return {
        mode: "package",
        package_code: pkg.code,
        package_name: pkg.name,
        months,
        monthly_total_etb: monthly,
        total_etb: monthly * months,
        line_items: [
          {
            code: pkg.code,
            label: pkg.name,
            monthly_etb: monthly,
          },
        ],
      };
    }
  }

  const priceByCode = new Map(
    input.modulePrices
      .filter((m) => m.active)
      .map((m) => [m.module_code, m] as const),
  );
  const mods = input.modules || {};
  const line_items: AmountLineItem[] = [];
  let monthly = 0;
  for (const code of PRICING_MODULES) {
    if (!mods[code]) continue;
    const row = priceByCode.get(code);
    const price = Number(row?.monthly_price_etb) || 0;
    monthly += price;
    line_items.push({
      code,
      label: row?.label || code,
      monthly_etb: price,
    });
  }

  return {
    mode: "modules",
    package_code: null,
    package_name: null,
    months,
    monthly_total_etb: monthly,
    total_etb: monthly * months,
    line_items,
  };
}
