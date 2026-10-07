"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  ChefHat,
  ClipboardList,
  Globe,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingCart,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AramisLogo } from "@/components/brand/AramisLogo";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { InstallAppButton } from "@/components/offline/InstallAppButton";
import { useOfflineSync } from "@/components/offline/OfflineSyncProvider";
import { SyncControls, SyncSuccessDialog } from "@/components/offline/SyncUI";
import { isOwner } from "@/lib/permissions";
import type { MemberRole } from "@/lib/tenant";
import { cn } from "@/lib/utils";

type ShellNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

/** Daily work for owners and managers. Everything else stays in the sidebar. */
const MANAGER_MOBILE_HREFS = [
  "/app/order",
  "/app/kitchen",
  "/app/inventory",
  "/app/reports",
] as const;

function mobileNavForRole(role: MemberRole | undefined, nav: ShellNavItem[]) {
  const inApp = nav.filter((item) => item.href.startsWith("/app"));
  if (role === "owner" || role === "manager") {
    const core = inApp.filter((item) =>
      (MANAGER_MOBILE_HREFS as readonly string[]).includes(item.href),
    );
    return core.length > 0 ? core : inApp;
  }
  return inApp;
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
    hasModule,
    daysLeft,
    warningLevel,
    accessBlocked,
    isPlatformAdmin,
  } = useAuth();
  const { connection, pendingCount } = useOfflineSync();
  const { t } = useI18n();
  const isOffline = connection.status === "down";
  const [open, setOpen] = useState(false);
  const owner = tenant ? isOwner(tenant.membership) : false;
  const onSettings =
    pathname.startsWith("/app/settings") || pathname.startsWith("/app/billing");
  const heading = title
    ? title
    : onSettings
      ? owner
        ? t("nav.settingsBilling")
        : t("nav.settings")
      : pathname === "/app"
        ? t("nav.home")
        : pathname.startsWith("/app/order")
          ? t("nav.order")
          : pathname.startsWith("/app/kitchen")
            ? t("nav.kitchen")
            : pathname.startsWith("/app/menu")
              ? t("nav.menu")
              : pathname.startsWith("/app/inventory")
                ? t("nav.inventory")
                : pathname.startsWith("/app/reports")
                  ? t("nav.finance")
                  : pathname.startsWith("/app/staff")
                    ? t("nav.staff")
                    : t("nav.home");

  const nav: ShellNavItem[] = [
    { href: "/app", label: t("nav.home"), icon: LayoutGrid, exact: true },
    ...(hasFeature("order")
      ? [{ href: "/app/order", label: t("nav.order"), icon: ShoppingCart }]
      : []),
    ...(hasFeature("kitchen")
      ? [{ href: "/app/kitchen", label: t("nav.kitchen"), icon: ChefHat }]
      : []),
    ...(hasFeature("menu")
      ? [{ href: "/app/menu", label: t("nav.menu"), icon: ClipboardList }]
      : []),
    ...(hasFeature("inventory") || hasFeature("inventory_issue")
      ? [{ href: "/app/inventory", label: t("nav.inventory"), icon: Package }]
      : []),
    ...(hasFeature("finance")
      ? [{ href: "/app/reports", label: t("nav.finance"), icon: BarChart3 }]
      : []),
    {
      href: "/app/settings",
      label: owner ? t("nav.settingsBilling") : t("nav.settings"),
      icon: Settings,
    },
    ...(hasFeature("staff")
      ? [{ href: "/app/staff", label: t("nav.staff"), icon: Users }]
      : []),
    ...(hasModule("online") && tenant?.organization.public_slug
      ? [
          {
            href: `/m/${tenant.organization.public_slug}`,
            label: t("nav.publicMenu"),
            icon: Globe,
          },
        ]
      : []),
    ...(isPlatformAdmin
      ? [{ href: "/platform", label: t("nav.platform"), icon: LayoutGrid }]
      : []),
  ];

  const mobileNav = mobileNavForRole(tenant?.membership.role, nav);
  const mobileScroll = mobileNav.length > 5;

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-dvh bg-stone text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[80] focus:m-3 focus:rounded-lg focus:bg-teal focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        {t("nav.skip")}
      </a>
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-teal/15 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-gold/20 blur-3xl" />
      </div>

      {/* Fixed sidebar — always brand-dark (same in light & dark theme) */}
      <aside
        id="app-sidebar"
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
                {tenant?.organization.name ?? t("brand.yourBusiness")}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white lg:hidden"
              onClick={() => setOpen(false)}
              aria-label={t("nav.closeMenu")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
            {t("nav.navigate")}
          </p>

          <nav
            className="flex flex-1 flex-col gap-0.5 overflow-y-auto pr-0.5"
            aria-label={t("nav.main")}
          >
            {nav.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
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
                {t("sync.title")}
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
                aria-label={t("nav.signOut")}
                title={t("nav.signOut")}
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
          aria-label={t("nav.closeOverlay")}
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="flex min-h-dvh min-w-0 flex-col lg:pl-64">
        <SyncSuccessDialog />
        {isOffline ? (
          <div className="bg-[#0b1d1a] px-4 py-1.5 text-center text-xs font-medium text-[#eef2f0]">
            {t("banner.offline")}
            {pendingCount > 0
              ? ` · ${t("sync.pending", { n: pendingCount })}`
              : ""}
          </div>
        ) : connection.status === "slow" ? (
          <div className="bg-gold px-4 py-1.5 text-center text-xs font-medium text-[#0b1d1a]">
            {t("banner.slow")}
            {pendingCount > 0
              ? ` · ${t("sync.pending", { n: pendingCount })}`
              : ""}
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
              ? t("banner.trial")
              : t("banner.subscription")}{" "}
            {t("banner.ends", { n: Math.max(0, daysLeft) })}
            {warningLevel === "urgent" ? t("banner.renewNow") : ""}
            {owner ? (
              <>
                {" "}
                ·{" "}
                <Link href="/app/settings?tab=billing" className="underline">
                  {t("nav.settingsBilling")}
                </Link>
              </>
            ) : (
              t("banner.askOwner")
            )}
          </div>
        ) : null}

        {accessBlocked ? (
          <div className="bg-coral px-4 py-1.5 text-center text-xs font-medium text-white">
            {t("banner.accessPaused")}
            {owner ? (
              <>
                {t("banner.extendIn")}{" "}
                <Link href="/app/settings?tab=billing" className="underline">
                  {t("nav.settingsBilling")}
                </Link>
              </>
            ) : (
              t("banner.askOwner")
            )}
          </div>
        ) : null}

        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink/8 bg-stone/90 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
          <button
            type="button"
            className="rounded-xl border border-ink/10 bg-paper p-2 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label={t("nav.openMenu")}
            aria-expanded={open}
            aria-controls="app-sidebar"
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

        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            "w-full flex-1 px-4 pt-5 sm:px-6 sm:pt-6 lg:px-8",
            mobileNav.length > 0
              ? "pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-6"
              : "pb-5 sm:pb-6",
          )}
        >
          {children}
        </main>

        {mobileNav.length > 0 ? (
          <nav
            className="fixed inset-x-0 bottom-0 z-20 border-t border-ink/8 bg-paper/95 px-1 pt-1 shadow-[0_-10px_28px_-18px_rgba(11,29,26,0.45)] backdrop-blur-md lg:hidden safe-pb"
            aria-label={t("nav.main")}
          >
            <div
              className={cn(
                mobileScroll
                  ? "flex gap-0.5 overflow-x-auto"
                  : "grid",
              )}
              style={
                mobileScroll
                  ? undefined
                  : {
                      gridTemplateColumns: `repeat(${mobileNav.length}, minmax(0, 1fr))`,
                    }
              }
            >
              {mobileNav.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold leading-tight",
                      mobileScroll && "min-w-[4.5rem] shrink-0",
                      active ? "text-teal" : "text-ink/55",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-lg",
                        active ? "bg-teal/15 text-teal" : "text-ink/50",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    <span className="max-w-full truncate px-0.5">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
