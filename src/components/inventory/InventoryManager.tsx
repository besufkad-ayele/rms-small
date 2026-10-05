"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, History, Package, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import {
  seedOrgCatalog,
  summarizeInventory,
  type CloudInventoryItem,
} from "@/lib/cloud-catalog";
import {
  createCustomUnit,
  groupUnitsByKind,
  listOrgUnits,
} from "@/lib/inventory-units";
import {
  deleteInventoryResilient,
  loadInventoryResilient,
  upsertInventoryResilient,
} from "@/lib/offline/resilient";
import { useOfflineSync } from "@/components/offline/OfflineSyncProvider";
import type { InventoryUnit } from "@/lib/tenant";
import { cn, formatMoney } from "@/lib/utils";

export function InventoryManager() {
  const { tenant } = useAuth();
  const { refreshPendingCount } = useOfflineSync();
  const orgId = tenant!.organization.id;
  const [items, setItems] = useState<CloudInventoryItem[]>([]);
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [editing, setEditing] = useState<CloudInventoryItem | null>(null);
  const [form, setForm] = useState({
    name: "",
    unit: "kg",
    unit_id: "" as string,
    stock_qty: 0,
    low_stock_threshold: 1,
    cost_per_unit: 0,
  });
  const [historyFor, setHistoryFor] = useState<CloudInventoryItem | null>(null);
  const [detailFor, setDetailFor] = useState<CloudInventoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CloudInventoryItem | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customCode, setCustomCode] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [inv, u] = await Promise.all([
      loadInventoryResilient(orgId, setItems),
      listOrgUnits(orgId),
    ]);
    setItems(inv);
    setUnits(u);
    setForm((f) => {
      if (f.unit_id || !u.length) return f;
      const kg = u.find((x) => x.code === "kg") || u[0];
      return { ...f, unit_id: kg.id, unit: kg.code };
    });
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const dash = useMemo(() => summarizeInventory(items), [items]);
  const attention = useMemo(() => {
    const rows: {
      id: string;
      title: string;
      detail: string;
      tone: "bad" | "warn";
    }[] = [];
    const seen = new Set<string>();
    for (const item of dash.expired) {
      seen.add(item.id);
      rows.push({
        id: item.id,
        title: item.name,
        detail: `${item.stock_qty} ${item.unit} · expired ${item.expiry_date}`,
        tone: "bad",
      });
    }
    for (const item of dash.expiring) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      rows.push({
        id: item.id,
        title: item.name,
        detail: `${item.stock_qty} ${item.unit} · ${
          item.daysLeft === 0
            ? "expires today"
            : `expires in ${item.daysLeft} day${item.daysLeft === 1 ? "" : "s"}`
        }`,
        tone: "warn",
      });
    }
    for (const item of dash.lowStock) {
      if (seen.has(item.id)) continue;
      rows.push({
        id: item.id,
        title: item.name,
        detail:
          item.stock_qty <= 0
            ? `Out of stock · 0 ${item.unit}`
            : `Low · ${item.stock_qty} ${item.unit} left`,
        tone: item.stock_qty <= 0 ? "bad" : "warn",
      });
    }
    return rows;
  }, [dash]);
  const grouped = useMemo(() => groupUnitsByKind(units), [units]);

  function startEdit(item: CloudInventoryItem) {
    setEditing(item);
    const match =
      units.find((u) => u.id === item.unit_id) ||
      units.find((u) => u.code.toLowerCase() === item.unit.toLowerCase());
    setForm({
      name: item.name,
      unit: match?.code || item.unit,
      unit_id: match?.id || "",
      stock_qty: Number(item.stock_qty),
      low_stock_threshold: Number(item.low_stock_threshold),
      cost_per_unit: Number(item.cost_per_unit),
    });
  }

  function pickUnit(unitId: string) {
    const u = units.find((x) => x.id === unitId);
    if (!u) return;
    setForm((f) => ({ ...f, unit_id: u.id, unit: u.code }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const unit =
      units.find((u) => u.id === form.unit_id) ||
      units.find((u) => u.code === form.unit);
    const { offlineQueued } = await upsertInventoryResilient(orgId, {
      id: editing?.id,
      name: form.name,
      unit: unit?.code || form.unit,
      unit_id: unit?.id || form.unit_id || null,
      stock_qty: form.stock_qty,
      low_stock_threshold: form.low_stock_threshold,
      cost_per_unit: form.cost_per_unit,
    });
    setEditing(null);
    const defaultUnit = units.find((x) => x.code === "kg") || units[0];
    setForm({
      name: "",
      unit: defaultUnit?.code || "kg",
      unit_id: defaultUnit?.id || "",
      stock_qty: 0,
      low_stock_threshold: 1,
      cost_per_unit: 0,
    });
    if (offlineQueued) await refreshPendingCount();
    await reload();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await deleteInventoryResilient(orgId, deleteTarget.id);
      if (r.offlineQueued) await refreshPendingCount();
      setDeleteTarget(null);
      if (detailFor?.id === deleteTarget.id) setDetailFor(null);
      await reload();
    } finally {
      setDeleting(false);
    }
  }

  async function addCustomUnit() {
    if (!customCode.trim()) return;
    const created = await createCustomUnit(orgId, {
      code: customCode,
      label: customLabel || customCode,
    });
    setUnits((prev) => [...prev, created]);
    setForm((f) => ({ ...f, unit_id: created.id, unit: created.code }));
    setCustomOpen(false);
    setCustomCode("");
    setCustomLabel("");
  }

  async function loadSample() {
    setSeeding(true);
    setMessage(null);
    try {
      await seedOrgCatalog(orgId);
      setMessage("Sample menu & inventory loaded.");
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load sample data");
    } finally {
      setSeeding(false);
    }
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
              {dash.itemCount === 0
                ? "Stock value, alerts, and items at a glance"
                : `${dash.healthyCount} of ${dash.itemCount} above the alert level · ${formatMoney(dash.stockValue)} on hand`}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <DashStat label="Items" value={String(dash.itemCount)} />
          <DashStat label="Stock value" value={formatMoney(dash.stockValue)} />
          <DashStat
            label="Healthy"
            value={String(dash.healthyCount)}
            className="col-span-2 sm:col-span-1"
          />
          <DashStat
            label="Low stock"
            value={String(dash.lowStockCount)}
            alert={dash.lowStockCount > 0}
          />
          <DashStat
            label="Out of stock"
            value={String(dash.outCount)}
            alert={dash.outCount > 0}
          />
          <DashStat
            label="Expiring in 14 days"
            value={String(dash.expiringCount)}
            alert={dash.expiringCount > 0}
            className="col-span-2 sm:col-span-1"
          />
        </div>
        {dash.itemCount > 0 ? (
          <div className="mt-3">
            <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
              {dash.healthyCount > 0 ? (
                <span
                  className="bg-teal"
                  style={{
                    width: `${(dash.healthyCount / dash.itemCount) * 100}%`,
                  }}
                />
              ) : null}
              {dash.lowStockCount - dash.outCount > 0 ? (
                <span
                  className="bg-gold"
                  style={{
                    width: `${((dash.lowStockCount - dash.outCount) / dash.itemCount) * 100}%`,
                  }}
                />
              ) : null}
              {dash.outCount > 0 ? (
                <span
                  className="bg-coral"
                  style={{
                    width: `${(dash.outCount / dash.itemCount) * 100}%`,
                  }}
                />
              ) : null}
            </div>
            <p className="mt-1.5 text-[11px] text-stone/55">
              Teal healthy · gold low · coral out
              {dash.expiredCount > 0
                ? ` · ${dash.expiredCount} already expired`
                : ""}
            </p>
          </div>
        ) : null}
      </section>

      {items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-ink/15 bg-white/60 px-4 py-6 text-center">
          <p className="text-sm text-ink/60">
            Inventory is empty. Add stock under{" "}
            <span className="font-medium text-teal">Receive & suppliers</span>,
            or load sample data once.
          </p>
          <button
            type="button"
            disabled={seeding}
            onClick={() => void loadSample()}
            className="mt-3 rounded-xl border border-teal/30 bg-teal/10 px-4 py-2 text-sm font-medium text-teal disabled:opacity-60"
          >
            {seeding ? "Loading…" : "Load sample data"}
          </button>
          {message ? (
            <p className="mt-2 text-xs text-teal">{message}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <section className="rounded-3xl border border-ink/8 bg-white/80 p-4 sm:p-5">
          {editing ? (
            <>
              <h2 className="font-display text-xl">Update item</h2>
              <p className="mt-1 text-sm text-ink/55">
                Adjust thresholds and cost. New stock goes through Receive.
              </p>
              <form className="mt-4 space-y-3" onSubmit={(e) => void onSubmit(e)}>
                <input
                  required
                  className="field"
                  placeholder="Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <div>
                  <label className="mb-1 block text-xs text-ink/55">Unit</label>
                  <select
                    required
                    className="field"
                    value={form.unit_id}
                    onChange={(e) => pickUnit(e.target.value)}
                  >
                    <option value="">Select unit…</option>
                    {grouped.map((g) => (
                      <optgroup key={g.kind} label={g.label}>
                        {g.units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.label} ({u.code})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-ink/55">
                      Stock qty
                    </span>
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
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-ink/55">
                      Low-stock alert
                    </span>
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
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-ink/55">
                    Cost per {form.unit || "unit"} (ETB)
                  </span>
                  <input
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    className="field"
                    value={form.cost_per_unit}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        cost_per_unit: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-teal py-3 text-sm font-semibold text-white"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="w-full text-sm text-teal underline"
                >
                  Cancel edit
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="font-display text-xl">What needs attention</h2>
              <p className="mt-1 text-sm text-ink/55">
                Receive stock under{" "}
                <span className="font-medium text-teal">Receive & suppliers</span>
                . Take stock out under{" "}
                <span className="font-medium text-teal">Issue / take-out</span>.
              </p>
              {attention.length === 0 ? (
                <p className="mt-4 rounded-2xl bg-teal/10 px-3 py-3 text-sm text-ink/70">
                  Nothing is low, out, or expiring in the next 14 days.
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {attention.map((item) => (
                    <AttentionRow
                      key={item.id}
                      title={item.title}
                      detail={item.detail}
                      tone={item.tone}
                    />
                  ))}
                </ul>
              )}
              {dash.topValue.length > 0 ? (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-ink/80">
                    Highest stock value
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {dash.topValue.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 truncate">
                          {item.name}
                          <span className="text-ink/45">
                            {" "}
                            · {item.stock_qty} {item.unit}
                          </span>
                        </span>
                        <span className="shrink-0 font-medium">
                          {formatMoney(item.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
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
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setDetailFor(item)}
                    >
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-ink/55">
                        {item.stock_qty} {item.unit} ·{" "}
                        {formatMoney(Number(item.cost_per_unit))}/{item.unit} ·
                        low ≤ {item.low_stock_threshold} {item.unit}
                        {item.expiry_date ? ` · exp ${item.expiry_date}` : ""}
                      </p>
                    </button>
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
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
            {items.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink/50">
                No inventory items yet.
              </p>
            ) : null}
          </ul>
        </section>
      </div>

      {detailFor ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <h3 className="font-display text-lg">{detailFor.name}</h3>
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="rounded-xl bg-stone/60 px-3 py-2">
                <dt className="text-xs text-ink/50">Unit</dt>
                <dd className="font-medium">{detailFor.unit}</dd>
              </div>
              <div className="rounded-xl bg-stone/60 px-3 py-2">
                <dt className="text-xs text-ink/50">Stock</dt>
                <dd className="font-medium">
                  {detailFor.stock_qty} {detailFor.unit}
                </dd>
              </div>
              <div className="rounded-xl bg-stone/60 px-3 py-2">
                <dt className="text-xs text-ink/50">Cost per unit</dt>
                <dd className="font-medium">
                  {formatMoney(Number(detailFor.cost_per_unit))} /{" "}
                  {detailFor.unit}
                </dd>
              </div>
              <div className="rounded-xl bg-stone/60 px-3 py-2">
                <dt className="text-xs text-ink/50">Low-stock threshold</dt>
                <dd className="font-medium">
                  {detailFor.low_stock_threshold} {detailFor.unit}
                </dd>
              </div>
              <div className="rounded-xl bg-stone/60 px-3 py-2">
                <dt className="text-xs text-ink/50">Buy / expiry</dt>
                <dd className="font-medium">
                  {detailFor.last_purchased_at || "—"} /{" "}
                  {detailFor.expiry_date || "—"}
                </dd>
              </div>
              <div className="rounded-xl bg-stone/60 px-3 py-2">
                <dt className="text-xs text-ink/50">Cost history entries</dt>
                <dd className="font-medium">
                  {(detailFor.cost_history || []).length}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-ink py-2.5 text-sm text-stone"
              onClick={() => setDetailFor(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

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
              {(historyFor.cost_history || []).length === 0 ? (
                <p className="text-sm text-ink/50">No history yet.</p>
              ) : null}
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

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title={
          deleteTarget
            ? `Delete “${deleteTarget.name}”?`
            : "Delete permanently?"
        }
        message="This will be permanently deleted. Are you sure?"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function DashStat({
  label,
  value,
  alert = false,
  className,
}: {
  label: string;
  value: string;
  alert?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl px-3 py-3 backdrop-blur",
        alert ? "bg-coral/25 ring-1 ring-coral/40" : "bg-white/10",
        className,
      )}
    >
      <p className="text-[11px] text-stone/60">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 font-display text-xl sm:text-2xl">
        {alert ? <AlertTriangle className="h-4 w-4 text-coral" /> : null}
        {value}
      </p>
    </div>
  );
}

function AttentionRow({
  title,
  detail,
  tone,
}: {
  title: string;
  detail: string;
  tone: "bad" | "warn";
}) {
  return (
    <li
      className={cn(
        "rounded-2xl border px-3 py-2.5",
        tone === "bad"
          ? "border-coral/30 bg-coral/10"
          : "border-gold/40 bg-gold/15",
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-ink/60">{detail}</p>
    </li>
  );
}
