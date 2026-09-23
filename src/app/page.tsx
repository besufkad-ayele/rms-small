"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Public home: show Sign in / Create account.
 * If already signed in, route into the app flow.
 */
export default function HomePage() {
  const {
    ready,
    user,
    tenant,
    isPlatformAdmin,
    awaitingVerification,
    needsOnboarding,
  } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready || !user) return;
    if (isPlatformAdmin) {
      router.replace("/platform");
      return;
    }
    if (needsOnboarding || !tenant) {
      router.replace("/onboarding");
      return;
    }
    if (awaitingVerification) {
      router.replace("/pending");
      return;
    }
    router.replace("/app");
  }, [
    ready,
    user,
    tenant,
    isPlatformAdmin,
    awaitingVerification,
    needsOnboarding,
    router,
  ]);

  // Signed-in users briefly see loading while we redirect
  if (ready && user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink text-stone">
        <p className="text-sm text-stone/70">Opening Aramis…</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink text-stone">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#2A9D8F40,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_#E9C46A28,_transparent_45%)]" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10 sm:px-6">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal">
            Welcome
          </p>
          <h1 className="mt-3 font-display text-5xl tracking-tight text-gold sm:text-6xl">
            Aramis Product
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-sm text-stone/70">
            Café & restaurant counter. Sign in if you already have access, or
            create an account to get started.
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="rounded-xl bg-teal px-6 py-3.5 text-center text-sm font-semibold text-white shadow-lg shadow-teal/25"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-xl border border-white/20 bg-white/5 px-6 py-3.5 text-center text-sm font-semibold text-stone backdrop-blur"
          >
            Create account
          </Link>
        </div>

        {!ready ? (
          <p className="mt-8 text-center text-xs text-stone/45">Checking session…</p>
        ) : null}
      </div>
    </div>
  );
}
