"use client";

import type { PlatformOverviewStats } from "@/app/platform/actions";
import { cn, formatMoney } from "@/lib/utils";
import { StatusPill } from "./platform-ui";

export function OverviewSection({
  stats,
  onOpenKyc,
  onOpenPayments,
  onOpenOrg,
}: {
  stats: PlatformOverviewStats;
  onOpenKyc: () => void;
  onOpenPayments: () => void;
  onOpenOrg: (id: string) => void;
}) {
  const cards: Array<{
    label: string;
    value: string | number;
    action?: () => void;
  }> = [
    { label: "Organizations", value: stats.totalOrgs },
    { label: "Pending KYC", value: stats.pendingKyc, action: onOpenKyc },
    { label: "Pending payments", value: stats.pendingPayments, action: onOpenPayments },
    { label: "Follow-ups due", value: stats.followUpsDue ?? 0 },
    { label: "Live trials", value: stats.trialing },
    { label: "Active", value: stats.active },
    { label: "Expired", value: stats.expired },
    { label: "Past due", value: stats.pastDue },
    { label: "Revenue (month)", value: formatMoney(stats.revenueThisMonth) },
    { label: "Revenue (all)", value: formatMoney(stats.revenueAllTime) },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-ink/8 bg-gradient-to-br from-ink to-teal/90 p-5 text-stone sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/80">
          Dashboard
        </p>
        <h2 className="mt-1 font-display text-3xl text-gold">
          Subscription ops
        </h2>
        <p className="mt-2 max-w-xl text-sm text-stone/70">
          KYC, payments, trials, and package pricing — one place for Aramis
          Product owners.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            disabled={!c.action}
            onClick={c.action}
            className={cn(
              "rounded-2xl border border-ink/8 bg-white px-3 py-3 text-left",
              c.action && "hover:border-teal/40",
            )}
          >
            <p className="text-[11px] text-ink/50">{c.label}</p>
            <p className="mt-1 font-display text-xl text-ink">{c.value}</p>
          </button>
        ))}
      </div>

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
