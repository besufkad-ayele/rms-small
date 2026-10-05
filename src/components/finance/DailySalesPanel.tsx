"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck,
  FileBarChart2,
  ImagePlus,
  RefreshCw,
  Scale,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useOfflineSync } from "@/components/offline/OfflineSyncProvider";
import { getDailySalesPoint, type DailySalesPoint } from "@/lib/daily-reports";
import {
  saveDayCloseResilient,
  saveXReportResilient,
} from "@/lib/offline/resilient";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { cn, dayKey, formatDateTime, formatMoney } from "@/lib/utils";

type ReportView = "x" | "z" | "compare";

const VIEWS: { id: ReportView; label: string; icon: typeof FileBarChart2 }[] = [
  { id: "x", label: "X-Report", icon: FileBarChart2 },
  { id: "z", label: "Z-Report", icon: ClipboardCheck },
  { id: "compare", label: "Compare", icon: Scale },
];

export function DailySalesPanel() {
  const { tenant } = useAuth();
  const { refreshPendingCount } = useOfflineSync();
  const orgId = tenant!.organization.id;
  const today = dayKey();
  const [view, setView] = useState<ReportView>("x");
  const [point, setPoint] = useState<DailySalesPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [xCash, setXCash] = useState("");
  const [xNote, setXNote] = useState("");
  const [declared, setDeclared] = useState("");
  const [note, setNote] = useState("");
  const [proofs, setProofs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [xBusy, setXBusy] = useState(false);
  const [xSavedNote, setXSavedNote] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const p = await getDailySalesPoint(orgId, today);
      setPoint(p);
      setError(null);
      setDeclared((prev) =>
        prev.trim() ? prev : p.z ? String(p.z.declaredCashTotal) : "",
      );
      setXCash((prev) =>
        prev.trim()
          ? prev
          : p.latestXCount
            ? String(p.latestXCount.cashAtHand)
            : "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load daily report");
    } finally {
      setLoading(false);
    }
  }, [orgId, today]);

  useEffect(() => {
    void reload();
    const t = window.setInterval(() => void reload(), 30_000);
    return () => window.clearInterval(t);
  }, [reload]);

  const expected = point?.x.revenue ?? 0;
  const variance = useMemo(() => {
    const d = Number(declared) || 0;
    return Math.round((d - expected) * 100) / 100;
  }, [declared, expected]);

  const xVariance = useMemo(() => {
    const cash = Number(xCash) || 0;
    return Math.round((cash - expected) * 100) / 100;
  }, [xCash, expected]);

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

  async function onXCount(e: FormEvent) {
    e.preventDefault();
    if (!tenant || !point) return;
    setXBusy(true);
    setError(null);
    setXSavedNote(null);
    try {
      const cashAtHand = Number(xCash);
      if (!Number.isFinite(cashAtHand) || cashAtHand < 0) {
        throw new Error("Enter the money at hand.");
      }
      const { offlineQueued } = await saveXReportResilient({
        orgId,
        dayKey: today,
        systemTotal: point.x.revenue,
        cashAtHand,
        note: xNote,
        countedBy: tenant.profile.full_name,
      });
      if (offlineQueued) await refreshPendingCount();
      await reload();
      setXSavedNote(
        offlineQueued
          ? "X cash count saved on this device — will sync when online."
          : "X cash count recorded.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "X cash count failed");
    } finally {
      setXBusy(false);
    }
  }

  async function onZClose(e: FormEvent) {
    e.preventDefault();
    if (!tenant || !point) return;
    setBusy(true);
    setError(null);
    try {
      const { offlineQueued } = await saveDayCloseResilient({
        orgId,
        dayKey: today,
        expectedSalesTotal: point.x.revenue,
        declaredCashTotal: Number(declared) || 0,
        note,
        proofImages: proofs,
        closedBy: tenant.profile.full_name,
      });
      setNote("");
      setProofs([]);
      if (offlineQueued) await refreshPendingCount();
      await reload();
      setView("compare");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Z-Report close failed");
    } finally {
      setBusy(false);
    }
  }

  const x = point?.x;

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-shell via-shell to-teal/75 p-4 text-shell-fg shadow-lg sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-gold sm:text-3xl">
              Daily sales point
            </h2>
            <p className="mt-1 text-sm text-shell-fg/65">
              {today} — enter money at hand on X anytime; Z closes the day.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {loading && !x ? (
          <div className="mt-5 h-24 animate-pulse rounded-2xl bg-white/10" />
        ) : x ? (
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="System sales (X)" value={formatMoney(x.revenue)} />
            <MiniStat label="Orders" value={String(x.orderCount)} />
            <MiniStat
              label="Last X cash"
              value={
                point?.latestXCount
                  ? formatMoney(point.latestXCount.cashAtHand)
                  : "—"
              }
            />
            <MiniStat
              label={point?.z ? "Last Z variance" : "Z status"}
              value={
                point?.z ? formatMoney(point.z.variance) : "Not closed"
              }
              tone={
                point?.z
                  ? point.z.variance === 0
                    ? "good"
                    : "warn"
                  : undefined
              }
            />
          </div>
        ) : null}
      </section>

      <SegmentedTabs tabs={VIEWS} value={view} onChange={setView} />

      {error ? (
        <p className="rounded-xl bg-coral/15 px-3 py-2 text-sm text-coral">
          {error}
        </p>
      ) : null}

      {view === "x" && x ? (
        <XReportView
          x={x}
          latestXCount={point?.latestXCount ?? null}
          xCounts={point?.xCounts ?? []}
          xCash={xCash}
          xNote={xNote}
          xVariance={xVariance}
          xBusy={xBusy}
          xSavedNote={xSavedNote}
          onXCash={setXCash}
          onXNote={setXNote}
          onSubmit={(e) => void onXCount(e)}
        />
      ) : null}
      {view === "z" && x ? (
        <ZReportView
          x={x}
          z={point?.z ?? null}
          declared={declared}
          note={note}
          proofs={proofs}
          variance={variance}
          busy={busy}
          onDeclared={setDeclared}
          onNote={setNote}
          onProofs={(f) => void onProofs(f)}
          onRemoveProof={(i) => setProofs((p) => p.filter((_, idx) => idx !== i))}
          onSubmit={(e) => void onZClose(e)}
        />
      ) : null}
      {view === "compare" && x ? (
        <CompareView point={point!} />
      ) : null}
    </div>
  );
}

function XReportView({
  x,
  latestXCount,
  xCounts,
  xCash,
  xNote,
  xVariance,
  xBusy,
  xSavedNote,
  onXCash,
  onXNote,
  onSubmit,
}: {
  x: NonNullable<DailySalesPoint["x"]>;
  latestXCount: DailySalesPoint["latestXCount"];
  xCounts: DailySalesPoint["xCounts"];
  xCash: string;
  xNote: string;
  xVariance: number;
  xBusy: boolean;
  xSavedNote: string | null;
  onXCash: (v: string) => void;
  onXNote: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-xl">X-Report</h3>
            <p className="mt-0.5 text-sm text-ink/55">
              Mid-day cash check — count money at hand against system sales.
              Does not close the day. Generated {formatDateTime(x.generatedAt)}.
            </p>
          </div>
          <span className="rounded-full bg-teal/15 px-2.5 py-1 text-[11px] font-semibold text-teal">
            Live
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="Gross sales (paid)"
            value={formatMoney(x.revenue)}
            hint={`${x.orderCount} paid`}
          />
          <Stat label="Subtotal" value={formatMoney(x.subtotal)} />
          <Stat label="Service" value={formatMoney(x.serviceCharge)} />
          <Stat label="VAT" value={formatMoney(x.vat)} />
          <Stat
            label="Unpaid tickets"
            value={`${x.unpaidCount}`}
            hint={formatMoney(x.unpaidTotal)}
          />
          <Stat
            label="Kitchen open"
            value={`${x.openCount}`}
            hint={formatMoney(x.openTotal)}
          />
        </div>

        <form
          className="mt-5 space-y-3 rounded-2xl border border-teal/20 bg-teal/5 p-4"
          onSubmit={onSubmit}
        >
          <h4 className="text-sm font-semibold text-ink">Cash at hand vs system</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white px-3 py-3 text-sm shadow-sm">
              <p className="text-ink/55">System (sales total)</p>
              <p className="mt-1 font-display text-2xl text-teal">
                {formatMoney(x.revenue)}
              </p>
              <p className="mt-1 text-xs text-ink/45">
                {x.orderCount} orders · {x.itemsSold} items
              </p>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Money at hand</span>
              <input
                required
                type="number"
                min={0}
                step="0.01"
                className="field"
                value={xCash}
                onChange={(e) => onXCash(e.target.value)}
                placeholder="0.00"
              />
              <p
                className={cn(
                  "mt-1 text-xs font-medium",
                  xVariance === 0
                    ? "text-teal"
                    : xVariance > 0
                      ? "text-teal"
                      : "text-coral",
                )}
              >
                Difference: {formatMoney(xVariance)}
                {xVariance === 0
                  ? " · matches"
                  : xVariance > 0
                    ? " · over"
                    : " · short"}
              </p>
            </label>
          </div>
          <input
            className="field"
            placeholder="Note (optional)"
            value={xNote}
            onChange={(e) => onXNote(e.target.value)}
          />
          <button
            type="submit"
            disabled={xBusy || xCash.trim() === ""}
            className="w-full rounded-xl bg-teal py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {xBusy ? "Recording…" : "Record X cash count"}
          </button>
          {xSavedNote ? (
            <p className="text-center text-xs text-teal">{xSavedNote}</p>
          ) : null}
          {latestXCount ? (
            <p className="text-center text-xs text-ink/50">
              Last count {formatMoney(latestXCount.cashAtHand)} vs system{" "}
              {formatMoney(latestXCount.systemTotal)} · Δ{" "}
              {formatMoney(latestXCount.variance)} ·{" "}
              {formatDateTime(latestXCount.countedAt)} by{" "}
              {latestXCount.countedBy}
            </p>
          ) : null}
        </form>
      </div>

      {xCounts.length > 0 ? (
        <section className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-5">
          <h4 className="text-sm font-semibold text-ink/70">
            Today&apos;s X counts
          </h4>
          <ul className="mt-3 space-y-2">
            {xCounts.slice(0, 8).map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-stone/50 px-3 py-2 text-sm"
              >
                <span className="text-ink/60">
                  {formatDateTime(c.countedAt)} · {c.countedBy}
                </span>
                <span>
                  Hand {formatMoney(c.cashAtHand)} · Sys{" "}
                  {formatMoney(c.systemTotal)} ·{" "}
                  <span
                    className={
                      c.variance === 0 ? "text-teal" : "text-coral"
                    }
                  >
                    Δ {formatMoney(c.variance)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-5">
          <h4 className="text-sm font-semibold text-ink/70">By payment</h4>
          <ul className="mt-3 space-y-2">
            {x.byPayment.map((p) => (
              <li
                key={p.method}
                className="flex items-center justify-between rounded-2xl bg-stone/50 px-3 py-2 text-sm"
              >
                <span className="font-medium uppercase">{p.method}</span>
                <span className="text-ink/55">
                  {p.orderCount} · {formatMoney(p.total)}
                </span>
              </li>
            ))}
            {x.byPayment.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink/45">
                No sales yet today
              </p>
            ) : null}
          </ul>
        </section>

        <section className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-5">
          <h4 className="text-sm font-semibold text-ink/70">Top items</h4>
          <ul className="mt-3 space-y-2">
            {x.topItems.map((item) => (
              <li
                key={item.name}
                className="flex items-center justify-between rounded-2xl bg-stone/50 px-3 py-2 text-sm"
              >
                <span>
                  {item.name}{" "}
                  <span className="text-ink/45">×{item.quantity}</span>
                </span>
                <span>{formatMoney(item.revenue)}</span>
              </li>
            ))}
            {x.topItems.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink/45">No items yet</p>
            ) : null}
          </ul>
        </section>
      </div>

      {x.canceledCount > 0 ? (
        <p className="rounded-2xl border border-coral/25 bg-coral/10 px-3 py-2 text-sm text-coral">
          {x.canceledCount} canceled order(s) · {formatMoney(x.canceledTotal)}{" "}
          excluded from X totals
        </p>
      ) : null}
    </section>
  );
}

function ZReportView({
  x,
  z,
  declared,
  note,
  proofs,
  variance,
  busy,
  onDeclared,
  onNote,
  onProofs,
  onRemoveProof,
  onSubmit,
}: {
  x: NonNullable<DailySalesPoint["x"]>;
  z: DailySalesPoint["z"];
  declared: string;
  note: string;
  proofs: string[];
  variance: number;
  busy: boolean;
  onDeclared: (v: string) => void;
  onNote: (v: string) => void;
  onProofs: (files: FileList | null) => void;
  onRemoveProof: (i: number) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-xl">Z-Report</h3>
            <p className="mt-0.5 text-sm text-ink/55">
              End-of-day close — count the drawer, declare what you collected,
              and save the comparison against system sales.
            </p>
          </div>
          {z ? (
            <span className="rounded-full bg-ink/10 px-2.5 py-1 text-[11px] font-semibold text-ink/70">
              Closed {formatDateTime(z.closedAt)}
            </span>
          ) : (
            <span className="rounded-full bg-gold/30 px-2.5 py-1 text-[11px] font-semibold text-ink">
              Open — not closed
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat label="System (from X)" value={formatMoney(x.revenue)} />
          <Stat
            label="Last declared"
            value={z ? formatMoney(z.declaredCashTotal) : "—"}
          />
          <Stat
            label="Last variance"
            value={z ? formatMoney(z.variance) : "—"}
            tone={z ? (z.variance === 0 ? "good" : "warn") : undefined}
          />
        </div>

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-stone/60 px-3 py-3 text-sm">
              <p className="text-ink/55">Expected (live X)</p>
              <p className="mt-1 font-display text-2xl text-teal">
                {formatMoney(x.revenue)}
              </p>
              <p className="mt-1 text-xs text-ink/45">
                {x.orderCount} orders · {x.itemsSold} items
              </p>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Declared received</span>
              <input
                required
                type="number"
                min={0}
                step="0.01"
                className="field"
                value={declared}
                onChange={(e) => onDeclared(e.target.value)}
              />
              <p
                className={cn(
                  "mt-1 text-xs",
                  variance >= 0 ? "text-teal" : "text-coral",
                )}
              >
                Variance vs X: {formatMoney(variance)}
              </p>
            </label>
          </div>
          <textarea
            className="field min-h-20"
            placeholder="Notes (shortages, tips, deposits…)"
            value={note}
            onChange={(e) => onNote(e.target.value)}
          />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-ink/20 bg-stone/40 px-3 py-2 text-sm">
            <ImagePlus className="h-4 w-4" />
            Payment screenshots
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => onProofs(e.target.files)}
            />
          </label>
          {proofs.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {proofs.map((src, i) => (
                <div
                  key={i}
                  className="relative h-16 w-16 overflow-hidden rounded-lg"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-0.5 top-0.5 rounded bg-ink/70 p-0.5 text-white"
                    onClick={() => onRemoveProof(i)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-ink py-3 text-sm font-semibold text-stone disabled:opacity-50"
          >
            {z ? "Save updated Z-Report" : "Close day (Z-Report)"}
          </button>
        </form>

        {z ? (
          <p className="mt-3 text-xs text-ink/50">
            Previous close by {z.closedBy}
            {z.note ? ` · ${z.note}` : ""}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function CompareView({ point }: { point: DailySalesPoint }) {
  const { x, z, variance, driftSinceClose, latestXCount } = point;
  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-5">
        <h3 className="font-display text-xl">X vs Z comparison</h3>
        <p className="mt-0.5 text-sm text-ink/55">
          Daily sales point — system, X cash count, and Z close side by side.
        </p>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-teal/25 bg-teal/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal">
              System (live X)
            </p>
            <p className="mt-2 font-display text-3xl text-ink">
              {formatMoney(x.revenue)}
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-ink/70">
              <li className="flex justify-between gap-2">
                <span>Orders</span>
                <span>{x.orderCount}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>Items</span>
                <span>{x.itemsSold}</span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-ink/10 bg-stone/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/55">
              X cash at hand
            </p>
            {latestXCount ? (
              <>
                <p className="mt-2 font-display text-3xl text-ink">
                  {formatMoney(latestXCount.cashAtHand)}
                </p>
                <ul className="mt-3 space-y-1.5 text-sm text-ink/70">
                  <li className="flex justify-between gap-2">
                    <span>Vs system then</span>
                    <span>{formatMoney(latestXCount.systemTotal)}</span>
                  </li>
                  <li className="flex justify-between gap-2 font-medium">
                    <span>Difference</span>
                    <span
                      className={
                        latestXCount.variance === 0 ? "text-teal" : "text-coral"
                      }
                    >
                      {formatMoney(latestXCount.variance)}
                    </span>
                  </li>
                  <li className="text-xs text-ink/50">
                    {formatDateTime(latestXCount.countedAt)} ·{" "}
                    {latestXCount.countedBy}
                  </li>
                </ul>
              </>
            ) : (
              <p className="mt-6 text-sm text-ink/50">
                No X cash count yet — record money at hand on the X-Report tab.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-ink/10 bg-stone/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/55">
              Z-Report (closed)
            </p>
            {z ? (
              <>
                <p className="mt-2 font-display text-3xl text-ink">
                  {formatMoney(z.declaredCashTotal)}
                </p>
                <ul className="mt-3 space-y-1.5 text-sm text-ink/70">
                  <li className="flex justify-between gap-2">
                    <span>Expected at close</span>
                    <span>{formatMoney(z.expectedSalesTotal)}</span>
                  </li>
                  <li className="flex justify-between gap-2 font-medium">
                    <span>Variance</span>
                    <span
                      className={
                        (variance ?? 0) === 0 ? "text-teal" : "text-coral"
                      }
                    >
                      {formatMoney(variance ?? 0)}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2 text-xs text-ink/50">
                    <span>Closed by</span>
                    <span>
                      {z.closedBy} · {formatDateTime(z.closedAt)}
                    </span>
                  </li>
                </ul>
              </>
            ) : (
              <p className="mt-6 text-sm text-ink/50">
                No Z-Report yet today. Run Z-Report to declare cash and unlock
                the full comparison.
              </p>
            )}
          </div>
        </div>

        {z ? (
          <div className="mt-4 rounded-2xl bg-black/25 px-4 py-3 text-shell-fg">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] text-shell-fg/55">Drawer vs system (Z)</p>
                <p
                  className={cn(
                    "mt-1 font-display text-2xl",
                    (variance ?? 0) === 0 ? "text-gold" : "text-coral",
                  )}
                >
                  {formatMoney(variance ?? 0)}
                </p>
              </div>
              {driftSinceClose != null && driftSinceClose !== 0 ? (
                <div className="text-right">
                  <p className="text-[11px] text-shell-fg/55">
                    Sales since Z was saved
                  </p>
                  <p className="mt-1 font-display text-lg text-gold">
                    {formatMoney(driftSinceClose)}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {x.byPayment.length > 0 ? (
          <div className="mt-4">
            <h4 className="text-sm font-semibold text-ink/70">
              Payment mix (X)
            </h4>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {x.byPayment.map((p) => (
                <li
                  key={p.method}
                  className="flex justify-between rounded-xl bg-stone/50 px-3 py-2 text-sm"
                >
                  <span className="uppercase">{p.method}</span>
                  <span>
                    {p.orderCount} · {formatMoney(p.total)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn";
}) {
  return (
    <div className="rounded-2xl bg-stone/60 px-3 py-3">
      <p className="text-[11px] text-ink/55">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-lg sm:text-xl",
          tone === "good" && "text-teal",
          tone === "warn" && "text-coral",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-ink/45">{hint}</p> : null}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn";
}) {
  return (
    <div className="rounded-2xl bg-white/10 px-3 py-2.5 backdrop-blur">
      <p className="text-[11px] text-shell-fg/55">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-lg",
          tone === "good" && "text-gold",
          tone === "warn" && "text-coral",
        )}
      >
        {value}
      </p>
    </div>
  );
}
