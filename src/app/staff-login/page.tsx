"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { useAuth } from "@/components/auth/AuthProvider";

function StaffLoginGate() {
  const { ready, user, tenant, isPlatformAdmin, awaitingVerification } =
    useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready || !user) return;
    if (isPlatformAdmin) {
      router.replace("/platform");
      return;
    }
    if (!tenant) {
      // Staff should already belong to an org — if not, send to main flow
      router.replace("/login");
      return;
    }
    if (awaitingVerification) {
      router.replace("/pending");
      return;
    }
    router.replace("/app");
  }, [ready, user, tenant, isPlatformAdmin, awaitingVerification, router]);

  return <LoginScreen variant="staff" />;
}

export default function StaffLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-ink text-stone">
          <p className="text-sm text-stone/70">Loading…</p>
        </div>
      }
    >
      <StaffLoginGate />
    </Suspense>
  );
}
