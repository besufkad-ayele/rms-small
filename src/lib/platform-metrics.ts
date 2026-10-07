import type { ModulePriceRow, PackageRow } from "@/lib/pricing";
import type { AppModule } from "@/lib/tenant";

const DAY_MS = 24 * 60 * 60 * 1000;

export const USAGE_WINDOW_DAYS = 30;

export type UsageSegment = "healthy" | "at_risk" | "dormant" | "not_started";

export const USAGE_SEGMENT_LABELS: Record<UsageSegment, string> = {
  healthy: "Healthy",
  at_risk: "At risk",
  dormant: "Dormant",
  not_started: "Not started",
};

export type TenantUsage = {
  organizationId: string;
  orders7d: number;
  orders30d: number;
  /** Orders in the 30 days before the current window (trend baseline). */
  ordersPrev30d: number;
  /** Paid, non-canceled order totals in the current window. */
  sales30d: number;
  lastOrderAt: string | null;
  activeDays30d: number;
  /** Orders per day, oldest → newest, USAGE_WINDOW_DAYS entries. */
  dailyOrders: number[];
  dailySales: number[];
  staffActive: number;
  menuItems: number;
  inventoryItems: number;
  inventoryMoves30d: number;
  dayCloses30d: number;
  modulesUsed: AppModule[];
  score: number;
  segment: UsageSegment;
};

export type TenantBilling = {
  /** Monthly value of the subscription (last paid rate, else catalog price). */
  monthlyEtb: number;
  monthlySource: "payment" | "catalog" | "none";
  lifetimePaidEtb: number;
  approvedPayments: number;
  lastPaidAt: string | null;
};

export type EffectiveStatus =
  | "trialing"
  | "active"
  | "lapsed_trial"
  | "lapsed_paid"
  | "past_due"
  | "expired"
  | "canceled"
  | "none";

export const EFFECTIVE_STATUS_LABELS: Record<EffectiveStatus, string> = {
  trialing: "Trial",
  active: "Paid",
  lapsed_trial: "Trial ended",
  lapsed_paid: "Period ended",
  past_due: "Past due",
  expired: "Expired",
  canceled: "Canceled",
  none: "No subscription",
};

type SubLike = Record<string, unknown> | null | undefined;

export function accessEndOf(sub: SubLike): string | null {
  if (!sub) return null;
  const end =
    sub.status === "trialing" ? sub.trial_ends_at : sub.current_period_end;
  return end ? String(end) : null;
}

/** Status as the café experiences it: "active" past its end date is not live. */
export function effectiveStatus(sub: SubLike, now = Date.now()): EffectiveStatus {
  if (!sub) return "none";
  const st = String(sub.status || "");
  const end = accessEndOf(sub);
  const ended = end ? new Date(end).getTime() <= now : false;
  if (st === "trialing") return ended || !end ? "lapsed_trial" : "trialing";
  if (st === "active") return ended ? "lapsed_paid" : "active";
  if (st === "past_due" || st === "expired" || st === "canceled") return st;
  return "none";
}

export function isLiveStatus(s: EffectiveStatus) {
  return s === "trialing" || s === "active";
}

/** Whole days until access ends (negative when already ended). */
export function daysUntil(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.ceil((ms - now) / DAY_MS);
}

export function relativeDays(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "today";
  if (days > 0) return `in ${days}d`;
  return `${-days}d ago`;
}

export function daysSince(iso: string | null, now = Date.now()): number | null {
  const d = daysUntil(iso, now);
  return d === null ? null : -d;
}

function subModuleOn(sub: Record<string, unknown>, m: AppModule) {
  const v = sub[`${m}_enabled`];
  if (v === null || v === undefined) {
    if (m === "online") return false;
    if (m === "hr" || m === "finance") return true;
    return Boolean(sub.inventory_enabled ?? true);
  }
  return Boolean(v);
}

export function catalogMonthlyPrice(
  sub: SubLike,
  packages: PackageRow[],
  modulePrices: ModulePriceRow[],
): number {
  if (!sub) return 0;
  const code = String(sub.package_code || sub.plan_code || "");
  const pkg = code ? packages.find((p) => p.code === code) : undefined;
  if (pkg) return Number(pkg.monthly_price_etb) || 0;
  let total = 0;
  for (const m of modulePrices) {
    if (subModuleOn(sub, m.module_code)) {
      total += Number(m.monthly_price_etb) || 0;
    }
  }
  return total;
}

export type ProofLike = {
  organization_id: unknown;
  amount: unknown;
  status: unknown;
  months_requested?: unknown;
  reviewed_at?: unknown;
  created_at?: unknown;
};

export function paidAtOf(p: ProofLike): string | null {
  const at = p.reviewed_at || p.created_at;
  return at ? String(at) : null;
}

export function billingForTenant(
  sub: SubLike,
  approvedProofs: ProofLike[],
  packages: PackageRow[],
  modulePrices: ModulePriceRow[],
): TenantBilling {
  const sorted = [...approvedProofs].sort(
    (a, b) =>
      new Date(paidAtOf(b) || 0).getTime() -
      new Date(paidAtOf(a) || 0).getTime(),
  );
  const lifetimePaidEtb = sorted.reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0,
  );
  const latest = sorted[0];
  const latestMonthly = latest
    ? (Number(latest.amount) || 0) /
      Math.max(1, Number(latest.months_requested) || 1)
    : 0;
  const catalog = catalogMonthlyPrice(sub, packages, modulePrices);
  const monthlyEtb = latestMonthly > 0 ? latestMonthly : catalog;
  return {
    monthlyEtb: Math.round(monthlyEtb * 100) / 100,
    monthlySource:
      latestMonthly > 0 ? "payment" : catalog > 0 ? "catalog" : "none",
    lifetimePaidEtb,
    approvedPayments: sorted.length,
    lastPaidAt: latest ? paidAtOf(latest) : null,
  };
}

/**
 * 0–100 engagement score:
 * activity days (50) + recency (20) + module adoption (20) + trend (10).
 */
export function scoreUsage(input: {
  activeDays30d: number;
  lastOrderAt: string | null;
  orders30d: number;
  ordersPrev30d: number;
  modulesUsed: number;
  modulesEnabled: number;
  menuItems: number;
  now?: number;
}): { score: number; segment: UsageSegment } {
  const now = input.now ?? Date.now();
  const since = daysSince(input.lastOrderAt, now);

  if (input.orders30d === 0 && input.ordersPrev30d === 0 && input.menuItems === 0) {
    return { score: 0, segment: "not_started" };
  }

  const activity = Math.min(1, input.activeDays30d / 20) * 50;
  const recency =
    since === null
      ? 0
      : since <= 1
        ? 20
        : since <= 3
          ? 15
          : since <= 7
            ? 10
            : since <= 14
              ? 5
              : 0;
  const adoption =
    input.modulesEnabled > 0
      ? Math.min(1, input.modulesUsed / input.modulesEnabled) * 20
      : 0;
  const trend =
    input.ordersPrev30d === 0
      ? input.orders30d > 0
        ? 10
        : 0
      : input.orders30d >= input.ordersPrev30d
        ? 10
        : input.orders30d >= input.ordersPrev30d * 0.75
          ? 5
          : 0;
  const score = Math.round(activity + recency + adoption + trend);

  let segment: UsageSegment;
  if (since === null || since > 14) segment = "dormant";
  else if (
    score < 45 ||
    (input.ordersPrev30d >= 10 && input.orders30d < input.ordersPrev30d * 0.5)
  )
    segment = "at_risk";
  else segment = "healthy";

  return { score, segment };
}

export type RevenueMonth = { key: string; label: string; amount: number };

export function revenueByMonth(
  approved: ProofLike[],
  months = 6,
  now = new Date(),
): RevenueMonth[] {
  const out: RevenueMonth[] = [];
  const index = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    index.set(key, out.length);
    out.push({
      key,
      label: d.toLocaleString("en", { month: "short" }),
      amount: 0,
    });
  }
  for (const p of approved) {
    const at = paidAtOf(p);
    if (!at) continue;
    const d = new Date(at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const i = index.get(key);
    if (i !== undefined) out[i].amount += Number(p.amount) || 0;
  }
  return out;
}
