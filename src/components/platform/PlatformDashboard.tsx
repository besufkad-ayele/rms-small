"use client";

import { useEffect, useMemo, useState } from "react";
import {
  approveOrganizationAction,
  approvePaymentProofAction,
  getKycSignedUrlAction,
  listPaymentProofsAction,
  listPlatformTenantsAction,
  rejectOrganizationAction,
  rejectPaymentProofAction,
  resetSubscriberPasswordAction,
  updateTenantSubscriptionAction,
  type PaymentProofRow,
  type PlatformTenantRow,
} from "@/app/platform/actions";
import type { SubStatus } from "@/lib/tenant";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";

export function PlatformDashboard() {
  const [tenants, setTenants] = useState<PlatformTenantRow[]>([]);
  const [proofs, setProofs] = useState<PaymentProofRow[]>([]);
  const [tab, setTab] = useState<"onboarding" | "payments" | "subscribers">(
    "onboarding",
  );
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">(
    "pending",
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastCreds, setLastCreds] = useState<{
    email: string;
    password: string;
  } | null>(null);

  async function reload() {
    const [t, p] = await Promise.all([
      listPlatformTenantsAction(),
      listPaymentProofsAction(),
    ]);
    if ("error" in t) {
      setError(t.error ?? "Failed to load subscribers");
      return;
    }
    if ("error" in p) {
      setError(p.error ?? "Failed to load payments");
      return;
    }
    setTenants(t.tenants);
    setProofs(p.proofs);
    setError(null);
  }

  useEffect(() => {
    void reload();
  }, []);

  const filteredOnboarding = useMemo(() => {
    if (filter === "all") return tenants;
    return tenants.filter(
      (row) => String(row.organization.verification_status || "pending") === filter,
    );
  }, [tenants, filter]);

  const pendingCount = tenants.filter(
    (t) => t.organization.verification_status === "pending",
  ).length;
  const pendingPayments = proofs.filter((p) => p.status === "pending").length;

  async function approveOrg(row: PlatformTenantRow) {
    setBusy(true);
    setMessage(null);
    setLastCreds(null);
    const res = await approveOrganizationAction({
      organizationId: String(row.organization.id),
    });
    setBusy(false);
    if ("error" in res) {
      setError(res.error ?? "Approve failed");
      return;
    }
    if (res.email && res.password) {
      setLastCreds({ email: res.email, password: res.password });
    }
    setMessage(
      `Approved ${row.organization.name}. Copy the password and send by email/SMS — they sign in at /login.`,
    );
    await reload();
  }

  async function rejectOrg(row: PlatformTenantRow) {
    const notes = window.prompt("Rejection note (optional)") || undefined;
    setBusy(true);
    const res = await rejectOrganizationAction({
      organizationId: String(row.organization.id),
      adminNotes: notes,
    });
    setBusy(false);
    if ("error" in res) {
      setError(res.error ?? "Reject failed");
      return;
    }
    setMessage(`Rejected ${row.organization.name}`);
    await reload();
  }

  async function approveProof(proof: PaymentProofRow) {
    setBusy(true);
    setMessage(null);
    const months = Number(
      window.prompt(
        "Months to add",
        String(proof.months_requested || 1),
      ) || proof.months_requested || 1,
    );
    const res = await approvePaymentProofAction({
      proofId: proof.id,
      months,
    });
    setBusy(false);
    if ("error" in res) {
      setError(res.error ?? "Approve failed");
      return;
    }
    setMessage(
      `Payment approved · +${res.months} month(s) · ends ${formatDateTime(res.periodEnd)}`,
    );
    await reload();
  }

  async function rejectProof(proof: PaymentProofRow) {
    const notes = window.prompt("Rejection note (optional)") || undefined;
    setBusy(true);
    const res = await rejectPaymentProofAction({
      proofId: proof.id,
      notes,
    });
    setBusy(false);
    if ("error" in res) {
      setError(res.error ?? "Reject failed");
      return;
    }
    setMessage("Payment proof rejected");
    await reload();
  }

  async function openDoc(path: string | null | undefined) {
    if (!path) return;
    const res = await getKycSignedUrlAction(path);
    if ("error" in res) {
      setError(res.error ?? "Could not open file");
      return;
    }
    window.open(res.url, "_blank");
  }

  async function resetPassword(orgId: string) {
    setBusy(true);
    const res = await resetSubscriberPasswordAction(orgId);
    setBusy(false);
    if ("error" in res) {
      setError(res.error ?? "Reset failed");
      return;
    }
    setLastCreds({
      email: res.email || "",
      password: res.password,
    });
    setMessage("Password reset — send only if they forgot theirs.");
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-ink/8 bg-gradient-to-br from-ink to-teal/90 p-5 text-stone sm:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/80">
          Aramis Product · Owner
        </p>
        <h1 className="mt-2 font-display text-3xl text-gold sm:text-4xl">
          Subscriber console
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-stone/75">
          Users create an account (no password), then onboard. You approve, copy
          the login password to send them, and their 14-day trial starts.
        </p>
        <div className="mt-5 grid grid-cols-3 gap-3 sm:max-w-lg">
          <div className="rounded-2xl bg-white/10 px-3 py-3">
            <p className="text-xs text-stone/60">Pending onboarding</p>
            <p className="mt-1 font-display text-2xl">{pendingCount}</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-3">
            <p className="text-xs text-stone/60">Payment requests</p>
            <p className="mt-1 font-display text-2xl">{pendingPayments}</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-3">
            <p className="text-xs text-stone/60">Orgs</p>
            <p className="mt-1 font-display text-2xl">{tenants.length}</p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("onboarding")}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium",
            tab === "onboarding" ? "bg-teal text-white" : "bg-ink/5",
          )}
        >
          Onboarding
          {pendingCount > 0 ? ` (${pendingCount})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setTab("payments")}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium",
            tab === "payments" ? "bg-teal text-white" : "bg-ink/5",
          )}
        >
          Payments
          {pendingPayments > 0 ? ` (${pendingPayments})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setTab("subscribers")}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium",
            tab === "subscribers" ? "bg-teal text-white" : "bg-ink/5",
          )}
        >
          Subscribers
        </button>
      </div>

      {lastCreds ? (
        <div className="rounded-3xl border border-gold/40 bg-gold/15 p-4 text-sm">
          <p className="font-semibold text-ink">
            Send these login details by email or SMS
          </p>
          <p className="mt-2 font-mono text-xs sm:text-sm">
            Email: <strong>{lastCreds.email}</strong>
            <br />
            Password: <strong>{lastCreds.password}</strong>
            <br />
            Login: /login
          </p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-ink px-3 py-1.5 text-xs text-stone"
            onClick={() =>
              void navigator.clipboard.writeText(
                `Aramis Product login\nEmail: ${lastCreds.email}\nPassword: ${lastCreds.password}\nURL: ${window.location.origin}/login`,
              )
            }
          >
            Copy for email / SMS
          </button>
        </div>
      ) : null}

      {message ? (
        <p className="rounded-xl bg-teal/10 px-3 py-2 text-sm text-teal">{message}</p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>
      ) : null}

      {tab === "onboarding" ? (
        <>
          <div className="flex flex-wrap gap-2">
            {(["pending", "approved", "rejected", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium capitalize",
                  filter === f ? "bg-ink text-stone" : "bg-ink/5 text-ink/70",
                )}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="grid gap-3">
            {filteredOnboarding.map((row) => {
              const org = row.organization;
              const sub = row.subscription;
              const status = String(org.verification_status || "pending");
              return (
                <article
                  key={String(org.id)}
                  className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                    <div>
                      <h2 className="font-display text-xl">{String(org.name)}</h2>
                      <p className="text-sm text-ink/60">
                        {row.owner?.full_name || "—"} · {String(org.org_type)} ·{" "}
                        {String(org.city || "—")}
                      </p>
                      <p className="mt-1 text-xs text-ink/45">
                        {formatDateTime(String(org.created_at))} ·{" "}
                        <span className="capitalize">{status}</span>
                      </p>
                    </div>
                    {status === "pending" ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void approveOrg(row)}
                          className="rounded-xl bg-teal px-3 py-2 text-xs font-semibold text-white"
                        >
                          Approve & start trial
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void rejectOrg(row)}
                          className="rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-xs font-semibold text-coral"
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <Info
                      label="Login email"
                      value={String(row.ownerAuthEmail || org.email || "—")}
                    />
                    <Info
                      label="Phone"
                      value={String(row.owner?.phone || org.phone || "—")}
                    />
                    <Info label="Address" value={String(org.address || "—")} />
                    <Info
                      label="Location"
                      value={`${org.city || "—"}, ${org.region || "—"}, ${org.country || ""}`}
                    />
                    <Info
                      label="Modules"
                      value={`${sub?.inventory_enabled ? "Inventory" : ""}${sub?.inventory_enabled && sub?.finance_enabled ? " + " : ""}${sub?.finance_enabled ? "Finance" : ""}`}
                    />
                    <Info
                      label="Sub status"
                      value={String(sub?.status || "—")}
                    />
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      className="rounded-lg bg-stone px-2 py-1 underline disabled:opacity-40"
                      disabled={!org.business_license_url}
                      onClick={() =>
                        void openDoc(org.business_license_url as string)
                      }
                    >
                      License {org.business_license_url ? "↗" : "(none)"}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-stone px-2 py-1 underline disabled:opacity-40"
                      disabled={!org.id_document_url}
                      onClick={() => void openDoc(org.id_document_url as string)}
                    >
                      ID {org.id_document_url ? "↗" : "(none)"}
                    </button>
                  </div>
                </article>
              );
            })}
            {filteredOnboarding.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-ink/15 py-12 text-center text-sm text-ink/50">
                No onboarded businesses in this filter
              </p>
            ) : null}
          </div>
        </>
      ) : tab === "payments" ? (
        <div className="grid gap-3">
          {proofs.map((proof) => (
            <article
              key={proof.id}
              className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <div>
                  <h2 className="font-display text-xl">
                    {proof.organizations?.name || "Organization"}
                  </h2>
                  <p className="text-sm text-ink/60">
                    {formatMoney(Number(proof.amount))} ·{" "}
                    {Number(proof.months_requested || 1)} month(s) ·{" "}
                    {String(proof.method)}
                    {proof.reference ? ` · ref ${String(proof.reference)}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-ink/45">
                    {formatDateTime(String(proof.created_at))} ·{" "}
                    <span className="capitalize">{proof.status}</span>
                  </p>
                </div>
                {proof.status === "pending" ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void approveProof(proof)}
                      className="rounded-xl bg-teal px-3 py-2 text-xs font-semibold text-white"
                    >
                      Verify & extend
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void rejectProof(proof)}
                      className="rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-xs font-semibold text-coral"
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </div>
              {proof.image_url ? (
                <a
                  href={String(proof.image_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-xs text-teal underline"
                >
                  Open proof image
                </a>
              ) : null}
              {proof.notes ? (
                <p className="mt-2 text-xs text-ink/55">{String(proof.notes)}</p>
              ) : null}
            </article>
          ))}
          {proofs.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-ink/15 py-12 text-center text-sm text-ink/50">
              No payment requests yet
            </p>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3">
          {tenants.map((row) => {
            const org = row.organization;
            const sub = row.subscription;
            return (
              <article
                key={String(org.id)}
                className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-display text-xl">{String(org.name)}</h2>
                    <p className="text-sm text-ink/60">
                      {row.ownerAuthEmail || row.owner?.email} ·{" "}
                      {String(sub?.status)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void resetPassword(String(org.id))}
                    className="rounded-xl border border-ink/15 px-3 py-2 text-xs font-semibold"
                  >
                    Reset & show password
                  </button>
                </div>
                <form
                  className="mt-4 space-y-3 rounded-2xl bg-stone/50 p-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    void (async () => {
                      setBusy(true);
                      const res = await updateTenantSubscriptionAction({
                        organizationId: String(org.id),
                        status: String(fd.get("status")) as SubStatus,
                        inventoryEnabled: fd.get("inventory") === "on",
                        financeEnabled: fd.get("finance") === "on",
                        trialDays: Number(fd.get("trialDays") || 14),
                        periodMonths: Number(fd.get("periodMonths") || 1),
                        notes: String(fd.get("notes") || ""),
                      });
                      setBusy(false);
                      if ("error" in res) {
                        setError(res.error ?? "Update failed");
                        return;
                      }
                      setMessage("Subscription updated");
                      await reload();
                    })();
                  }}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block text-ink/60">Status</span>
                      <select
                        name="status"
                        className="field"
                        defaultValue={String(sub?.status || "expired")}
                      >
                        <option value="trialing">trialing</option>
                        <option value="active">active</option>
                        <option value="past_due">past_due</option>
                        <option value="expired">expired</option>
                        <option value="canceled">canceled</option>
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-ink/60">Trial days</span>
                      <input name="trialDays" type="number" defaultValue={14} className="field" />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="inventory"
                        defaultChecked={Boolean(sub?.inventory_enabled)}
                      />
                      Inventory
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="finance"
                        defaultChecked={Boolean(sub?.finance_enabled)}
                      />
                      Finance
                    </label>
                  </div>
                  <input name="notes" className="field" placeholder="Notes" defaultValue={String(sub?.notes || "")} />
                  <input type="hidden" name="periodMonths" value="1" />
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-stone"
                  >
                    Save subscription
                  </button>
                </form>
              </article>
            );
          })}
          {tenants.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-ink/15 py-12 text-center text-sm text-ink/50">
              No subscribers yet — approve an application first
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone/50 px-3 py-2">
      <dt className="text-[11px] text-ink/50">{label}</dt>
      <dd className="mt-0.5 break-words font-medium">{value || "—"}</dd>
    </div>
  );
}
