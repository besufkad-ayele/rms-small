"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { AppShell } from "@/components/layout/AppShell";
import type { AppModule } from "@/lib/tenant";
import type { StaffFeature } from "@/lib/permissions";

export function RequireAuth({
  children,
  title,
  module,
  feature,
  allowWhenBlocked,
}: {
  children: React.ReactNode;
  title?: string;
  module?: AppModule;
  /** Granular staff feature (order, menu, inventory, finance, billing, staff) */
  feature?: StaffFeature;
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
    hasFeature,
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
      if (hasFeature("billing")) {
        router.replace("/app/billing");
      }
      return;
    }
    if (module && tenant && !hasModule(module) && !accessBlocked) {
      router.replace("/app");
      return;
    }
    if (feature && tenant && !hasFeature(feature) && !accessBlocked) {
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
    feature,
    tenant,
    hasModule,
    hasFeature,
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
    if (!hasFeature("billing")) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-stone px-4 text-center text-ink">
          <p className="font-display text-xl">Access paused</p>
          <p className="max-w-sm text-sm text-ink/60">
            Your restaurant subscription needs renewal. Ask the owner to update
            billing — you can’t open other areas until then.
          </p>
        </div>
      );
    }
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

  if (feature && !hasFeature(feature) && !accessBlocked) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-stone text-ink">
        <p className="text-sm text-ink/60">You don’t have access to this area…</p>
      </div>
    );
  }

  return <AppShell title={title}>{children}</AppShell>;
}
