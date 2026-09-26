"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SignupScreen } from "@/components/auth/SignupScreen";
import { useAuth } from "@/components/auth/AuthProvider";

export default function SignupPage() {
  const {
    ready,
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
    if (!ready || !user) return;
    if (isPlatformAdmin && !hasMembership) {
      router.replace("/platform");
      return;
    }
    if (tenantError && !tenant) return;
    if (needsOnboarding) {
      router.replace("/onboarding");
      return;
    }
    if (!tenant) return;
    if (awaitingVerification) {
      router.replace("/pending");
      return;
    }
    if (accessBlocked) {
      router.replace("/app/billing");
      return;
    }
    router.replace("/app");
  }, [
    ready,
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

  if (ready && user && tenantError && !tenant) {
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

  return <SignupScreen />;
}
