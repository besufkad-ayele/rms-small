"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatDateTime } from "@/lib/utils";

export default function PendingPage() {
  const { ready, user, tenant, awaitingVerification, logout, refresh } =
    useAuth();
  const router = useRouter();
  const [details, setDetails] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!tenant) {
      router.replace("/onboarding");
      return;
    }
    // After approval: force login with the password Aramis sent
    if (!awaitingVerification) {
      void logout().then(() => router.replace("/login?approved=1"));
    }
  }, [ready, user, tenant, awaitingVerification, logout, router]);

  useEffect(() => {
    if (!tenant) return;
    setDetails({
      Name: tenant.profile.full_name,
      Email: tenant.organization.email || tenant.profile.email || "—",
      Phone: tenant.organization.phone || tenant.profile.phone || "—",
      Business: tenant.organization.name,
      Type: tenant.organization.org_type,
      City: tenant.organization.city || "—",
      Status: tenant.organization.verification_status || "pending",
      Modules: [
        tenant.subscription.inventory_enabled ? "Inventory" : null,
        tenant.subscription.finance_enabled ? "Finance" : null,
      ]
        .filter(Boolean)
        .join(" + "),
      Submitted: formatDateTime(tenant.organization.created_at),
    });
  }, [tenant]);

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), 12000);
    return () => window.clearInterval(id);
  }, [refresh]);

  if (!ready || !awaitingVerification) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-stone">
        <p className="text-sm text-ink/60">
          {!awaitingVerification
            ? "Approved — redirecting to sign in…"
            : "Checking status…"}
        </p>
      </div>
    );
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
          Your business is under review. When approved, you will receive a
          password by email or SMS — then sign in at the login page to start
          your 14-day trial.
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
