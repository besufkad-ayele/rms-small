"use client";

import { Fragment, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  ImagePlus,
  LayoutList,
  ListOrdered,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { downloadWorkbook, periodLabel } from "@/lib/excel";
import {
  getFinanceDashboard,
  type FinanceDashboard,
} from "@/lib/finance";
import {
  listCloudDayCloses,
  saveCloudDayClose,
} from "@/lib/cloud-sales";
import { PaidBillsPanel } from "@/components/finance/PaidBillsPanel";
import type { ReportPeriod } from "@/lib/types";
import { cn, dayKey, formatDateTime, formatMoney } from "@/lib/utils";

const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: "today", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
  { id: "year", label: "Yearly" },
  { id: "all", label: "All time" },
];

type ViewMode = "orders" | "items";

export function FinanceDashboardPanel() {
  const { tenant } = useAuth();
  const orgId = tenant!.organization.id;
  const [period, setPeriod] = useState<ReportPeriod>("today");
  const [view, setView] = useState<ViewMode>("orders");
  const [dash, setDash] = useState<FinanceDashboard | null>(null);
  const [closes, setCloses] = useState<
    Awaited<ReturnType<typeof listCloudDayCloses>>
  >([]);
  const [declared, setDeclared] = useState("");
  const [note, setNote] = useState("");
  const [proofs, setProofs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [d, c] = await Promise.all([
      getFinanceDashboard(orgId, period),
      listCloudDayCloses(orgId),
    ]);
    setDash(d);
    setCloses(c);
  }, [orgId, period]);

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : "Load failed"),
    );
  }, [reload]);

  const expected = dash?.revenue ?? 0;
  const variance = useMemo(() => {
    const d = Number(declared) || 0;
    return Math.round((d - expected) * 100) / 100;
  }, [declared, expected]);

  function exportExcel() {
    if (!dash || !tenant) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const label = periodLabel(period);
    const biz = tenant.organization.name.replace(/\s+/g, "-");

    if (view === "orders") {
      downloadWorkbook(`aramis-${biz}-orders-${label}-${stamp}.xlsx`, [
        {
          name: "By order",
          rows: dash.byOrder.map((o) => ({
            Receipt: o.receiptNumber,
            Date: o.createdAt,
            Day: o.dayKey,
            Cashier: o.cashier,
            Payment: o.paymentMethod,
            Reference: o.paymentReference,
            Items: o.itemsSummary,
            "Item qty": o.itemCount,
            Subtotal: o.subtotal,
            Service: o.serviceCharge,
            VAT: o.vat,
            Total: o.total,
            COGS: o.cogs,
            "Gross profit": o.grossProfit,
            "Margin %": o.grossMarginPct,
          })),
        },
        {
          name: "Summary",
          rows: [
            {
              Period: label,
              Orders: dash.orderCount,
              "Items sold": dash.itemsSold,
              Revenue: dash.revenue,
              Subtotal: dash.subtotal,
              Service: dash.serviceCharge,
              VAT: dash.vat,
              COGS: dash.cogs,
              "Gross profit": dash.grossProfit,
              "Margin %": dash.grossMarginPct,
            },
          ],
        },
      ]);
      return;
    }

    downloadWorkbook(`aramis-${biz}-items-${label}-${stamp}.xlsx`, [
      {
        name: "By menu item",
        rows: dash.byItem.map((i) => ({
          Item: i.name,
          Quantity: i.quantity,
          "Orders containing": i.orderCount,
          Revenue: i.revenue,
          "Unit cost": i.unitCost,
          COGS: i.cogs,
          "Gross profit": i.grossProfit,
        })),
      },
      {
        name: "Summary",
        rows: [
          {
            Period: label,
            Revenue: dash.revenue,
            COGS: dash.cogs,
            "Gross profit": dash.grossProfit,
            "Margin %": dash.grossMarginPct,
          },
        ],
      },
    ]);
  }

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
      <section className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl sm:text-2xl">Finance dashboard</h2>
            <p className="mt-1 text-sm text-ink/55">
              Align cash in hand with system sales — by order or by menu item
            </p>
          </div>
          <button
            type="button"
            onClick={exportExcel}
            disabled={!dash}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export Excel ({view === "orders" ? "orders" : "items"})
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                period === p.id ? "bg-ink text-stone" : "bg-ink/5 text-ink/70",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Revenue" value={formatMoney(dash?.revenue ?? 0)} />
          <Stat label="COGS" value={formatMoney(dash?.cogs ?? 0)} />
          <Stat label="Gross profit" value={formatMoney(dash?.grossProfit ?? 0)} />
          <Stat label="Margin" value={`${dash?.grossMarginPct ?? 0}%`} />
          <Stat label="Orders" value={String(dash?.orderCount ?? 0)} />
          <Stat label="Items sold" value={String(dash?.itemsSold ?? 0)} />
        </div>
      </section>

      <section className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setView("orders")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium",
              view === "orders" ? "bg-teal text-white" : "bg-stone text-ink/70",
            )}
          >
            <ListOrdered className="h-4 w-4" />
            By order
          </button>
          <button
            type="button"
            onClick={() => setView("items")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium",
              view === "items" ? "bg-teal text-white" : "bg-stone text-ink/70",
            )}
          >
            <LayoutList className="h-4 w-4" />
            By menu item
          </button>
        </div>

        {view === "orders" ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-ink/10 text-xs text-ink/50">
                <tr>
                  <th className="px-2 py-2">Receipt</th>
                  <th className="px-2 py-2">When</th>
                  <th className="px-2 py-2">Items</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-2 py-2 text-right">COGS</th>
                  <th className="px-2 py-2 text-right">Profit</th>
                </tr>
              </thead>
              <tbody>
                {(dash?.byOrder ?? []).map((o) => (
                  <Fragment key={o.orderId}>
                    <tr
                      className="cursor-pointer border-b border-ink/5 hover:bg-stone/40"
                      onClick={() =>
                        setExpandedOrder(
                          expandedOrder === o.orderId ? null : o.orderId,
                        )
                      }
                    >
                      <td className="px-2 py-2 font-mono text-xs">{o.receiptNumber}</td>
                      <td className="px-2 py-2 text-xs">{formatDateTime(o.createdAt)}</td>
                      <td className="max-w-[14rem] truncate px-2 py-2 text-xs">
                        {o.itemCount} · {o.itemsSummary}
                      </td>
                      <td className="px-2 py-2 text-right font-medium">{formatMoney(o.total)}</td>
                      <td className="px-2 py-2 text-right text-ink/60">{formatMoney(o.cogs)}</td>
                      <td className="px-2 py-2 text-right text-teal">{formatMoney(o.grossProfit)}</td>
                    </tr>
                    {expandedOrder === o.orderId ? (
                      <tr className="bg-stone/30">
                        <td colSpan={6} className="px-3 py-3 text-xs text-ink/70">
                          Cashier {o.cashier} · {o.paymentMethod.toUpperCase()}
                          {o.paymentReference ? ` · ref ${o.paymentReference}` : ""}
                          <br />
                          Subtotal {formatMoney(o.subtotal)} · Service{" "}
                          {formatMoney(o.serviceCharge)} · VAT {formatMoney(o.vat)} ·
                          Margin {o.grossMarginPct}%
                          <br />
                          Detail: {o.itemsSummary}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {(dash?.byOrder.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-ink/45">No orders in this period</p>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-ink/10 text-xs text-ink/50">
                <tr>
                  <th className="px-2 py-2">Menu item</th>
                  <th className="px-2 py-2 text-right">Qty sold</th>
                  <th className="px-2 py-2 text-right">In orders</th>
                  <th className="px-2 py-2 text-right">Revenue</th>
                  <th className="px-2 py-2 text-right">COGS</th>
                  <th className="px-2 py-2 text-right">Profit</th>
                </tr>
              </thead>
              <tbody>
                {(dash?.byItem ?? []).map((i) => (
                  <tr key={i.menuItemId} className="border-b border-ink/5">
                    <td className="px-2 py-2 font-medium">{i.name}</td>
                    <td className="px-2 py-2 text-right">{i.quantity}</td>
                    <td className="px-2 py-2 text-right">{i.orderCount}</td>
                    <td className="px-2 py-2 text-right">{formatMoney(i.revenue)}</td>
                    <td className="px-2 py-2 text-right text-ink/60">{formatMoney(i.cogs)}</td>
                    <td className="px-2 py-2 text-right text-teal">{formatMoney(i.grossProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(dash?.byItem.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-ink/45">No item sales in this period</p>
            ) : null}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-5">
        <h2 className="font-display text-xl">Cash vs system (day close)</h2>
        <p className="mt-1 text-sm text-ink/55">
          Expected total from today&apos;s recorded orders vs what you collected
        </p>
        <form className="mt-4 space-y-3" onSubmit={(e) => void onDayClose(e)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-stone/60 px-3 py-3 text-sm">
              <p className="text-ink/55">Expected (system today)</p>
              <p className="mt-1 font-display text-2xl text-teal">
                {formatMoney(
                  period === "today" ? expected : (dash?.byOrder
                    .filter((o) => o.dayKey === dayKey())
                    .reduce((s, o) => s + o.total, 0) ?? 0),
                )}
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
                onChange={(e) => setDeclared(e.target.value)}
              />
              <p className={cn("mt-1 text-xs", variance >= 0 ? "text-teal" : "text-coral")}>
                Variance: {formatMoney(variance)}
              </p>
            </label>
          </div>
          <textarea
            className="field min-h-20"
            placeholder="Notes"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-ink/20 bg-stone/40 px-3 py-2 text-sm">
            <ImagePlus className="h-4 w-4" />
            Payment screenshots
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void onProofs(e.target.files)}
            />
          </label>
          {proofs.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {proofs.map((src, i) => (
                <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-0.5 top-0.5 rounded bg-ink/70 p-0.5 text-white"
                    onClick={() => setProofs((p) => p.filter((_, idx) => idx !== i))}
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
            Save day close verification
          </button>
        </form>
        <ul className="mt-4 space-y-2">
          {closes.slice(0, 5).map((c) => (
            <li
              key={c.id}
              className="rounded-2xl border border-ink/8 bg-stone/40 px-3 py-2 text-sm"
            >
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

      <PaidBillsPanel orgId={orgId} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-stone/60 px-3 py-3">
      <p className="text-[11px] text-ink/55">{label}</p>
      <p className="mt-1 font-display text-lg text-ink sm:text-xl">{value}</p>
    </div>
  );
}
