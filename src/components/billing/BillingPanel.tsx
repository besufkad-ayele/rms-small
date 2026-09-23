"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { listOrgPaymentProofs } from "@/lib/cloud-auth";
import { subscriptionEndsAt } from "@/lib/tenant";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";

export function BillingPanel() {
  const { tenant, daysLeft, warningLevel, setModules, uploadProof, accessBlocked } =
    useAuth();
  const [inventory, setInventory] = useState(
    tenant?.subscription.inventory_enabled ?? true,
  );
  const [finance, setFinance] = useState(
    tenant?.subscription.finance_enabled ?? true,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [proofs, setProofs] = useState<Record<string, unknown>[]>([]);

  const reloadProofs = useCallback(async () => {
    if (!tenant) return;
    try {
      setProofs(await listOrgPaymentProofs(tenant.organization.id));
    } catch {
      /* ignore */
    }
  }, [tenant]);

  useEffect(() => {
    void reloadProofs();
  }, [reloadProofs]);

  if (!tenant) return null;
  const sub = tenant.subscription;
  const endsAt = subscriptionEndsAt(sub);
  const kind = sub.status === "trialing" ? "Trial" : "Subscription";

  async function saveModules() {
    setBusy(true);
    setError(null);
    const err = await setModules(inventory, finance);
    setBusy(false);
    if (err) setError(err);
    else setMessage("Modules updated.");
  }

  async function onProof(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("proof") as File | null;
    if (!file || file.size === 0) {
      setBusy(false);
      setError("Attach a payment screenshot or photo.");
      return;
    }
    const err = await uploadProof({
      amount: Number(fd.get("amount") || 0),
      method: String(fd.get("method") || "telebirr") as
        | "cash"
        | "cbe"
        | "telebirr"
        | "other",
      reference: String(fd.get("reference") || ""),
      file,
      monthsRequested: Number(fd.get("months") || 1),
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setMessage(
      "Approval request sent. Access stays as-is until Aramis verifies payment and extends your period.",
    );
    (e.target as HTMLFormElement).reset();
    await reloadProofs();
  }

  return (
    <div className="space-y-4">
      {accessBlocked ? (
        <div className="rounded-3xl border border-coral/30 bg-coral/10 p-4 text-sm text-coral sm:p-5">
          Access paused — {kind.toLowerCase()} ended. Submit payment proof below;
          after verification your period will be extended.
        </div>
      ) : warningLevel !== "none" ? (
        <div
          className={cn(
            "rounded-3xl border p-4 text-sm sm:p-5",
            warningLevel === "urgent"
              ? "border-coral/40 bg-coral/10 text-coral"
              : "border-gold/40 bg-gold/15 text-ink",
          )}
        >
          {kind} ends in {Math.max(0, daysLeft)} day(s)
          {endsAt ? ` · ${formatDateTime(endsAt)}` : ""}. Extend with a payment
          proof below.
        </div>
      ) : null}

      <section className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-6">
        <h2 className="font-display text-xl">Subscription</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-2xl bg-stone/60 px-3 py-3">
            <dt className="text-xs text-ink/50">Status</dt>
            <dd className="mt-1 font-semibold capitalize">{sub.status}</dd>
          </div>
          <div
            className={cn(
              "rounded-2xl px-3 py-3",
              warningLevel === "urgent"
                ? "bg-coral/15"
                : warningLevel === "notice"
                  ? "bg-gold/20"
                  : "bg-stone/60",
            )}
          >
            <dt className="text-xs text-ink/50">Days left</dt>
            <dd
              className={cn(
                "mt-1 font-semibold",
                warningLevel === "urgent" && "text-coral",
              )}
            >
              {daysLeft > 900 ? "—" : `${Math.max(0, daysLeft)} day(s)`}
            </dd>
          </div>
          <div className="rounded-2xl bg-stone/60 px-3 py-3 sm:col-span-2">
            <dt className="text-xs text-ink/50">
              {sub.status === "trialing" ? "Trial ends" : "Period ends"}
            </dt>
            <dd className="mt-1 font-semibold">
              {endsAt ? formatDateTime(endsAt) : "—"}
            </dd>
          </div>
          <div className="rounded-2xl bg-stone/60 px-3 py-3 sm:col-span-2">
            <dt className="text-xs text-ink/50">Plan</dt>
            <dd className="mt-1 font-semibold">{sub.plan_code}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-6">
        <h2 className="font-display text-xl">Modules</h2>
        <p className="mt-1 text-sm text-ink/55">
          Inventory = menu + stock + cashier. Finance = reports + day close.
        </p>
        <div className="mt-4 space-y-2">
          <label className="flex items-start gap-3 rounded-2xl bg-stone/50 p-3 text-sm">
            <input
              type="checkbox"
              checked={inventory}
              onChange={(e) => setInventory(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Inventory</span>
              <span className="block text-xs text-ink/50">
                Orders, menu, stock
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-2xl bg-stone/50 p-3 text-sm">
            <input
              type="checkbox"
              checked={finance}
              onChange={(e) => setFinance(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Finance</span>
              <span className="block text-xs text-ink/50">
                Reports & accountant close
              </span>
            </span>
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveModules()}
          className="mt-4 w-full rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-stone sm:w-auto sm:px-6"
        >
          Save modules
        </button>
      </section>

      <section className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-6">
        <h2 className="font-display text-xl">Extend subscription</h2>
        <p className="mt-1 text-sm text-ink/55">
          Pay for 1+ months, upload Telebirr / CBE / bank proof. This creates an
          approval request — Aramis verifies then adds the months to your period.
        </p>
        <form className="mt-4 space-y-3" onSubmit={(e) => void onProof(e)}>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Amount (ETB)</span>
              <input
                name="amount"
                type="number"
                min={0}
                step="0.01"
                required
                className="field"
                defaultValue={499}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Months</span>
              <select name="months" className="field" defaultValue="1">
                <option value="1">1 month</option>
                <option value="3">3 months</option>
                <option value="6">6 months</option>
                <option value="12">12 months</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Method</span>
              <select name="method" className="field" defaultValue="telebirr">
                <option value="telebirr">Telebirr</option>
                <option value="cbe">CBE</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Reference</span>
            <input name="reference" className="field" placeholder="Txn ID" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Proof photo</span>
            <input
              name="proof"
              type="file"
              accept="image/*"
              required
              className="block w-full text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-teal px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Uploading…" : "Submit approval request"}
          </button>
        </form>
        <p className="mt-3 text-xs text-ink/45">
          Suggested: {formatMoney(499)} / month · Aramis Product
        </p>
      </section>

      {proofs.length > 0 ? (
        <section className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-6">
          <h2 className="font-display text-xl">Your requests</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {proofs.map((p) => (
              <li
                key={String(p.id)}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-stone/50 px-3 py-2"
              >
                <span>
                  {formatMoney(Number(p.amount))} · {String(p.months_requested || 1)}{" "}
                  mo · {String(p.method)}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs capitalize",
                    p.status === "pending" && "bg-gold/25",
                    p.status === "approved" && "bg-teal/20 text-teal",
                    p.status === "rejected" && "bg-coral/15 text-coral",
                  )}
                >
                  {String(p.status)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {message ? (
        <p className="rounded-xl bg-teal/10 px-3 py-2 text-sm text-teal">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">
          {error}
        </p>
      ) : null}
    </div>
  );
}
