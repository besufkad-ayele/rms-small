"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  ChefHat,
  ClipboardList,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingCart,
  Users,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AramisLogo } from "@/components/brand/AramisLogo";
import { InstallAppButton } from "@/components/offline/InstallAppButton";
import { useOfflineSync } from "@/components/offline/OfflineSyncProvider";
import { SyncControls, SyncSuccessDialog } from "@/components/offline/SyncUI";
import { isOwner } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const PAGE_TITLES: { match: (path: string) => boolean; title: string }[] = [
  { match: (p) => p === "/app", title: "Home" },
  { match: (p) => p.startsWith("/app/order"), title: "Order" },
  { match: (p) => p.startsWith("/app/kitchen"), title: "Kitchen" },
  { match: (p) => p.startsWith("/app/menu"), title: "Menu" },
  { match: (p) => p.startsWith("/app/inventory"), title: "Inventory" },
  { match: (p) => p.startsWith("/app/reports"), title: "Finance" },
  {
    match: (p) =>
      p.startsWith("/app/settings") || p.startsWith("/app/billing"),
    title: "Settings & Billing",
  },
  { match: (p) => p.startsWith("/app/staff"), title: "Staff & HR" },
];

function titleForPath(pathname: string, override?: string) {
  if (override) return override;
  return PAGE_TITLES.find((t) => t.match(pathname))?.title ?? "Dashboard";
}

export function AppShell({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    tenant,
    logout,
    hasFeature,
    daysLeft,
    warningLevel,
    accessBlocked,
    isPlatformAdmin,
  } = useAuth();
  const { connection, pendingCount } = useOfflineSync();
  const isOffline = connection.status === "down";
  const [open, setOpen] = useState(false);
  const heading = titleForPath(pathname, title);
  const owner = tenant ? isOwner(tenant.membership) : false;

  const nav = [
    { href: "/app", label: "Home", icon: LayoutGrid, exact: true },
    ...(hasFeature("order")
      ? [{ href: "/app/order", label: "Order", icon: ShoppingCart }]
      : []),
    ...(hasFeature("kitchen")
      ? [{ href: "/app/kitchen", label: "Kitchen", icon: ChefHat }]
      : []),
    ...(hasFeature("menu")
      ? [{ href: "/app/menu", label: "Menu", icon: ClipboardList }]
      : []),
    ...(hasFeature("inventory") || hasFeature("inventory_issue")
      ? [{ href: "/app/inventory", label: "Inventory", icon: Package }]
      : []),
    ...(hasFeature("finance")
      ? [{ href: "/app/reports", label: "Finance", icon: BarChart3 }]
      : []),
    {
      href: "/app/settings",
      label: owner ? "Settings & Billing" : "Settings",
      icon: Settings,
    },
    ...(hasFeature("staff")
      ? [{ href: "/app/staff", label: "Staff", icon: Users }]
      : []),
    ...(isPlatformAdmin
      ? [{ href: "/platform", label: "Platform", icon: LayoutGrid }]
      : []),
  ];

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-dvh bg-stone text-ink">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-teal/15 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-gold/20 blur-3xl" />
      </div>

      {/* Fixed sidebar — always brand-dark (same in light & dark theme) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col transition-transform duration-200",
          "border-r border-white/8 bg-gradient-to-b from-[#0f2a26] via-[#0b1d1a] to-[#071412]",
          "text-[#eef2f0] shadow-[4px_0_32px_-12px_rgba(0,0,0,0.45)]",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-16 top-24 h-40 w-40 rounded-full bg-teal/20 blur-3xl" />
          <div className="absolute -right-10 bottom-32 h-32 w-32 rounded-full bg-gold/10 blur-3xl" />
        </div>

        <div className="relative flex h-full flex-col px-3.5 py-4 sm:px-4 sm:py-5">
          <div className="mb-5 flex items-start justify-between gap-2 sm:mb-6">
            <div className="min-w-0 flex-1 space-y-2">
              <AramisLogo tone="onDark" className="h-8 w-auto max-w-full" priority />
              <p className="truncate px-0.5 text-[11px] font-medium tracking-wide text-white/50">
                {tenant?.organization.name ?? "Your business"}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
            Navigate
          </p>

          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto pr-0.5">
            {nav.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium transition-all duration-150",
                    active
                      ? "bg-teal/18 text-white shadow-[inset_0_0_0_1px_rgba(42,157,143,0.35)]"
                      : "text-white/65 hover:bg-white/[0.05] hover:text-white",
                  )}
                >
                  {active ? (
                    <span
                      className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-teal"
                      aria-hidden
                    />
                  ) : null}
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition",
                      active
                        ? "bg-teal text-white shadow-md shadow-teal/35"
                        : "bg-white/[0.04] text-white/70 group-hover:bg-white/[0.08] group-hover:text-white",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-2.5 border-t border-white/8 pt-4">
            <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-3 backdrop-blur-sm">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
                Connection & sync
              </p>
              <SyncControls tone="dark" />
            </div>
            <InstallAppButton />
            <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal to-teal/70 text-xs font-semibold text-white shadow-sm shadow-teal/25">
                {(tenant?.profile.full_name ?? "U")
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {tenant?.profile.full_name}
                </p>
                <p className="truncate text-[11px] capitalize text-white/50">
                  {tenant?.membership.role}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-xl p-2 text-white/55 transition hover:bg-white/10 hover:text-white"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          aria-label="Close overlay"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="flex min-h-dvh min-w-0 flex-col lg:pl-64">
        <SyncSuccessDialog />
        {isOffline ? (
          <div className="bg-[#0b1d1a] px-4 py-1.5 text-center text-xs font-medium text-[#eef2f0]">
            Offline — sales & changes are saved on this device and will sync when
            the connection is fast enough
            {pendingCount > 0 ? ` · ${pendingCount} pending` : ""}
          </div>
        ) : connection.status === "slow" ? (
          <div className="bg-gold px-4 py-1.5 text-center text-xs font-medium text-[#0b1d1a]">
            Slow connection — working locally; auto-sync waits for a faster link
            {pendingCount > 0 ? ` · ${pendingCount} pending` : ""}
          </div>
        ) : null}

        {warningLevel !== "none" && !accessBlocked && tenant ? (
          <div
            className={cn(
              "px-4 py-1.5 text-center text-xs font-medium",
              warningLevel === "urgent"
                ? "bg-coral text-white"
                : "bg-gold text-[#0b1d1a]",
            )}
          >
            {tenant.subscription.status === "trialing"
              ? "Trial"
              : "Subscription"}{" "}
            ends in {Math.max(0, daysLeft)} day(s)
            {warningLevel === "urgent" ? " — renew now" : ""}
            {owner ? (
              <>
                {" "}
                ·{" "}
                <Link href="/app/settings?tab=billing" className="underline">
                  Settings & Billing
                </Link>
              </>
            ) : (
              " — ask your owner to renew"
            )}
          </div>
        ) : null}

        {accessBlocked ? (
          <div className="bg-coral px-4 py-1.5 text-center text-xs font-medium text-white">
            Access paused
            {owner ? (
              <>
                {" "}
                — extend in{" "}
                <Link href="/app/settings?tab=billing" className="underline">
                  Settings & Billing
                </Link>
              </>
            ) : (
              " — ask your owner to renew"
            )}
          </div>
        ) : null}

        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink/8 bg-stone/90 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
          <button
            type="button"
            className="rounded-xl border border-ink/10 bg-paper p-2 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl text-ink sm:text-2xl">
              {heading}
            </h1>
          </div>
          <div className="hidden sm:block">
            <SyncControls compact />
          </div>
        </header>

        <main className="w-full flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
