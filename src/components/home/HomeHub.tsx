"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  CreditCard,
  Package,
  ShoppingCart,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getSpendDashboard, type SpendDashboard } from "@/lib/cloud-bills";
import {
  summarizeInventory,
  type InventoryDashboard,
} from "@/lib/cloud-catalog";
import { getCloudSalesSummary } from "@/lib/cloud-sales";
import { loadInventoryResilient } from "@/lib/offline/resilient";
import { cn, formatMoney } from "@/lib/utils";

export function HomeHub() {
  const { tenant, hasFeature, daysLeft, warningLevel } = useAuth();
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);
  const [inventory, setInventory] = useState<InventoryDashboard | null>(null);
  const [spend, setSpend] = useState<SpendDashboard | null>(null);

  useEffect(() => {
    if (!tenant) return;
    void (async () => {
      try {
        if (hasFeature("inventory")) {
          const items = await loadInventoryResilient(tenant.organization.id);
          setInventory(summarizeInventory(items));
        }
        if (hasFeature("finance") || hasFeature("order")) {
          const summary = await getCloudSalesSummary(
            tenant.organization.id,
            "today",
          );
          setTodayRevenue(summary.revenue);
          setTodayOrders(summary.orderCount);
        }
        if (hasFeature("finance")) {
          setSpend(await getSpendDashboard(tenant.organization.id));
        }
      } catch {
        /* ignore seed/load errors on hub */
      }
    })();
  }, [tenant, hasFeature]);

  if (!tenant) return null;

  const modules = [
    ...(hasFeature("menu")
      ? [
          {
            href: "/app/menu",
            title: "Menu",
            blurb: "Prices, recipes & popularity",
            icon: ClipboardList,
          },
        ]
      : []),
    ...(hasFeature("inventory")
      ? [
          {
            href: "/app/inventory",
            title: "Inventory",
            blurb: "Stock with cost history",
            icon: Package,
          },
        ]
      : []),
    ...(hasFeature("finance")
      ? [
          {
            href: "/app/reports",
            title: "Finance",
            blurb: "Sales, bills & day close",
            icon: BarChart3,
          },
        ]
      : []),
    ...(hasFeature("billing")
      ? [
          {
            href: "/app/billing",
            title: "Billing",
            blurb: "Trial, modules & payments",
            icon: CreditCard,
          },
        ]
      : []),
    ...(hasFeature("staff")
      ? [
          {
            href: "/app/staff",
            title: "Staff",
            blurb: "Logins & feature access",
            icon: Users,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-5">
      <section className="w-full overflow-hidden rounded-3xl border border-ink/8 bg-gradient-to-br from-ink via-ink to-teal/90 p-5 text-stone shadow-xl sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold/80">
              Aramis Product
            </p>
            <h2 className="mt-2 font-display text-3xl text-gold sm:text-4xl">
              {tenant.profile.full_name}
            </h2>
            <p className="mt-2 text-sm text-stone/75">
              {tenant.organization.name} · {tenant.organization.org_type}
              {daysLeft <= 10 && daysLeft < 900
                ? ` · ${Math.max(0, daysLeft)} day(s) left`
                : ""}
            </p>
            {warningLevel !== "none" ? (
              <p
                className={cn(
                  "mt-2 text-sm font-medium",
                  warningLevel === "urgent" ? "text-coral" : "text-gold",
                )}
              >
                {tenant.subscription.status === "trialing" ? "Trial" : "Plan"}{" "}
                ends soon — renew in Billing.
              </p>
            ) : null}
          </div>
          <div className="grid w-full grid-cols-2 gap-3 lg:max-w-sm lg:shrink-0">
            <div className="rounded-2xl bg-white/10 px-3 py-3 backdrop-blur">
              <p className="text-xs text-stone/60">Today&apos;s sales</p>
              <p className="mt-1 font-display text-xl sm:text-2xl">
                {formatMoney(todayRevenue)}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-3 backdrop-blur">
              <p className="text-xs text-stone/60">Orders today</p>
              <p className="mt-1 font-display text-xl sm:text-2xl">
                {todayOrders}
              </p>
            </div>
          </div>
        </div>
      </section>

      {(hasFeature("inventory") || hasFeature("finance")) &&
      (inventory || spend) ? (
        <section
          className={cn(
            "grid w-full gap-3",
            hasFeature("inventory") && hasFeature("finance")
              ? "sm:grid-cols-2"
              : "grid-cols-1",
          )}
        >
          {hasFeature("inventory") && inventory ? (
            <Link
              href="/app/inventory"
              className="rounded-3xl border border-ink/8 bg-white/90 p-5 shadow-sm transition hover:border-teal/30 hover:shadow-md"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-2xl bg-teal/10 p-2 text-teal">
                  <Package className="h-4 w-4" />
                </span>
                <h3 className="font-display text-lg text-ink">
                  Inventory dashboard
                </h3>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[11px] text-ink/50">Items</p>
                  <p className="font-display text-xl">{inventory.itemCount}</p>
                </div>
                <div>
                  <p className="text-[11px] text-ink/50">Stock value</p>
                  <p className="font-display text-xl">
                    {formatMoney(inventory.stockValue)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-ink/50">Low stock</p>
                  <p
                    className={cn(
                      "flex items-center gap-1 font-display text-xl",
                      inventory.lowStockCount > 0 && "text-coral",
                    )}
                  >
                    {inventory.lowStockCount > 0 ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : null}
                    {inventory.lowStockCount}
                  </p>
                </div>
              </div>
            </Link>
          ) : null}

          {hasFeature("finance") && spend ? (
            <Link
              href="/app/reports"
              className="rounded-3xl border border-ink/8 bg-white/90 p-5 shadow-sm transition hover:border-coral/30 hover:shadow-md"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-2xl bg-coral/10 p-2 text-coral">
                  <Wallet className="h-4 w-4" />
                </span>
                <h3 className="font-display text-lg text-ink">
                  Spend dashboard
                </h3>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[11px] text-ink/50">Today</p>
                  <p className="font-display text-xl">
                    {formatMoney(spend.todaySpent)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-ink/50">This month</p>
                  <p className="font-display text-xl">
                    {formatMoney(spend.monthSpent)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-ink/50">Bills</p>
                  <p className="font-display text-xl">{spend.billCount}</p>
                </div>
              </div>
            </Link>
          ) : null}
        </section>
      ) : null}

      {hasFeature("order") ? (
        <Link
          href="/app/order"
          className="flex w-full items-start gap-4 rounded-3xl bg-gradient-to-br from-teal to-teal/80 p-5 text-white shadow-lg shadow-teal/25 transition hover:brightness-105 sm:p-6"
        >
          <span className="rounded-2xl bg-white/15 p-3">
            <ShoppingCart className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-2xl">Order food</h3>
            <p className="mt-1 text-sm text-white/80">
              Cashier POS — charge & print one receipt
            </p>
          </div>
        </Link>
      ) : null}

      <section
        className={cn(
          "grid w-full gap-3",
          modules.length >= 4
            ? "sm:grid-cols-2 lg:grid-cols-4"
            : modules.length === 3
              ? "sm:grid-cols-3"
              : "sm:grid-cols-2",
        )}
      >
        {modules.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="flex h-full min-h-[7.5rem] flex-col rounded-3xl border border-ink/8 bg-white/90 p-5 shadow-sm transition hover:border-teal/30 hover:shadow-md"
            >
              <span className="mb-3 w-fit rounded-2xl bg-teal/10 p-2.5 text-teal">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="font-display text-lg text-ink">{card.title}</h3>
              <p className="mt-1 text-sm text-ink/55">{card.blurb}</p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
