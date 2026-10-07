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
  kitchen_enabled?: boolean;
  inventory_enabled: boolean;
  finance_enabled: boolean;
  hr_enabled: boolean;
  online_enabled?: boolean;
  max_staff_seats: number;
  active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type AddonRow = {
  code: string;
  name: string;
  description: string | null;
  price_etb: number;
  kind: "one_time";
  active: boolean;
  sort_order: number;
};

export type ModuleToggleMap = Record<AppModule, boolean>;

export type AmountLineItem = {
  code: string;
  label: string;
  monthly_etb: number;
  one_time_etb?: number;
};

export type AmountBreakdown = {
  mode: "package" | "modules";
  package_code?: string | null;
  package_name?: string | null;
  months: number;
  monthly_total_etb: number;
  one_time_etb: number;
  total_etb: number;
  included_seats: number;
  extra_seats: number;
  line_items: AmountLineItem[];
};

export const PRICING_MODULES: AppModule[] = [
  "menu",
  "ordering",
  "kitchen",
  "inventory",
  "finance",
  "hr",
  "online",
];

export const EXTRA_SEAT_ADDON = "extra_seat";

export function emptyModuleFlags(): ModuleToggleMap {
  return {
    menu: false,
    ordering: false,
    kitchen: false,
    inventory: false,
    finance: false,
    hr: false,
    online: false,
  };
}

export function packageModuleFlags(pkg: PackageRow): ModuleToggleMap {
  return {
    menu: pkg.menu_enabled,
    ordering: pkg.ordering_enabled,
    kitchen: pkg.kitchen_enabled ?? pkg.ordering_enabled,
    inventory: pkg.inventory_enabled,
    finance: pkg.finance_enabled,
    hr: pkg.hr_enabled,
    online: Boolean(pkg.online_enabled),
  };
}

/** DB column patch from a package row. */
export function packageDbFlags(pkg: PackageRow) {
  return {
    menu_enabled: pkg.menu_enabled,
    ordering_enabled: pkg.ordering_enabled,
    kitchen_enabled: pkg.kitchen_enabled ?? pkg.ordering_enabled,
    inventory_enabled: pkg.inventory_enabled,
    finance_enabled: pkg.finance_enabled,
    hr_enabled: pkg.hr_enabled,
    online_enabled: Boolean(pkg.online_enabled),
  };
}

export function enabledModuleCount(flags: Partial<ModuleToggleMap> | null | undefined) {
  let n = 0;
  for (const code of PRICING_MODULES) {
    if (flags?.[code]) n += 1;
  }
  return n;
}

/** One included staff seat per selected module. */
export function includedSeatsFromFlags(
  flags: Partial<ModuleToggleMap> | null | undefined,
) {
  return enabledModuleCount(flags);
}

export function extraSeatUnitPrice(addons: AddonRow[] | null | undefined) {
  const row = (addons || []).find((a) => a.code === EXTRA_SEAT_ADDON && a.active);
  return Number(row?.price_etb) || 500;
}

export function seatColumns(
  flags: Partial<ModuleToggleMap>,
  extraSeats = 0,
) {
  const included = includedSeatsFromFlags(flags);
  const extra = Math.max(0, Math.floor(extraSeats));
  return {
    extra_staff_seats: extra,
    max_staff_seats: included + extra,
    included_seats: included,
  };
}

/** Calculate payable amount from package OR selected modules × months, plus one-time add-ons. */
export function calculateAmount(input: {
  months: number;
  packages: PackageRow[];
  modulePrices: ModulePriceRow[];
  addons?: AddonRow[];
  packageCode?: string | null;
  modules?: Partial<ModuleToggleMap> | null;
  addonCodes?: string[] | null;
  extraSeats?: number;
}): AmountBreakdown {
  const months = Math.min(12, Math.max(1, Math.floor(input.months || 1)));
  const extraSeats = Math.max(0, Math.floor(input.extraSeats || 0));
  const line_items: AmountLineItem[] = [];
  let monthly = 0;
  let included = 0;
  let mode: AmountBreakdown["mode"] = "modules";
  let package_code: string | null = null;
  let package_name: string | null = null;

  if (input.packageCode) {
    const pkg = input.packages.find(
      (p) => p.code === input.packageCode && p.active,
    );
    if (pkg) {
      const flags = packageModuleFlags(pkg);
      included = includedSeatsFromFlags(flags);
      monthly = Number(pkg.monthly_price_etb) || 0;
      mode = "package";
      package_code = pkg.code;
      package_name = pkg.name;
      line_items.push({
        code: pkg.code,
        label: `${pkg.name} · ${included} seat${included === 1 ? "" : "s"} included`,
        monthly_etb: monthly,
      });
    }
  }

  if (!package_code) {
    const priceByCode = new Map(
      input.modulePrices
        .filter((m) => m.active)
        .map((m) => [m.module_code, m] as const),
    );
    const mods = input.modules || {};
    for (const code of PRICING_MODULES) {
      if (!mods[code]) continue;
      const row = priceByCode.get(code);
      const price = Number(row?.monthly_price_etb) || 0;
      monthly += price;
      included += 1;
      line_items.push({
        code,
        label: row?.label || code,
        monthly_etb: price,
      });
    }
  }

  let one_time = 0;
  const addonByCode = new Map((input.addons || []).map((a) => [a.code, a]));
  for (const code of input.addonCodes || []) {
    if (code === EXTRA_SEAT_ADDON) continue;
    const row = addonByCode.get(code);
    if (!row || !row.active) continue;
    const price = Number(row.price_etb) || 0;
    one_time += price;
    line_items.push({
      code: row.code,
      label: row.name,
      monthly_etb: 0,
      one_time_etb: price,
    });
  }

  if (extraSeats > 0) {
    const unit = extraSeatUnitPrice(input.addons);
    const price = unit * extraSeats;
    one_time += price;
    line_items.push({
      code: EXTRA_SEAT_ADDON,
      label: `${extraSeats} extra staff seat${extraSeats === 1 ? "" : "s"}`,
      monthly_etb: 0,
      one_time_etb: price,
    });
  }

  return {
    mode,
    package_code,
    package_name,
    months,
    monthly_total_etb: monthly,
    one_time_etb: one_time,
    total_etb: monthly * months + one_time,
    included_seats: included,
    extra_seats: extraSeats,
    line_items,
  };
}
