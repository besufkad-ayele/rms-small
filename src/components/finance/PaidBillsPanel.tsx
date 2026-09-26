"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  BILL_CATEGORIES,
  type PaidBill,
} from "@/lib/cloud-bills";
import {
  createPaidBillResilient,
  deletePaidBillResilient,
  loadPaidBillsResilient,
} from "@/lib/offline/resilient";
import { useOfflineSync } from "@/components/offline/OfflineSyncProvider";
import type { PaymentMethod } from "@/lib/tenant";
import { formatMoney } from "@/lib/utils";

export function PaidBillsPanel({
  orgId,
  onChanged,
}: {
  orgId: string;
  onChanged?: () => void;
}) {
  const { refreshPendingCount } = useOfflineSync();
  const [bills, setBills] = useState<PaidBill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setBills(await loadPaidBillsResilient(orgId));
  }, [orgId]);

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load bills"),
    );
  }, [reload]);

  const total = useMemo(
    () => bills.reduce((s, b) => s + Number(b.amount), 0),
    [bills],
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const { offlineQueued } = await createPaidBillResilient(orgId, {
        title: String(fd.get("title") ?? ""),
        category: String(fd.get("category") ?? "other"),
        amount: Number(fd.get("amount") || 0),
        paidAt: String(fd.get("paidAt") ?? new Date().toISOString().slice(0, 10)),
        paymentMethod: String(fd.get("method") || "cash") as PaymentMethod,
        reference: String(fd.get("reference") ?? ""),
        note: String(fd.get("note") ?? ""),
      });
      (e.target as HTMLFormElement).reset();
      if (offlineQueued) await refreshPendingCount();
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save bill");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Bills we paid</h2>
          <p className="mt-1 text-sm text-ink/55">
            Record expenses — listed by payment date (newest first).
          </p>
        </div>
        <p className="rounded-2xl bg-stone/60 px-3 py-2 text-sm font-semibold">
          Total {formatMoney(total)}
        </p>
      </div>

      <form
        className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => void onSubmit(e)}
      >
        <label className="block text-sm sm:col-span-2 lg:col-span-1">
          <span className="mb-1 block text-ink/60">Title *</span>
          <input name="title" required className="field" placeholder="Electricity" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Category</span>
          <select name="category" className="field" defaultValue="utilities">
            {BILL_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Amount (ETB)</span>
          <input
            name="amount"
            type="number"
            min={0}
            step="0.01"
            required
            className="field"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Paid on</span>
          <input
            name="paidAt"
            type="date"
            required
            className="field"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Method</span>
          <select name="method" className="field" defaultValue="cash">
            <option value="cash">Cash</option>
            <option value="cbe">CBE</option>
            <option value="telebirr">Telebirr</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Reference</span>
          <input name="reference" className="field" placeholder="Txn / receipt #" />
        </label>
        <label className="block text-sm sm:col-span-2 lg:col-span-3">
          <span className="mb-1 block text-ink/60">Note</span>
          <input name="note" className="field" placeholder="Optional details" />
        </label>
        <div className="sm:col-span-2 lg:col-span-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-stone disabled:opacity-60"
          >
            {busy ? "Saving…" : "Add paid bill"}
          </button>
        </div>
      </form>

      {error ? (
        <p className="mt-3 rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">
          {error}
        </p>
      ) : null}

      <ul className="mt-5 space-y-2">
        {bills.map((b) => {
          const cat =
            BILL_CATEGORIES.find((c) => c.id === b.category)?.label || b.category;
          return (
            <li
              key={b.id}
              className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink/8 bg-stone/40 px-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{b.title}</p>
                <p className="text-xs text-ink/55">
                  {b.paid_at} · {cat} · {b.payment_method}
                  {b.reference ? ` · ${b.reference}` : ""}
                </p>
                {b.note ? (
                  <p className="mt-1 text-xs text-ink/50">{b.note}</p>
                ) : null}
              </div>
              <p className="font-semibold text-ink">{formatMoney(Number(b.amount))}</p>
              <button
                type="button"
                className="rounded-lg border border-coral/20 bg-coral/10 p-2 text-coral"
                aria-label="Delete bill"
                onClick={() =>
                  void deletePaidBillResilient(orgId, b.id)
                    .then(async (r) => {
                      if (r.offlineQueued) await refreshPendingCount();
                      await reload();
                      onChanged?.();
                    })
                    .catch((e) =>
                      setError(e instanceof Error ? e.message : "Delete failed"),
                    )
                }
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
        {bills.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/50">
            No paid bills yet — add rent, utilities, supplies, and more.
          </p>
        ) : null}
      </ul>
    </section>
  );
}
