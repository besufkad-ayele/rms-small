"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  CreditCard,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  ShoppingCart,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/utils";

function useIsOffline() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return offline;
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
  const { tenant, logout, hasModule, daysLeft, warningLevel, accessBlocked, isPlatformAdmin } = useAuth();
  const isOffline = useIsOffline();
  const [open, setOpen] = useState(false);

  const nav = [
    { href: "/app", label: "Home", icon: LayoutGrid, exact: true },
    ...(hasModule("inventory")
      ? [
          { href: "/app/order", label: "Order", icon: ShoppingCart },
          { href: "/app/menu", label: "Menu", icon: ClipboardList },
          { href: "/app/inventory", label: "Inventory", icon: Package },
        ]
      : []),
    ...(hasModule("finance")
      ? [{ href: "/app/reports", label: "Finance", icon: BarChart3 }]
      : []),
    { href: "/app/billing", label: "Billing", icon: CreditCard },
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

      {isOffline ? (
        <div className="bg-ink px-4 py-1.5 text-center text-xs font-medium text-stone">
          Offline — reconnect to sync Aramis cloud data
        </div>
      ) : null}

      {warningLevel !== "none" && !accessBlocked && tenant ? (
        <div
          className={cn(
            "px-4 py-1.5 text-center text-xs font-medium",
            warningLevel === "urgent"
              ? "bg-coral text-white"
              : "bg-gold text-ink",
          )}
        >
          {tenant.subscription.status === "trialing" ? "Trial" : "Subscription"}{" "}
          ends in {Math.max(0, daysLeft)} day(s)
          {warningLevel === "urgent" ? " — renew now" : ""} ·{" "}
          <Link href="/app/billing" className="underline">
            Billing
          </Link>
        </div>
      ) : null}

      {accessBlocked ? (
        <div className="bg-coral px-4 py-1.5 text-center text-xs font-medium text-white">
          Access paused — extend in{" "}
          <Link href="/app/billing" className="underline">
            Billing
          </Link>
        </div>
      ) : null}

      <div className="flex min-h-dvh w-full">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-[min(100%,16rem)] shrink-0 flex-col border-r border-ink/10 bg-ink text-stone transition-transform duration-200 lg:static lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex h-full flex-col p-4 sm:p-5">
            <div className="mb-6 flex items-start justify-between gap-2 sm:mb-8">
              <div className="min-w-0">
                <p className="font-display text-2xl tracking-tight text-gold">
                  Aramis Product
                </p>
                <p className="mt-1 truncate text-xs text-stone/70">
                  {tenant?.organization.name ?? "Your business"}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-stone/70 lg:hidden"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
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
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                      active
                        ? "bg-teal text-white shadow-lg shadow-teal/30"
                        : "text-stone/80 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto border-t border-white/10 pt-4">
              <p className="truncate text-sm font-medium">
                {tenant?.profile.full_name}
              </p>
              <p className="truncate text-xs text-stone/60">
                {tenant?.membership.role}
              </p>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-stone/80 hover:bg-white/5"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </aside>

        {open ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-ink/40 lg:hidden"
            aria-label="Close overlay"
            onClick={() => setOpen(false)}
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col lg:pl-0">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink/8 bg-stone/85 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
            <button
              type="button"
              className="rounded-xl border border-ink/10 bg-white p-2 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-xl text-ink sm:text-2xl">
                {title ?? "Dashboard"}
              </h1>
            </div>
          </header>

          <main className="w-full flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
