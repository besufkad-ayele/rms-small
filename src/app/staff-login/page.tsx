"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";
import { useAuth } from "@/components/auth/AuthProvider";

function StaffLoginGate() {
  const {
    ready,
    sessionResolved,
    user,
    tenant,
    hasMembership,
    tenantError,
    isPlatformAdmin,
    awaitingVerification,
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
    if (!tenant) {
      // Staff should already belong to an org — never send to onboarding
      router.replace("/login");
      return;
    }
    if (awaitingVerification) {
      router.replace("/pending");
      return;
    }
    if (accessBlocked) {
      router.replace("/app");
      return;
    }
    router.replace("/app");
  }, [
    ready,
    sessionResolved,
    user,
    tenant,
    hasMembership,
    tenantError,
    isPlatformAdmin,
    awaitingVerification,
    accessBlocked,
    router,
  ]);

  if (!ready || (user && !sessionResolved)) {
    return <AuthLoadingScreen message="Checking your account…" />;
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

  return <LoginScreen variant="staff" />;
}

export default function StaffLoginPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <StaffLoginGate />
    </Suspense>
  );
}
