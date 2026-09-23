"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

/** Public root: no marketing page — send people to the right place silently. */
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
    if (!ready) return;
    if (!user) {
      router.replace("/login");
      return;
    }
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

  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone text-ink">
      <p className="text-sm text-ink/50">Loading…</p>
    </div>
  );
}
