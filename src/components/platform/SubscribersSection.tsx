"use client";

import { useMemo } from "react";
import type { PlatformTenantRow } from "@/app/platform/actions";
import { downloadWorkbook } from "@/lib/excel";
import {
  accessEndOf,
  daysSince,
  daysUntil,
  EFFECTIVE_STATUS_LABELS,
  effectiveStatus,
  relativeDays,
  USAGE_SEGMENT_LABELS,
  type EffectiveStatus,
  type TenantUsage,
  type UsageSegment,
} from "@/lib/platform-metrics";
import { APP_MODULE_LABELS } from "@/lib/tenant";
import { cn, dayKey, formatMoney } from "@/lib/utils";
import { ActionButton } from "./feedback";
import {
  EffectiveStatusPill,
  flagsFromSub,
  MiniBars,
  ModuleChips,
  ScoreBar,
  SegmentPill,
  StatusPill,
  TrendBadge,
} from "./platform-ui";

export type SubscriberSort =
  | "attention"
  | "ends"
  | "value"
  | "usage"
  | "last_order"
  | "newest"
  | "name";

export type SubscriberView = {
  query: string;
  verify: string;
  status: "all" | "live" | "lapsed" | EffectiveStatus;
  segment: "all" | UsageSegment;
  expiringOnly: boolean;
  sort: SubscriberSort;
};

export const DEFAULT_SUBSCRIBER_VIEW: SubscriberView = {
  query: "",
  verify: "all",
  status: "all",
  segment: "all",
  expiringOnly: false,
  sort: "attention",
};

const SORT_LABELS: Record<SubscriberSort, string> = {
  attention: "Needs attention first",
  ends: "Ends soonest",
  value: "Highest monthly value",
  usage: "Lowest usage first",
  last_order: "Longest since last order",
  newest: "Newest signup",
  name: "Name A–Z",
};

const SEGMENTS: UsageSegment[] = ["healthy", "at_risk", "dormant", "not_started"];

type Enriched = {
  row: PlatformTenantRow;
  usage: TenantUsage | undefined;
  status: EffectiveStatus;
  end: string | null;
  endDays: number | null;
};

function attentionRank(e: Enriched): number {
  if (e.status === "lapsed_paid" || e.status === "lapsed_trial") return 0;
  if (e.status === "past_due") return 1;
  const live = e.status === "active" || e.status === "trialing";
  if (live && e.endDays !== null && e.endDays <= 7) return 2;
  if (live && (e.usage?.segment === "dormant" || e.usage?.segment === "at_risk"))
    return 3;
  if (live && e.usage?.segment === "not_started") return 4;
  if (live) return 6;
  return 7;
}

export function SubscribersSection({
  rows,
  usage,
  usageLoading,
  view,
  setView,
  onOpen,
}: {
  rows: PlatformTenantRow[];
  usage: Record<string, TenantUsage> | null;
  usageLoading: boolean;
  view: SubscriberView;
  setView: (next: SubscriberView) => void;
  onOpen: (id: string) => void;
}) {
  const patch = (p: Partial<SubscriberView>) => setView({ ...view, ...p });

  const enriched = useMemo<Enriched[]>(
    () =>
      rows.map((row) => {
        const end = accessEndOf(row.subscription);
        return {
          row,
          usage: usage?.[String(row.organization.id)],
          status: effectiveStatus(row.subscription),
          end,
          endDays: daysUntil(end),
        };
      }),
    [rows, usage],
  );

  const counts = useMemo(() => {
    const seg: Record<UsageSegment, number> = {
      healthy: 0,
      at_risk: 0,
      dormant: 0,
      not_started: 0,
    };
    let live = 0;
    let lapsed = 0;
    let mrr = 0;
    for (const e of enriched) {
      const isLive = e.status === "active" || e.status === "trialing";
      if (isLive) live += 1;
      if (e.status === "lapsed_paid" || e.status === "lapsed_trial") lapsed += 1;
      if (e.status === "active") mrr += e.row.billing.monthlyEtb;
      if (isLive && e.usage) seg[e.usage.segment] += 1;
    }
    return { seg, live, lapsed, mrr };
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = view.query.trim().toLowerCase();
    const list = enriched.filter((e) => {
      const org = e.row.organization;
      const sub = e.row.subscription;
      if (
        view.verify !== "all" &&
        String(org.verification_status || "pending") !== view.verify
      )
        return false;
      if (view.status === "live") {
        if (e.status !== "active" && e.status !== "trialing") return false;
      } else if (view.status === "lapsed") {
        if (e.status !== "lapsed_paid" && e.status !== "lapsed_trial") return false;
      } else if (view.status !== "all" && e.status !== view.status) {
        return false;
      }
      if (view.segment !== "all" && e.usage?.segment !== view.segment) return false;
      if (view.expiringOnly) {
        if (e.endDays === null || e.endDays < 0 || e.endDays > 10) return false;
      }
      if (!q) return true;
      const hay = [
        org.name,
        org.email,
        org.phone,
        org.city,
        org.tin,
        e.row.owner?.full_name,
        e.row.owner?.email,
        e.row.ownerAuthEmail,
        sub?.status,
        sub?.plan_code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    const ts = (iso: string | null | undefined, fallback: number) =>
      iso ? new Date(iso).getTime() : fallback;
    const sorters: Record<SubscriberSort, (a: Enriched, b: Enriched) => number> = {
      attention: (a, b) =>
        attentionRank(a) - attentionRank(b) ||
        b.row.billing.monthlyEtb - a.row.billing.monthlyEtb,
      ends: (a, b) => ts(a.end, Infinity) - ts(b.end, Infinity),
      value: (a, b) => b.row.billing.monthlyEtb - a.row.billing.monthlyEtb,
      usage: (a, b) => (a.usage?.score ?? 0) - (b.usage?.score ?? 0),
      last_order: (a, b) =>
        ts(a.usage?.lastOrderAt, 0) - ts(b.usage?.lastOrderAt, 0),
      newest: (a, b) =>
        ts(String(b.row.organization.created_at || ""), 0) -
        ts(String(a.row.organization.created_at || ""), 0),
      name: (a, b) =>
        String(a.row.organization.name).localeCompare(
          String(b.row.organization.name),
        ),
    };
    return [...list].sort(sorters[view.sort]);
  }, [enriched, view]);

  function exportExcel() {
    downloadWorkbook(`aramis-subscribers-${dayKey()}.xlsx`, [
      {
        name: "Subscribers",
        rows: filtered.map((e) => {
          const org = e.row.organization;
          const sub = e.row.subscription;
          const flags = flagsFromSub(sub);
          return {
            Business: String(org.name || ""),
            City: String(org.city || ""),
            Phone: String(org.phone || ""),
            Owner: e.row.owner?.full_name || "",
            "Owner email": e.row.ownerAuthEmail || e.row.owner?.email || "",
            Verification: String(org.verification_status || "pending"),
            Status: EFFECTIVE_STATUS_LABELS[e.status],
            Plan: String(sub?.package_code || sub?.plan_code || ""),
            Modules: (Object.keys(flags) as (keyof typeof flags)[])
              .filter((m) => flags[m])
              .map((m) => APP_MODULE_LABELS[m])
              .join(", "),
            "Access ends": e.end ? e.end.slice(0, 10) : "",
            "Days left": e.endDays ?? "",
            "Monthly value (ETB)": e.row.billing.monthlyEtb,
            "Lifetime paid (ETB)": e.row.billing.lifetimePaidEtb,
            "Usage score": e.usage?.score ?? "",
            Segment: e.usage ? USAGE_SEGMENT_LABELS[e.usage.segment] : "",
            "Orders 30d": e.usage?.orders30d ?? "",
            "Orders prev 30d": e.usage?.ordersPrev30d ?? "",
            "Sales 30d (ETB)": e.usage?.sales30d ?? "",
            "Active days 30d": e.usage?.activeDays30d ?? "",
            "Last order": e.usage?.lastOrderAt?.slice(0, 10) ?? "",
            "Owner last sign-in": e.row.ownerLastSignInAt?.slice(0, 10) ?? "",
            "Staff active": e.usage?.staffActive ?? "",
            "Staff seats": Number(sub?.max_staff_seats ?? 0),
            "Menu items": e.usage?.menuItems ?? "",
          };
        }),
      },
    ]);
  }

  return (
    <div className="space-y-3">
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-6">
        <SummaryChip
          label="Live subscribers"
          value={counts.live}
          active={view.status === "live" && view.segment === "all"}
          onClick={() => patch({ status: "live", segment: "all" })}
        />
        <SummaryChip
          label="Lapsed (needs renewal)"
          value={counts.lapsed}
          tone="coral"
          active={view.status === "lapsed"}
          onClick={() => patch({ status: "lapsed", segment: "all" })}
        />
        {SEGMENTS.map((s) => (
          <SummaryChip
            key={s}
            label={`${USAGE_SEGMENT_LABELS[s]} (live)`}
            value={usageLoading && !usage ? "…" : counts.seg[s]}
            tone={s === "healthy" ? "teal" : s === "not_started" ? "ink" : s === "at_risk" ? "gold" : "coral"}
            active={view.segment === s}
            onClick={() => patch({ status: "live", segment: s })}
          />
        ))}
      </div>

      <div className="rounded-2xl border border-ink/8 bg-white p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-[11px] font-medium text-ink/50">
            Search
            <input
              type="search"
              value={view.query}
              onChange={(e) => patch({ query: e.target.value })}
              placeholder="Name, email, phone, city…"
              className="field mt-1"
            />
          </label>
          <label className="text-[11px] font-medium text-ink/50">
            Status
            <select
              className="field mt-1"
              value={view.status}
              onChange={(e) =>
                patch({ status: e.target.value as SubscriberView["status"] })
              }
            >
              <option value="all">All statuses</option>
              <option value="live">Live (trial + paid)</option>
              <option value="trialing">Trial</option>
              <option value="active">Paid</option>
              <option value="lapsed">Lapsed (ended, not renewed)</option>
              <option value="past_due">Past due</option>
              <option value="expired">Expired</option>
              <option value="canceled">Canceled</option>
            </select>
          </label>
          <label className="text-[11px] font-medium text-ink/50">
            Usage
            <select
              className="field mt-1"
              value={view.segment}
              onChange={(e) =>
                patch({ segment: e.target.value as SubscriberView["segment"] })
              }
            >
              <option value="all">All usage</option>
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>
                  {USAGE_SEGMENT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-medium text-ink/50">
            Verification
            <select
              className="field mt-1"
              value={view.verify}
              onChange={(e) => patch({ verify: e.target.value })}
            >
              <option value="all">All verification</option>
              <option value="pending">KYC pending</option>
              <option value="approved">KYC approved</option>
              <option value="rejected">KYC rejected</option>
            </select>
          </label>
          <label className="text-[11px] font-medium text-ink/50">
            Sort
            <select
              className="field mt-1"
              value={view.sort}
              onChange={(e) => patch({ sort: e.target.value as SubscriberSort })}
            >
              {(Object.keys(SORT_LABELS) as SubscriberSort[]).map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex h-9 items-center gap-2 rounded-xl bg-stone/60 px-3 text-xs">
            <input
              type="checkbox"
              checked={view.expiringOnly}
              onChange={(e) => patch({ expiringOnly: e.target.checked })}
            />
            Ending ≤10d
          </label>
          <button
            type="button"
            className="rounded-xl border border-ink/12 px-3 py-1.5 text-xs font-medium"
            onClick={() => setView(DEFAULT_SUBSCRIBER_VIEW)}
          >
            Reset
          </button>
          <ActionButton
            disabled={!filtered.length}
            pendingLabel="Exporting…"
            className="ml-auto rounded-xl bg-ink px-3 py-1.5 text-xs font-semibold text-stone"
            onAction={async () => {
              exportExcel();
            }}
          >
            {`Export Excel (${filtered.length})`}
          </ActionButton>
        </div>
      </div>

      <p className="text-xs text-ink/50">
        {filtered.length} of {rows.length} restaurants · paid MRR{" "}
        <strong className="text-ink/70">{formatMoney(Math.round(counts.mrr))}</strong>
        {usageLoading ? " · loading usage…" : ""}
      </p>

      <ul className="space-y-2 lg:hidden">
        {filtered.map((e) => (
          <SubscriberCard key={String(e.row.organization.id)} e={e} onOpen={onOpen} />
        ))}
        {filtered.length === 0 ? (
          <li className="rounded-3xl border border-ink/8 bg-white px-4 py-12 text-center text-sm text-ink/50">
            No subscribers match these filters
          </li>
        ) : null}
      </ul>

      <div className="hidden overflow-x-auto rounded-3xl border border-ink/8 bg-white lg:block">
        <div className="min-w-[860px]">
        <div className="grid grid-cols-[1.4fr_1.15fr_0.85fr_1.5fr_1fr] gap-3 border-b border-ink/8 bg-stone/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink/45">
          <span>Business</span>
          <span>Subscription</span>
          <span>Value</span>
          <span>Usage (30 days)</span>
          <span>Last activity</span>
        </div>
        <ul className="divide-y divide-ink/5">
          {filtered.map((e) => (
            <SubscriberRow key={String(e.row.organization.id)} e={e} onOpen={onOpen} />
          ))}
          {filtered.length === 0 ? (
            <li className="px-4 py-12 text-center text-sm text-ink/50">
              No subscribers match these filters
            </li>
          ) : null}
        </ul>
        </div>
      </div>
    </div>
  );
}

function SubscriberRow({
  e,
  onOpen,
}: {
  e: Enriched;
  onOpen: (id: string) => void;
}) {
  const { row, usage } = e;
  const org = row.organization;
  const sub = row.subscription;
  const flags = flagsFromSub(sub);
  const seats = Number(sub?.max_staff_seats ?? 0);
  const lastOrderDays = daysSince(usage?.lastOrderAt ?? null);
  const signInDays = daysSince(row.ownerLastSignInAt);
  const endSoon =
    e.endDays !== null && e.endDays >= 0 && e.endDays <= 7;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(String(org.id))}
        className="grid w-full grid-cols-[1.4fr_1.15fr_0.85fr_1.5fr_1fr] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-stone/40"
      >
        <span className="min-w-0">
          <span className="font-medium">{String(org.name)}</span>
          <span className="mt-0.5 block truncate text-xs text-ink/45">
            {row.owner?.full_name || "—"} · {String(org.city || "—")} ·{" "}
            {String(org.phone || "—")}
          </span>
          {org.verification_status !== "approved" ? (
            <span className="mt-1 inline-block">
              <StatusPill
                status={`KYC ${String(org.verification_status || "pending")}`}
                tone={org.verification_status === "rejected" ? "coral" : "gold"}
              />
            </span>
          ) : null}
        </span>

        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1">
            <EffectiveStatusPill status={e.status} />
            <span className="text-xs text-ink/50">
              {String(sub?.package_code || sub?.plan_code || "custom")}
            </span>
          </span>
          <span
            className={cn(
              "mt-0.5 block text-xs",
              endSoon || (e.endDays !== null && e.endDays < 0)
                ? "font-semibold text-coral"
                : "text-ink/50",
            )}
          >
            {e.end ? `Ends ${relativeDays(e.endDays)}` : "No end date"}
          </span>
          <span className="mt-1 block">
            <ModuleChips flags={flags} />
          </span>
        </span>

        <span className="text-xs text-ink/60">
          <span className="block font-semibold text-ink">
            {row.billing.monthlyEtb > 0
              ? `${formatMoney(row.billing.monthlyEtb)}/mo`
              : "—"}
          </span>
          <span className="block">
            Paid {formatMoney(row.billing.lifetimePaidEtb)}
          </span>
          <span className="block text-ink/40">
            {row.billing.approvedPayments} payment
            {row.billing.approvedPayments === 1 ? "" : "s"}
          </span>
        </span>

        <span className="min-w-0">
          {usage ? (
            <>
              <span className="flex flex-wrap items-center gap-2">
                <SegmentPill segment={usage.segment} />
                <ScoreBar score={usage.score} />
              </span>
              <span className="mt-1 flex items-center gap-2">
                <MiniBars values={usage.dailyOrders} className="shrink-0" />
                <span className="whitespace-nowrap text-xs text-ink/60">
                  <strong className="text-ink">{usage.orders30d}</strong> orders{" "}
                  <TrendBadge
                    current={usage.orders30d}
                    previous={usage.ordersPrev30d}
                  />
                </span>
              </span>
              <span className="mt-0.5 block whitespace-nowrap text-[11px] text-ink/45">
                {usage.activeDays30d}/30 days · {formatMoney(usage.sales30d)}
              </span>
            </>
          ) : (
            <span className="text-xs text-ink/40">—</span>
          )}
        </span>

        <span className="text-xs text-ink/55">
          <span
            className={cn(
              "block",
              lastOrderDays !== null && lastOrderDays > 7 && "text-coral",
            )}
          >
            Last order:{" "}
            {lastOrderDays === null ? "none in 60d" : relativeDays(-lastOrderDays)}
          </span>
          <span className="block">
            Owner sign-in: {signInDays === null ? "never" : relativeDays(-signInDays)}
          </span>
          <span
            className={cn(
              "block",
              usage && seats > 0 && usage.staffActive >= seats && "text-gold",
            )}
          >
            Staff {usage?.staffActive ?? "—"}/{seats || "—"} seats
          </span>
        </span>
      </button>
    </li>
  );
}

function SubscriberCard({
  e,
  onOpen,
}: {
  e: Enriched;
  onOpen: (id: string) => void;
}) {
  const { row, usage } = e;
  const org = row.organization;
  const lastOrderDays = daysSince(usage?.lastOrderAt ?? null);
  const endSoon = e.endDays !== null && e.endDays >= 0 && e.endDays <= 7;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(String(org.id))}
        className="w-full rounded-3xl border border-ink/8 bg-white p-4 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-lg leading-tight">{String(org.name)}</p>
            <p className="mt-0.5 truncate text-xs text-ink/50">
              {row.owner?.full_name || "—"} · {String(org.city || "—")}
            </p>
          </div>
          <EffectiveStatusPill status={e.status} />
        </div>
        <p
          className={cn(
            "mt-2 text-xs",
            endSoon || (e.endDays !== null && e.endDays < 0)
              ? "font-semibold text-coral"
              : "text-ink/55",
          )}
        >
          {e.row.billing.monthlyEtb > 0
            ? `${formatMoney(e.row.billing.monthlyEtb)}/mo · `
            : ""}
          {e.end ? `ends ${relativeDays(e.endDays)}` : "no end date"}
          {usage ? ` · score ${usage.score}` : ""}
        </p>
        <p className="mt-1 text-xs text-ink/45">
          Last order{" "}
          {lastOrderDays === null ? "none in 60d" : relativeDays(-lastOrderDays)}
        </p>
      </button>
    </li>
  );
}

function SummaryChip({
  label,
  value,
  tone = "teal",
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  tone?: "teal" | "gold" | "coral" | "ink";
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-w-[8.75rem] shrink-0 rounded-2xl border bg-white px-3 py-2 text-left transition sm:min-w-0",
        active ? "border-teal ring-2 ring-teal/20" : "border-ink/8 hover:border-teal/40",
      )}
    >
      <p className="text-[11px] text-ink/50">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-display text-xl",
          tone === "teal" && "text-teal",
          tone === "gold" && "text-ink",
          tone === "coral" && "text-coral",
          tone === "ink" && "text-ink/70",
        )}
      >
        {value}
      </p>
    </button>
  );
}
