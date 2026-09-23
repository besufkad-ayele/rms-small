"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  getCloudSalesSummary,
  listCloudDayCloses,
  saveCloudDayClose,
} from "@/lib/cloud-sales";
import type { ReportPeriod } from "@/lib/types";
import { cn, dayKey, formatMoney } from "@/lib/utils";

const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
];

export function ReportsPanel() {
  const { tenant } = useAuth();
  const orgId = tenant!.organization.id;
  const [period, setPeriod] = useState<ReportPeriod>("today");
  const [summary, setSummary] = useState<Awaited<
    ReturnType<typeof getCloudSalesSummary>
  > | null>(null);
  const [closes, setCloses] = useState<
    Awaited<ReturnType<typeof listCloudDayCloses>>
  >([]);
  const [declared, setDeclared] = useState("");
  const [note, setNote] = useState("");
  const [proofs, setProofs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [s, c] = await Promise.all([
      getCloudSalesSummary(orgId, period),
      listCloudDayCloses(orgId),
    ]);
    setSummary(s);
    setCloses(c);
  }, [orgId, period]);

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : "Load failed"),
    );
  }, [reload]);

  const expected = summary?.revenue ?? 0;
  const variance = useMemo(() => {
    const d = Number(declared) || 0;
    return Math.round((d - expected) * 100) / 100;
  }, [declared, expected]);

  async function onProofs(files: FileList | null) {
    if (!files) return;
    const reads = [...files].slice(0, 6).map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        }),
    );
    const images = await Promise.all(reads);
    setProofs((prev) => [...prev, ...images].slice(0, 8));
  }

  async function onDayClose(e: FormEvent) {
    e.preventDefault();
    if (!tenant) return;
    setBusy(true);
    setError(null);
    try {
      await saveCloudDayClose({
        orgId,
        dayKey: dayKey(),
        expectedSalesTotal: expected,
        declaredCashTotal: Number(declared) || 0,
        note,
        proofImages: proofs,
        closedBy: tenant.profile.full_name,
      });
      setDeclared("");
      setNote("");
      setProofs([]);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Close failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-ink/8 bg-white/80 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                period === p.id ? "bg-teal text-white" : "bg-ink/5 text-ink/70",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Revenue" value={formatMoney(summary?.revenue ?? 0)} />
          <Stat label="Orders" value={String(summary?.orderCount ?? 0)} />
          <Stat label="Items sold" value={String(summary?.itemsSold ?? 0)} />
        </div>
        <h3 className="mt-6 text-sm font-semibold text-ink/70">Top items</h3>
        <ul className="mt-2 space-y-1">
          {(summary?.byItem ?? []).slice(0, 8).map((row) => (
            <li key={row.name} className="flex justify-between rounded-xl bg-stone/50 px-3 py-2 text-sm">
              <span>{row.name} <span className="text-ink/45">×{row.qty}</span></span>
              <span>{formatMoney(row.revenue)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-ink/8 bg-white/80 p-4 sm:p-5">
        <h2 className="font-display text-xl">Accountant day close</h2>
        <form className="mt-4 space-y-3" onSubmit={(e) => void onDayClose(e)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-stone/60 px-3 py-3 text-sm">
              <p className="text-ink/55">Expected (system today)</p>
              <p className="mt-1 font-display text-2xl text-teal">{formatMoney(expected)}</p>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Declared received</span>
              <input required type="number" min={0} step="0.01" className="field" value={declared} onChange={(e) => setDeclared(e.target.value)} />
              <p className={cn("mt-1 text-xs", variance >= 0 ? "text-teal" : "text-coral")}>
                Variance: {formatMoney(variance)}
              </p>
            </label>
          </div>
          <textarea className="field min-h-20" placeholder="Notes" value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-ink/20 bg-stone/40 px-3 py-2 text-sm">
            <ImagePlus className="h-4 w-4" />
            Payment screenshots
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onProofs(e.target.files)} />
          </label>
          {proofs.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {proofs.map((src, i) => (
                <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button type="button" className="absolute right-0.5 top-0.5 rounded bg-ink/70 p-0.5 text-white" onClick={() => setProofs((p) => p.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-ink py-3 text-sm font-semibold text-stone disabled:opacity-50">
            Save day close
          </button>
        </form>
        <ul className="mt-4 space-y-2">
          {closes.slice(0, 5).map((c) => (
            <li key={c.id} className="rounded-2xl border border-ink/8 bg-stone/40 px-3 py-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{c.day_key}</span>
                <span className={Number(c.variance) === 0 ? "text-teal" : "text-coral"}>
                  Δ {formatMoney(Number(c.variance))}
                </span>
              </div>
            </li>
          ))}
        </ul>
        {error ? <p className="mt-3 text-sm text-coral">{error}</p> : null}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-stone/60 px-3 py-3">
      <p className="text-xs text-ink/55">{label}</p>
      <p className="mt-1 font-display text-xl text-ink">{value}</p>
    </div>
  );
}
