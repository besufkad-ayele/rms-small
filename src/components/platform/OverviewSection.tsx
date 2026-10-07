"use client";

import { useMemo, type ReactNode } from "react";
import type {
  PlatformOverviewStats,
  PlatformTenantRow,
} from "@/app/platform/actions";
import {
  daysSince,
  effectiveStatus,
  relativeDays,
  USAGE_SEGMENT_LABELS,
  type TenantUsage,
  type UsageSegment,
} from "@/lib/platform-metrics";
import { cn, formatMoney } from "@/lib/utils";
import { Shimmer } from "@/components/ui/Shimmer";
import type { SubscriberView } from "./SubscribersSection";
import {
  EffectiveStatusPill,
  ScoreBar,
  SegmentPill,
  StatusPill,
  TrendBadge,
} from "./platform-ui";

const SEGMENT_BAR: Record<UsageSegment, string> = {
  healthy: "bg-teal",
  at_risk: "bg-gold",
  dormant: "bg-coral",
  not_started: "bg-ink/25",
};

export function OverviewSection({
  stats,
  tenants,
  usage,
  onOpenKyc,
  onOpenPayments,
  onOpenOrg,
  onOpenSubscribers,
}: {
  stats: PlatformOverviewStats;
  tenants: PlatformTenantRow[];
  usage: Record<string, TenantUsage> | null;
  onOpenKyc: () => void;
  onOpenPayments: () => void;
  onOpenOrg: (id: string) => void;
  onOpenSubscribers: (view: Partial<SubscriberView>) => void;
}) {
  const live = useMemo(
    () =>
      tenants
        .map((row) => ({
          row,
          status: effectiveStatus(row.subscription),
          usage: usage?.[String(row.organization.id)],
        }))
        .filter((t) => t.status === "active" || t.status === "trialing"),
    [tenants, usage],
  );

  const segments = useMemo(() => {
    const out: Record<UsageSegment, number> = {
      healthy: 0,
      at_risk: 0,
      dormant: 0,
      not_started: 0,
    };
    for (const t of live) if (t.usage) out[t.usage.segment] += 1;
    return out;
  }, [live]);

  const atRisk = useMemo(
    () =>
      live
        .filter(
          (t) =>
            t.usage &&
            (t.usage.segment === "at_risk" ||
              t.usage.segment === "dormant" ||
              t.usage.segment === "not_started"),
        )
        .sort(
          (a, b) =>
            b.row.billing.monthlyEtb - a.row.billing.monthlyEtb ||
            (a.usage?.score ?? 0) - (b.usage?.score ?? 0),
        )
        .slice(0, 8),
    [live],
  );

  const totals = useMemo(() => {
    let orders = 0;
    let prev = 0;
    let gmv = 0;
    for (const t of live) {
      orders += t.usage?.orders30d ?? 0;
      prev += t.usage?.ordersPrev30d ?? 0;
      gmv += t.usage?.sales30d ?? 0;
    }
    return { orders, prev, gmv };
  }, [live]);

  const maxRevenue = Math.max(1, ...stats.revenueByMonth.map((m) => m.amount));
  const statusMix: Array<{
    label: string;
    value: number;
    bar: string;
    view: Partial<SubscriberView>;
  }> = [
    { label: "Paid", value: stats.active, bar: "bg-teal", view: { status: "active" } },
    { label: "Trial", value: stats.trialing, bar: "bg-teal/45", view: { status: "trialing" } },
    { label: "Lapsed", value: stats.lapsed, bar: "bg-coral", view: { status: "lapsed" } },
    { label: "Past due", value: stats.pastDue, bar: "bg-gold", view: { status: "past_due" } },
    { label: "Expired", value: stats.expired, bar: "bg-coral/50", view: { status: "expired" } },
    { label: "Canceled", value: stats.canceled, bar: "bg-ink/25", view: { status: "canceled" } },
  ];
  const statusTotal = Math.max(
    1,
    statusMix.reduce((s, m) => s + m.value, 0),
  );
  const segTotal = Math.max(
    1,
    Object.values(segments).reduce((s, v) => s + v, 0),
  );

  const kpis: Array<{
    label: string;
    value: string | number;
    hint?: ReactNode;
    action?: () => void;
  }> = [
    {
      label: "MRR (paid)",
      value: formatMoney(stats.mrr),
      hint: `${stats.payingCount} paying`,
      action: () => onOpenSubscribers({ status: "active", sort: "value" }),
    },
    {
      label: "Avg. revenue / account",
      value: formatMoney(stats.arpa),
      hint: "per month",
    },
    {
      label: "Trial pipeline",
      value: formatMoney(stats.trialPipelineMrr),
      hint: `${stats.trialing} trials at list price`,
      action: () => onOpenSubscribers({ status: "trialing", sort: "ends" }),
    },
    {
      label: "Collected this month",
      value: formatMoney(stats.revenueThisMonth),
      hint: (
        <>
          vs {formatMoney(stats.revenueLastMonth)}{" "}
          <TrendBadge
            current={stats.revenueThisMonth}
            previous={stats.revenueLastMonth}
          />
        </>
      ),
    },
    {
      label: "Trial → paid",
      value: `${Math.round(stats.conversionRate * 100)}%`,
      hint: "of approved restaurants",
    },
    {
      label: "Collected all time",
      value: formatMoney(stats.revenueAllTime),
    },
  ];

  const ops: Array<{
    label: string;
    value: number;
    urgent: boolean;
    action: () => void;
  }> = [
    { label: "Pending KYC", value: stats.pendingKyc, urgent: stats.pendingKyc > 0, action: onOpenKyc },
    { label: "Payments to verify", value: stats.pendingPayments, urgent: stats.pendingPayments > 0, action: onOpenPayments },
    {
      label: "Lapsed — chase renewal",
      value: stats.lapsed,
      urgent: stats.lapsed > 0,
      action: () => onOpenSubscribers({ status: "lapsed" }),
    },
    {
      label: "Ending in 7 days",
      value: stats.expiring7d,
      urgent: stats.expiring7d > 0,
      action: () => onOpenSubscribers({ status: "live", expiringOnly: true, sort: "ends" }),
    },
    {
      label: "Follow-ups due",
      value: stats.followUpsDue ?? 0,
      urgent: (stats.followUpsDue ?? 0) > 0,
      action: () => onOpenSubscribers({ sort: "attention" }),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {ops.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={c.action}
            className={cn(
              "rounded-2xl border px-3 py-3 text-left transition hover:border-teal/40",
              c.urgent ? "border-coral/30 bg-coral/5" : "border-ink/8 bg-white",
            )}
          >
            <p className="text-[11px] text-ink/50">{c.label}</p>
            <p
              className={cn(
                "mt-1 font-display text-2xl",
                c.urgent ? "text-coral" : "text-ink",
              )}
            >
              {c.value}
            </p>
          </button>
        ))}
      </div>

      <section className="rounded-3xl border border-white/8 bg-gradient-to-br from-[#0f2a26] via-[#0b1d1a] to-[#1d6f66] p-4 text-[#eef2f0] sm:p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#f0d078]/80">
          Revenue
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {kpis.map((k) => (
              <button
                key={k.label}
                type="button"
                disabled={!k.action}
                onClick={k.action}
                className={cn(
                  "rounded-2xl bg-white/8 px-3 py-2.5 text-left",
                  k.action && "hover:bg-white/15",
                )}
              >
                <p className="text-[11px] text-white/60">{k.label}</p>
                <p className="mt-0.5 font-display text-lg text-[#f0d078]">
                  {k.value}
                </p>
                {k.hint ? (
                  <p className="mt-0.5 text-[10px] text-white/55">{k.hint}</p>
                ) : null}
              </button>
            ))}
          </div>
          <div>
            <p className="text-xs text-white/60">
              Approved payments by month
            </p>
            <div className="mt-2 flex h-32 items-end gap-2">
              {stats.revenueByMonth.map((m) => (
                <div
                  key={m.key}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${m.label}: ${formatMoney(m.amount)}`}
                >
                  <span className="text-[9px] tabular-nums text-white/60">
                    {m.amount >= 1000
                      ? `${(m.amount / 1000).toFixed(1)}k`
                      : Math.round(m.amount)}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-[#f0d078]/85"
                    style={{
                      height: `${Math.max(3, (m.amount / maxRevenue) * 88)}px`,
                    }}
                  />
                  <span className="text-[10px] text-white/70">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
          <h3 className="font-display text-lg">Subscriptions</h3>
          <p className="text-xs text-ink/50">
            {stats.totalOrgs} restaurants · status as the café sees it
          </p>
          <StackBar
            parts={statusMix.map((m) => ({ value: m.value, bar: m.bar }))}
            total={statusTotal}
          />
          <ul className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-3">
            {statusMix.map((m) => (
              <li key={m.label}>
                <button
                  type="button"
                  onClick={() => onOpenSubscribers(m.view)}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-stone/50"
                >
                  <span className={cn("h-2.5 w-2.5 rounded-full", m.bar)} />
                  <span className="text-ink/65">{m.label}</span>
                  <span className="ml-auto font-semibold tabular-nums">
                    {m.value}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
          <h3 className="font-display text-lg">Usage health (live subscribers)</h3>
          <p className="text-xs text-ink/50">
            {usage ? (
              <>
                {totals.orders.toLocaleString()} orders ·{" "}
                {formatMoney(Math.round(totals.gmv))} processed in 30 days{" "}
              </>
            ) : (
              <Shimmer className="mt-1 inline-block h-3 w-56 align-middle" />
            )}
            {usage ? (
              <TrendBadge current={totals.orders} previous={totals.prev} />
            ) : null}
          </p>
          <StackBar
            parts={(Object.keys(segments) as UsageSegment[]).map((s) => ({
              value: segments[s],
              bar: SEGMENT_BAR[s],
            }))}
            total={segTotal}
          />
          <ul className="mt-3 grid grid-cols-2 gap-1">
            {(Object.keys(segments) as UsageSegment[]).map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => onOpenSubscribers({ status: "live", segment: s })}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-stone/50"
                >
                  <span className={cn("h-2.5 w-2.5 rounded-full", SEGMENT_BAR[s])} />
                  <span className="text-ink/65">{USAGE_SEGMENT_LABELS[s]}</span>
                  <span className="ml-auto font-semibold tabular-nums">
                    {segments[s]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-ink/40">
            Healthy = ordering most days · At risk = low or falling activity ·
            Dormant = no order in 14+ days · Not started = no menu or orders yet
          </p>
        </section>
      </div>

      <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-lg">Churn risk — call these first</h3>
          <button
            type="button"
            className="text-xs font-medium text-teal underline"
            onClick={() => onOpenSubscribers({ status: "live", sort: "usage" })}
          >
            See all by usage
          </button>
        </div>
        <ul className="mt-3 divide-y divide-ink/5">
          {atRisk.map((t) => {
            const since = daysSince(t.usage?.lastOrderAt ?? null);
            return (
              <li key={String(t.row.organization.id)}>
                <button
                  type="button"
                  onClick={() => onOpenOrg(String(t.row.organization.id))}
                  className="grid w-full gap-1 py-2.5 text-left text-sm hover:bg-stone/40 sm:grid-cols-[1.4fr_auto_auto_1fr] sm:items-center sm:gap-4"
                >
                  <span className="font-medium">
                    {String(t.row.organization.name)}
                    <span className="ml-2 inline-flex gap-1 align-middle">
                      <EffectiveStatusPill status={t.status} />
                    </span>
                  </span>
                  {t.usage ? <SegmentPill segment={t.usage.segment} /> : null}
                  {t.usage ? <ScoreBar score={t.usage.score} /> : null}
                  <span className="text-xs text-ink/55 sm:text-right">
                    {t.row.billing.monthlyEtb > 0
                      ? `${formatMoney(t.row.billing.monthlyEtb)}/mo · `
                      : ""}
                    last order{" "}
                    {since === null ? "none in 60d" : relativeDays(-since)}
                  </span>
                </button>
              </li>
            );
          })}
          {atRisk.length === 0 ? (
            <li className="py-6 text-center text-sm text-ink/45">
              {usage ? (
                "No live subscriber is at risk"
              ) : (
                <div className="mx-auto max-w-xs space-y-2">
                  <Shimmer className="mx-auto h-3 w-40" />
                  <Shimmer className="mx-auto h-3 w-28" />
                </div>
              )}
            </li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
        <h3 className="font-display text-lg">Needs attention</h3>
        <ul className="mt-3 divide-y divide-ink/5">
          {stats.needsAttention.map((item, i) => (
            <li key={`${item.kind}-${item.organizationId}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  if (item.kind === "kyc") onOpenKyc();
                  else if (item.kind === "payment") onOpenPayments();
                  else onOpenOrg(item.organizationId);
                }}
                className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:bg-stone/40"
              >
                <span>
                  <span className="font-medium">{item.name}</span>
                  <span className="ml-2 text-ink/50">{item.detail}</span>
                </span>
                <StatusPill
                  status={item.kind}
                  tone={
                    item.kind === "expiring" || item.kind === "followup"
                      ? "gold"
                      : item.kind === "payment"
                        ? "teal"
                        : "coral"
                  }
                />
              </button>
            </li>
          ))}
          {stats.needsAttention.length === 0 ? (
            <li className="py-6 text-center text-sm text-ink/45">
              All clear — nothing pending
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

function StackBar({
  parts,
  total,
}: {
  parts: Array<{ value: number; bar: string }>;
  total: number;
}) {
  return (
    <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-ink/5">
      {parts.map((p, i) =>
        p.value > 0 ? (
          <span
            key={i}
            className={p.bar}
            style={{ width: `${(p.value / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}
