"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, History, Package, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  summarizeInventory,
  type CloudInventoryItem,
} from "@/lib/cloud-catalog";
import {
  deleteInventoryResilient,
  loadInventoryResilient,
  upsertInventoryResilient,
} from "@/lib/offline/resilient";
import { useOfflineSync } from "@/components/offline/OfflineSyncProvider";
import { cn, formatMoney } from "@/lib/utils";

export function InventoryManager() {
  const { tenant } = useAuth();
  const { refreshPendingCount } = useOfflineSync();
  const orgId = tenant!.organization.id;
  const [items, setItems] = useState<CloudInventoryItem[]>([]);
  const [editing, setEditing] = useState<CloudInventoryItem | null>(null);
  const [form, setForm] = useState({
    name: "",
    unit: "kg",
    stock_qty: 0,
    low_stock_threshold: 1,
    cost_per_unit: 0,
  });
  const [historyFor, setHistoryFor] = useState<CloudInventoryItem | null>(null);

  const reload = useCallback(async () => {
    setItems(await loadInventoryResilient(orgId, setItems));
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const dash = useMemo(() => summarizeInventory(items), [items]);

  function startEdit(item: CloudInventoryItem) {
    setEditing(item);
    setForm({
      name: item.name,
      unit: item.unit,
      stock_qty: Number(item.stock_qty),
      low_stock_threshold: Number(item.low_stock_threshold),
      cost_per_unit: Number(item.cost_per_unit),
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { offlineQueued } = await upsertInventoryResilient(orgId, {
      id: editing?.id,
      ...form,
    });
    setEditing(null);
    setForm({
      name: "",
      unit: "kg",
      stock_qty: 0,
      low_stock_threshold: 1,
      cost_per_unit: 0,
    });
    if (offlineQueued) await refreshPendingCount();
    await reload();
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-ink/8 bg-gradient-to-br from-ink via-ink to-teal/85 p-4 text-stone shadow-lg sm:p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-white/10 p-2.5">
            <Package className="h-5 w-5 text-gold" />
          </span>
          <div>
            <h2 className="font-display text-xl sm:text-2xl text-gold">
              Inventory dashboard
            </h2>
            <p className="mt-1 text-sm text-stone/70">
              Stock value, alerts, and items at a glance
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/10 px-3 py-3 backdrop-blur">
            <p className="text-[11px] text-stone/60">Items</p>
            <p className="mt-1 font-display text-xl sm:text-2xl">
              {dash.itemCount}
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-3 backdrop-blur">
            <p className="text-[11px] text-stone/60">Stock value</p>
            <p className="mt-1 font-display text-xl sm:text-2xl">
              {formatMoney(dash.stockValue)}
            </p>
          </div>
          <div
            className={cn(
              "rounded-2xl px-3 py-3 backdrop-blur col-span-2 sm:col-span-1",
              dash.lowStockCount > 0
                ? "bg-coral/25 ring-1 ring-coral/40"
                : "bg-white/10",
            )}
          >
            <p className="text-[11px] text-stone/60">Low stock</p>
            <p className="mt-1 flex items-center gap-1.5 font-display text-xl sm:text-2xl">
              {dash.lowStockCount > 0 ? (
                <AlertTriangle className="h-4 w-4 text-coral" />
              ) : null}
              {dash.lowStockCount}
            </p>
          </div>
        </div>
        {dash.lowStock.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {dash.lowStock.map((i) => (
              <li
                key={i.id}
                className="rounded-full bg-coral/20 px-3 py-1 text-xs text-stone"
              >
                {i.name}: {i.stock_qty} {i.unit}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <section className="rounded-3xl border border-ink/8 bg-white/80 p-4 sm:p-5">
          <h2 className="font-display text-xl">
            {editing ? "Update stock" : "Add inventory"}
          </h2>
          <p className="mt-1 text-sm text-ink/55">
            Cost changes keep up to 12 past values
          </p>
          <form className="mt-4 space-y-3" onSubmit={(e) => void onSubmit(e)}>
            <input
              required
              className="field"
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                className="field"
                placeholder="Unit"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
              <input
                required
                type="number"
                min={0}
                step="0.001"
                className="field"
                value={form.stock_qty}
                onChange={(e) =>
                  setForm({ ...form, stock_qty: Number(e.target.value) })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                min={0}
                step="0.001"
                className="field"
                value={form.low_stock_threshold}
                onChange={(e) =>
                  setForm({
                    ...form,
                    low_stock_threshold: Number(e.target.value),
                  })
                }
              />
              <input
                required
                type="number"
                min={0}
                step="0.01"
                className="field"
                value={form.cost_per_unit}
                onChange={(e) =>
                  setForm({ ...form, cost_per_unit: Number(e.target.value) })
                }
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-teal py-3 text-sm font-semibold text-white"
            >
              {editing ? "Save" : "Add item"}
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-ink/8 bg-white/80 p-4 sm:p-5">
          <h2 className="font-display text-xl">Stock board</h2>
          <ul className="mt-4 space-y-2">
            {items.map((item) => {
              const low =
                Number(item.stock_qty) <= Number(item.low_stock_threshold);
              return (
                <li
                  key={item.id}
                  className={cn(
                    "rounded-2xl border px-3 py-3",
                    low
                      ? "border-coral/30 bg-coral/5"
                      : "border-ink/8 bg-stone/40",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-ink/55">
                        {item.stock_qty} {item.unit} ·{" "}
                        {formatMoney(Number(item.cost_per_unit))} · history{" "}
                        {(item.cost_history || []).length}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border border-ink/10 bg-white p-2"
                      onClick={() => setHistoryFor(item)}
                    >
                      <History className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-ink/10 bg-white p-2"
                      onClick={() => startEdit(item)}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-coral/20 bg-coral/10 p-2 text-coral"
                      onClick={() =>
                        void deleteInventoryResilient(orgId, item.id)
                          .then(async (r) => {
                            if (r.offlineQueued) await refreshPendingCount();
                            await reload();
                          })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {historyFor ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <h3 className="font-display text-lg">
              Cost history — {historyFor.name}
            </h3>
            <ul className="mt-3 max-h-72 space-y-2 overflow-auto text-sm">
              {(historyFor.cost_history || []).map((h, idx) => (
                <li
                  key={`${h.recorded_at}-${idx}`}
                  className="flex justify-between rounded-xl bg-stone/60 px-3 py-2"
                >
                  <span>
                    {formatMoney(Number(h.cost_per_unit))}
                    {h.note ? (
                      <span className="block text-xs text-ink/50">{h.note}</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-ink/50">
                    {new Date(h.recorded_at).toLocaleDateString("en-ET")}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-ink py-2.5 text-sm text-stone"
              onClick={() => setHistoryFor(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
