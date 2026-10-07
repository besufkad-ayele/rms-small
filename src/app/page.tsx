"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";
import { AramisLogo } from "@/components/brand/AramisLogo";
import { isOwner } from "@/lib/permissions";

/**
 * Public home: show Sign in / Create account.
 * If already signed in, hold loading until session is resolved, then route once.
 */
export default function HomePage() {
  const {
    ready,
    sessionResolved,
    user,
    tenant,
    hasMembership,
    tenantError,
    isPlatformAdmin,
    awaitingVerification,
    needsOnboarding,
    accessBlocked,
    refresh,
  } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready || !sessionResolved || !user) return;
    if (isPlatformAdmin && !hasMembership) {
      router.replace("/platform");
      return;
    }
    if (tenantError && !tenant) return;
    if (needsOnboarding) {
      router.replace("/onboarding");
      return;
    }
    if (!tenant && hasMembership) return;
    if (awaitingVerification) {
      router.replace("/pending");
      return;
    }
    if (accessBlocked) {
      router.replace(
        tenant && isOwner(tenant.membership)
          ? "/app/settings?tab=billing"
          : "/app",
      );
      return;
    }
    if (tenant) router.replace("/app");
  }, [
    ready,
    sessionResolved,
    user,
    tenant,
    hasMembership,
    tenantError,
    isPlatformAdmin,
    awaitingVerification,
    needsOnboarding,
    accessBlocked,
    router,
  ]);

  if (!ready || (user && !sessionResolved)) {
    return <AuthLoadingScreen message="Checking session…" />;
  }

  if (ready && sessionResolved && user && tenantError && !tenant) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-ink px-4 text-center text-stone">
        <p className="font-display text-xl text-gold">Couldn’t load account</p>
        <p className="max-w-sm text-sm text-stone/70">{tenantError}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl bg-teal px-5 py-2.5 text-sm font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  if (user) {
    return <AuthLoadingScreen message="Opening Aramis…" />;
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink text-stone">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#2A9D8F40,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_#E9C46A28,_transparent_45%)]" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10 sm:px-6">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal">
            Welcome
          </p>
          <div className="mt-4 flex justify-center">
            <AramisLogo priority className="h-14 sm:h-16" />
          </div>
          <p className="mx-auto mt-5 max-w-sm text-sm text-stone/70">
            Café & restaurant counter. Sign in if you already have credentials,
            or request access to get started.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            href="/login"
            className="rounded-xl bg-teal px-6 py-3.5 text-center text-sm font-semibold text-white shadow-lg shadow-teal/25"
          >
            Sign in
          </Link>
          <Link
            href="/staff-login"
            className="rounded-xl border border-white/20 bg-white/5 px-6 py-3.5 text-center text-sm font-semibold text-stone backdrop-blur"
          >
            Staff sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-xl border border-white/20 bg-white/5 px-6 py-3.5 text-center text-sm font-semibold text-stone backdrop-blur sm:col-span-2"
          >
            Request access
          </Link>
        </div>
      </div>
    </div>
  );
}
