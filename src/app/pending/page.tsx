"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";
import { APP_MODULE_LABELS, moduleFlag, type AppModule } from "@/lib/tenant";
import { formatDateTime } from "@/lib/utils";

const MODULES: AppModule[] = [
  "menu",
  "ordering",
  "inventory",
  "finance",
  "hr",
];

export default function PendingPage() {
  const {
    ready,
    sessionResolved,
    user,
    tenant,
    hasMembership,
    tenantError,
    awaitingVerification,
    needsOnboarding,
    logout,
    refresh,
  } = useAuth();
  const router = useRouter();
  const [details, setDetails] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!ready || !sessionResolved) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (tenantError && !tenant) return;
    if (needsOnboarding) {
      router.replace("/onboarding");
      return;
    }
    if (!tenant && hasMembership) return;
    if (!tenant) return;
    // Approved — keep session and open the app (same password from signup)
    if (!awaitingVerification) {
      router.replace("/app");
    }
  }, [
    ready,
    sessionResolved,
    user,
    tenant,
    hasMembership,
    tenantError,
    awaitingVerification,
    needsOnboarding,
    router,
  ]);

  useEffect(() => {
    if (!tenant) return;
    setDetails({
      Name: tenant.profile.full_name,
      Email: tenant.organization.email || tenant.profile.email || "—",
      Phone: tenant.organization.phone || tenant.profile.phone || "—",
      Business: tenant.organization.name,
      Type: tenant.organization.org_type,
      City: tenant.organization.city || "—",
      TIN: tenant.organization.tin || "—",
      VAT: tenant.organization.vat_number || "—",
      Status: tenant.organization.verification_status || "pending",
      Modules: MODULES.filter((m) => moduleFlag(tenant.subscription, m))
        .map((m) => APP_MODULE_LABELS[m])
        .join(" · "),
      Submitted: formatDateTime(tenant.organization.created_at),
    });
  }, [tenant]);

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), 12000);
    return () => window.clearInterval(id);
  }, [refresh]);

  if (ready && tenantError && !tenant) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-stone px-4 text-center">
        <p className="font-display text-xl text-ink">Couldn’t load status</p>
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

  if (!ready || !sessionResolved || !tenant) {
    return <AuthLoadingScreen message="Checking status…" />;
  }

  if (!awaitingVerification) {
    return <AuthLoadingScreen message="Approved — opening Aramis…" />;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone px-4 py-8">
      <div className="w-full max-w-lg rounded-3xl border border-ink/8 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">
          Aramis Product
        </p>
        <h1 className="mt-3 text-center font-display text-2xl text-ink">
          Waiting for access
        </h1>
        <p className="mt-2 text-center text-sm text-ink/60">
          Your business is under review. When Aramis approves, sign in with the
          email and password you created — your 14-day trial starts then.
        </p>

        {details ? (
          <dl className="mt-6 grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(details).map(([label, value]) => (
              <div key={label} className="rounded-xl bg-stone/50 px-3 py-2">
                <dt className="text-[11px] text-ink/50">{label}</dt>
                <dd className="font-medium">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-xl bg-teal px-4 py-3 text-sm font-semibold text-white"
          >
            Refresh status
          </button>
          <button
            type="button"
            onClick={() => void logout().then(() => router.replace("/login"))}
            className="rounded-xl border border-ink/15 px-4 py-3 text-sm"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
