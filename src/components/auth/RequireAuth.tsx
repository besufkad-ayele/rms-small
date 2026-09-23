"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { AppShell } from "@/components/layout/AppShell";
import type { AppModule } from "@/lib/tenant";

export function RequireAuth({
  children,
  title,
  module,
  allowWhenBlocked,
}: {
  children: React.ReactNode;
  title?: string;
  module?: AppModule;
  allowWhenBlocked?: boolean;
}) {
  const {
    ready,
    user,
    tenant,
    needsOnboarding,
    awaitingVerification,
    accessBlocked,
    hasModule,
    isPlatformAdmin,
  } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (isPlatformAdmin && !tenant) {
      router.replace("/platform");
      return;
    }
    if (needsOnboarding) {
      router.replace("/onboarding");
      return;
    }
    if (awaitingVerification && !allowWhenBlocked) {
      router.replace("/pending");
      return;
    }
    if (accessBlocked && !allowWhenBlocked && !awaitingVerification) {
      router.replace("/app/billing");
      return;
    }
    if (module && tenant && !hasModule(module) && !accessBlocked) {
      router.replace("/app");
    }
  }, [
    ready,
    user,
    needsOnboarding,
    awaitingVerification,
    accessBlocked,
    allowWhenBlocked,
    module,
    tenant,
    hasModule,
    isPlatformAdmin,
    router,
  ]);

  if (!ready || !user || needsOnboarding || !tenant) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-stone text-ink">
        <p className="text-sm text-ink/60">Loading Aramis…</p>
      </div>
    );
  }

  if (awaitingVerification && !allowWhenBlocked) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-stone text-ink">
        <p className="text-sm text-ink/60">Awaiting verification…</p>
      </div>
    );
  }

  if (accessBlocked && !allowWhenBlocked) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-stone text-ink">
        <p className="text-sm text-ink/60">Redirecting to billing…</p>
      </div>
    );
  }

  if (module && !hasModule(module) && !accessBlocked) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-stone text-ink">
        <p className="text-sm text-ink/60">Module not enabled…</p>
      </div>
    );
  }

  return <AppShell title={title}>{children}</AppShell>;
}
