"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  CreditCard,
  Package,
  ShoppingCart,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getCloudSalesSummary } from "@/lib/cloud-sales";
import { seedOrgCatalog } from "@/lib/cloud-catalog";
import { formatMoney } from "@/lib/utils";

export function HomeHub() {
  const { tenant, hasModule, daysLeft, warningLevel } = useAuth();
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);

  useEffect(() => {
    if (!tenant) return;
    void (async () => {
      try {
        if (hasModule("inventory")) {
          await seedOrgCatalog(tenant.organization.id);
        }
        if (hasModule("finance") || hasModule("inventory")) {
          const summary = await getCloudSalesSummary(
            tenant.organization.id,
            "today",
          );
          setTodayRevenue(summary.revenue);
          setTodayOrders(summary.orderCount);
        }
      } catch {
        /* ignore seed/load errors on hub */
      }
    })();
  }, [tenant, hasModule]);

  if (!tenant) return null;

  const cards = [
    ...(hasModule("inventory")
      ? [
          {
            href: "/app/order",
            title: "Order food",
            blurb: "Cashier POS — charge & print one receipt",
            icon: ShoppingCart,
            primary: true,
          },
          {
            href: "/app/menu",
            title: "Menu",
            blurb: "Prices, recipes & popularity votes",
            icon: ClipboardList,
            primary: false,
          },
          {
            href: "/app/inventory",
            title: "Inventory",
            blurb: "Stock with cost history",
            icon: Package,
            primary: false,
          },
        ]
      : []),
    ...(hasModule("finance")
      ? [
          {
            href: "/app/reports",
            title: "Finance",
            blurb: "Sales periods & accountant day close",
            icon: BarChart3,
            primary: false,
          },
        ]
      : []),
    {
      href: "/app/billing",
      title: "Billing & modules",
      blurb: "Trial, payment proof, enable Inventory / Finance",
      icon: CreditCard,
      primary: false,
    },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="overflow-hidden rounded-3xl border border-ink/8 bg-gradient-to-br from-ink via-ink to-teal/90 p-5 text-stone shadow-xl sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold/80">
          Aramis Product
        </p>
        <h2 className="mt-2 font-display text-3xl text-gold sm:text-4xl">
          {tenant.profile.full_name}
        </h2>
        <p className="mt-2 max-w-xl text-sm text-stone/75">
          {tenant.organization.name} · {tenant.organization.org_type}
          {daysLeft <= 10 && daysLeft < 900
            ? ` · ${Math.max(0, daysLeft)} day(s) left`
            : ""}
        </p>
        {warningLevel !== "none" ? (
          <p
            className={
              warningLevel === "urgent"
                ? "mt-2 text-sm font-medium text-coral"
                : "mt-2 text-sm text-gold"
            }
          >
            {tenant.subscription.status === "trialing" ? "Trial" : "Plan"} ends
            soon — renew in Billing.
          </p>
        ) : null}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-2xl bg-white/10 px-3 py-3 backdrop-blur">
            <p className="text-xs text-stone/60">Today&apos;s sales</p>
            <p className="mt-1 font-display text-xl sm:text-2xl">
              {formatMoney(todayRevenue)}
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-3 backdrop-blur">
            <p className="text-xs text-stone/60">Orders today</p>
            <p className="mt-1 font-display text-xl sm:text-2xl">{todayOrders}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className={
                card.primary
                  ? "group relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal to-teal/80 p-5 text-white shadow-lg shadow-teal/25 transition hover:scale-[1.01] sm:col-span-2 sm:p-6"
                  : "rounded-3xl border border-ink/8 bg-white/80 p-5 shadow-sm transition hover:border-teal/30 hover:shadow-md"
              }
            >
              <div className="flex items-start gap-4">
                <span
                  className={
                    card.primary
                      ? "rounded-2xl bg-white/15 p-3"
                      : "rounded-2xl bg-teal/10 p-3 text-teal"
                  }
                >
                  <Icon className="h-6 w-6" />
                </span>
                <div>
                  <h3
                    className={
                      card.primary
                        ? "font-display text-2xl"
                        : "font-display text-xl text-ink"
                    }
                  >
                    {card.title}
                  </h3>
                  <p
                    className={
                      card.primary
                        ? "mt-1 text-sm text-white/80"
                        : "mt-1 text-sm text-ink/55"
                    }
                  >
                    {card.blurb}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
