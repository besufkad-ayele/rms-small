"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";
import { AppShell } from "@/components/layout/AppShell";
import { isOwner } from "@/lib/permissions";
import type { AppModule } from "@/lib/tenant";
import type { StaffFeature } from "@/lib/permissions";

type GateProps = {
  children: React.ReactNode;
  title?: string;
  module?: AppModule;
  /** Granular staff feature (order, menu, inventory, finance, billing, staff) */
  feature?: StaffFeature;
  /** Restrict to organization owner (Settings & Billing). */
  ownerOnly?: boolean;
  allowWhenBlocked?: boolean;
  /** When false, skip AppShell (used inside a layout that already has the shell). */
  withShell?: boolean;
};

function useAuthGate({
  module,
  feature,
  ownerOnly,
  allowWhenBlocked: allowWhenBlockedProp,
}: Pick<GateProps, "module" | "feature" | "ownerOnly" | "allowWhenBlocked">) {
  const {
    ready,
    sessionResolved,
    user,
    tenant,
    hasMembership,
    tenantError,
    needsOnboarding,
    awaitingVerification,
    accessBlocked,
    hasModule,
    hasFeature,
    isPlatformAdmin,
    refresh,
  } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const allowWhenBlocked =
    allowWhenBlockedProp ||
    pathname.startsWith("/app/settings") ||
    pathname.startsWith("/app/billing");

  const owner = tenant ? isOwner(tenant.membership) : false;

  useEffect(() => {
    if (!ready || !sessionResolved) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (isPlatformAdmin && !tenant && !hasMembership) {
      router.replace("/platform");
      return;
    }
    if (needsOnboarding) {
      router.replace("/onboarding");
      return;
    }
    if (tenantError && !tenant) {
      return;
    }
    if (awaitingVerification && !allowWhenBlocked) {
      router.replace("/pending");
      return;
    }
    if (accessBlocked && !allowWhenBlocked && !awaitingVerification) {
      if (owner) {
        router.replace("/app/settings?tab=billing");
      }
      return;
    }
    if (ownerOnly && tenant && !owner && !accessBlocked) {
      router.replace("/app");
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
    sessionResolved,
    user,
    needsOnboarding,
    awaitingVerification,
    accessBlocked,
    allowWhenBlocked,
    module,
    feature,
    ownerOnly,
    owner,
    tenant,
    hasMembership,
    tenantError,
    hasModule,
    hasFeature,
    isPlatformAdmin,
    router,
  ]);

  return {
    ready,
    sessionResolved,
    user,
    tenant,
    tenantError,
    needsOnboarding,
    awaitingVerification,
    accessBlocked,
    hasModule,
    hasFeature,
    owner,
    ownerOnly,
    refresh,
    module,
    feature,
    allowWhenBlocked,
  };
}

function GateBody({
  children,
  title,
  withShell = true,
  gate,
}: {
  children: React.ReactNode;
  title?: string;
  withShell?: boolean;
  gate: ReturnType<typeof useAuthGate>;
}) {
  const {
    ready,
    sessionResolved,
    user,
    tenant,
    tenantError,
    needsOnboarding,
    awaitingVerification,
    accessBlocked,
    hasModule,
    hasFeature,
    owner,
    ownerOnly,
    refresh,
    module,
    feature,
    allowWhenBlocked,
  } = gate;

  if (!ready || !sessionResolved || !user) {
    return withShell ? (
      <AuthLoadingScreen message="Loading Aramis…" />
    ) : null;
  }

  if (tenantError && !tenant) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-stone px-4 text-center text-ink">
        <p className="font-display text-xl">Couldn’t load your business</p>
        <p className="max-w-sm text-sm text-ink/60">{tenantError}</p>
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

  if (needsOnboarding) {
    return withShell ? (
      <AuthLoadingScreen message="Opening Aramis…" />
    ) : null;
  }

  if (!tenant) {
    return withShell ? (
      <AuthLoadingScreen message="Loading Aramis…" />
    ) : null;
  }

  if (awaitingVerification && !allowWhenBlocked) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-stone text-ink">
        <p className="text-sm text-ink/60">Awaiting verification…</p>
      </div>
    );
  }

  if (accessBlocked && !allowWhenBlocked) {
    if (!owner) {
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
        <p className="text-sm text-ink/60">Redirecting to settings…</p>
      </div>
    );
  }

  if (ownerOnly && !owner) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-ink">
        <p className="text-sm text-ink/60">
          Only the business owner can open Settings & Billing.
        </p>
      </div>
    );
  }

  if (module && !hasModule(module) && !accessBlocked) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-ink">
        <p className="text-sm text-ink/60">Module not enabled…</p>
      </div>
    );
  }

  if (feature && !hasFeature(feature) && !accessBlocked) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-ink">
        <p className="text-sm text-ink/60">You don’t have access to this area…</p>
      </div>
    );
  }

  if (withShell) {
    return <AppShell title={title}>{children}</AppShell>;
  }

  return <>{children}</>;
}

/** Full auth gate + AppShell. Use once in `/app` layout so the shell stays mounted. */
export function RequireAuth({
  children,
  title,
  module,
  feature,
  ownerOnly,
  allowWhenBlocked,
  withShell = true,
}: GateProps) {
  const gate = useAuthGate({ module, feature, ownerOnly, allowWhenBlocked });
  return (
    <GateBody title={title} withShell={withShell} gate={gate}>
      {children}
    </GateBody>
  );
}

/**
 * Module/feature gate without remounting AppShell.
 * Use on individual `/app/*` pages inside the shared layout.
 */
export function RequireAccess({
  children,
  module,
  feature,
  ownerOnly,
  allowWhenBlocked,
}: Omit<GateProps, "title" | "withShell">) {
  const gate = useAuthGate({ module, feature, ownerOnly, allowWhenBlocked });
  return (
    <GateBody withShell={false} gate={gate}>
      {children}
    </GateBody>
  );
}
