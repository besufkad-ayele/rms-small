"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { History, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  deleteInventory,
  listInventory,
  upsertInventory,
  type CloudInventoryItem,
} from "@/lib/cloud-catalog";
import { cn, formatMoney } from "@/lib/utils";

export function InventoryManager() {
  const { tenant } = useAuth();
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
    setItems(await listInventory(orgId));
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
    await upsertInventory(orgId, { id: editing?.id, ...form });
    setEditing(null);
    setForm({
      name: "",
      unit: "kg",
      stock_qty: 0,
      low_stock_threshold: 1,
      cost_per_unit: 0,
    });
    await reload();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
      <section className="rounded-3xl border border-ink/8 bg-white/80 p-4 sm:p-5">
        <h2 className="font-display text-xl">
          {editing ? "Update stock" : "Add inventory"}
        </h2>
        <p className="mt-1 text-sm text-ink/55">
          Cost changes keep up to 12 past values
        </p>
        <form className="mt-4 space-y-3" onSubmit={(e) => void onSubmit(e)}>
          <input required className="field" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input required className="field" placeholder="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            <input required type="number" min={0} step="0.001" className="field" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: Number(e.target.value) })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" min={0} step="0.001" className="field" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) })} />
            <input required type="number" min={0} step="0.01" className="field" value={form.cost_per_unit} onChange={(e) => setForm({ ...form, cost_per_unit: Number(e.target.value) })} />
          </div>
          <button type="submit" className="w-full rounded-xl bg-teal py-3 text-sm font-semibold text-white">
            {editing ? "Save" : "Add item"}
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-ink/8 bg-white/80 p-4 sm:p-5">
        <h2 className="font-display text-xl">Stock board</h2>
        <ul className="mt-4 space-y-2">
          {items.map((item) => {
            const low = Number(item.stock_qty) <= Number(item.low_stock_threshold);
            return (
              <li
                key={item.id}
                className={cn(
                  "rounded-2xl border px-3 py-3",
                  low ? "border-coral/30 bg-coral/5" : "border-ink/8 bg-stone/40",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-ink/55">
                      {item.stock_qty} {item.unit} · {formatMoney(Number(item.cost_per_unit))} · history {(item.cost_history || []).length}
                    </p>
                  </div>
                  <button type="button" className="rounded-lg border border-ink/10 bg-white p-2" onClick={() => setHistoryFor(item)}>
                    <History className="h-4 w-4" />
                  </button>
                  <button type="button" className="rounded-lg border border-ink/10 bg-white p-2" onClick={() => startEdit(item)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-coral/20 bg-coral/10 p-2 text-coral"
                    onClick={() => void deleteInventory(orgId, item.id).then(reload)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {historyFor ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <h3 className="font-display text-lg">Cost history — {historyFor.name}</h3>
            <ul className="mt-3 max-h-72 space-y-2 overflow-auto text-sm">
              {(historyFor.cost_history || []).map((h, idx) => (
                <li key={`${h.recorded_at}-${idx}`} className="flex justify-between rounded-xl bg-stone/60 px-3 py-2">
                  <span>
                    {formatMoney(Number(h.cost_per_unit))}
                    {h.note ? <span className="block text-xs text-ink/50">{h.note}</span> : null}
                  </span>
                  <span className="text-xs text-ink/50">
                    {new Date(h.recorded_at).toLocaleDateString("en-ET")}
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" className="mt-4 w-full rounded-xl bg-ink py-2.5 text-sm text-stone" onClick={() => setHistoryFor(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
