"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  listMovements,
  listSuppliers,
  receiveInventory,
  upsertSupplier,
  type CloudInventoryMovement,
  type CloudInventorySupplier,
} from "@/lib/cloud-inventory-ledger";
import { upsertInventory, type CloudInventoryItem } from "@/lib/cloud-catalog";
import {
  createCustomUnit,
  groupUnitsByKind,
  listOrgUnits,
} from "@/lib/inventory-units";
import { loadInventoryResilient } from "@/lib/offline/resilient";
import type { InventoryUnit } from "@/lib/tenant";
import { formatMoney } from "@/lib/utils";

export function InventoryReceive() {
  const { tenant, user } = useAuth();
  const orgId = tenant!.organization.id;
  const [items, setItems] = useState<CloudInventoryItem[]>([]);
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [suppliers, setSuppliers] = useState<CloudInventorySupplier[]>([]);
  const [movements, setMovements] = useState<CloudInventoryMovement[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"existing" | "new">("new");
  const [itemId, setItemId] = useState("");
  const [name, setName] = useState("");
  const [unitId, setUnitId] = useState("");
  const [unitCode, setUnitCode] = useState("kg");
  const [qty, setQty] = useState(0);
  const [lowStock, setLowStock] = useState(1);
  const [supplierId, setSupplierId] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [expiresAt, setExpiresAt] = useState("");
  const [cost, setCost] = useState(0);
  const [note, setNote] = useState("");

  const [supName, setSupName] = useState("");
  const [supPhone, setSupPhone] = useState("");
  const [supLocation, setSupLocation] = useState("");
  const [supNotes, setSupNotes] = useState("");
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(
    null,
  );
  const [customOpen, setCustomOpen] = useState(false);
  const [customCode, setCustomCode] = useState("");
  const [customLabel, setCustomLabel] = useState("");

  const grouped = useMemo(() => groupUnitsByKind(units), [units]);

  const reload = useCallback(async () => {
    const [inv, u, sup, mov] = await Promise.all([
      loadInventoryResilient(orgId),
      listOrgUnits(orgId),
      listSuppliers(orgId),
      listMovements(orgId, { kind: "in", limit: 40 }),
    ]);
    setItems(inv);
    setUnits(u);
    setSuppliers(sup);
    setMovements(mov);
    if (!unitId && u.length) {
      const kg = u.find((x) => x.code === "kg") || u[0];
      setUnitId(kg.id);
      setUnitCode(kg.code);
    }
  }, [orgId, unitId]);

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : "Load failed"),
    );
  }, [reload]);

  function pickUnit(id: string) {
    const u = units.find((x) => x.id === id);
    if (!u) return;
    setUnitId(u.id);
    setUnitCode(u.code);
  }

  async function onReceive(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (qty <= 0) {
      setError("Quantity must be positive.");
      return;
    }
    if (!expiresAt) {
      setError("Expiry date is required.");
      return;
    }
    if (!supplierId) {
      setError("Select a supplier (add one below if needed).");
      return;
    }
    try {
      let targetId = itemId;
      if (mode === "new") {
        if (!name.trim()) throw new Error("Item name is required.");
        if (!unitId) throw new Error("Measurement unit is required.");
        targetId = await upsertInventory(orgId, {
          name: name.trim(),
          unit: unitCode,
          unit_id: unitId,
          stock_qty: 0,
          low_stock_threshold: lowStock,
          cost_per_unit: cost,
        });
      } else if (!targetId) {
        throw new Error("Select an inventory item.");
      }

      await receiveInventory({
        orgId,
        inventoryItemId: targetId,
        quantity: qty,
        supplierId,
        buyerUserId: user!.id,
        buyerName: tenant!.profile.full_name,
        purchasedAt,
        expiresAt,
        costPerUnit: cost,
        note,
      });

      setMessage("Stock received and recorded.");
      setQty(0);
      setNote("");
      setName("");
      setExpiresAt("");
      setItemId("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Receive failed");
    }
  }

  function clearSupplierForm() {
    setEditingSupplierId(null);
    setSupName("");
    setSupPhone("");
    setSupLocation("");
    setSupNotes("");
  }

  function startEditSupplier(s: CloudInventorySupplier) {
    setEditingSupplierId(s.id);
    setSupName(s.name);
    setSupPhone(s.phone || "");
    setSupLocation(s.location || "");
    setSupNotes(s.notes || "");
    setMessage(null);
    setError(null);
  }

  async function onSupplier(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const wasEdit = Boolean(editingSupplierId);
      const saved = await upsertSupplier(orgId, {
        id: editingSupplierId || undefined,
        name: supName,
        phone: supPhone,
        location: supLocation,
        notes: supNotes,
      });
      clearSupplierForm();
      setSupplierId(saved.id);
      setMessage(wasEdit ? "Supplier updated." : "Supplier saved.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Supplier save failed");
    }
  }

  async function addCustomUnit() {
    if (!customCode.trim()) return;
    const created = await createCustomUnit(orgId, {
      code: customCode,
      label: customLabel || customCode,
    });
    setUnits((prev) => [...prev, created]);
    setUnitId(created.id);
    setUnitCode(created.code);
    setCustomOpen(false);
    setCustomCode("");
    setCustomLabel("");
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-xl bg-coral/15 px-3 py-2 text-sm text-coral">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded-xl bg-teal/10 px-3 py-2 text-sm text-teal">{message}</p>
      ) : null}

      <form
        onSubmit={(e) => void onReceive(e)}
        className="grid gap-3 rounded-3xl border border-ink/8 bg-white/80 p-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <h3 className="font-display text-lg">Receive stock</h3>
          <p className="mt-1 text-sm text-ink/55">
            Add quantity, measurement, supplier, cost, buy & expiry — buyer is
            you ({tenant!.profile.full_name}).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMode("new")}
              className={
                mode === "new"
                  ? "rounded-full bg-teal px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full bg-ink/5 px-3 py-1 text-xs font-medium text-ink/70"
              }
            >
              New item
            </button>
            <button
              type="button"
              onClick={() => setMode("existing")}
              className={
                mode === "existing"
                  ? "rounded-full bg-teal px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full bg-ink/5 px-3 py-1 text-xs font-medium text-ink/70"
              }
            >
              Existing item
            </button>
          </div>
        </div>

        {mode === "new" ? (
          <>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-ink/60">Item name *</span>
              <input
                required
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Pasta"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-ink/60">Measurement *</span>
              <select
                required
                className="field"
                value={unitId}
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
              <button
                type="button"
                className="mt-1.5 text-xs font-medium text-teal underline"
                onClick={() => setCustomOpen((o) => !o)}
              >
                {customOpen ? "Cancel custom unit" : "Add custom unit"}
              </button>
              {customOpen ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    className="field"
                    placeholder="Code"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value)}
                  />
                  <input
                    className="field"
                    placeholder="Label"
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => void addCustomUnit()}
                    className="col-span-2 rounded-xl bg-ink py-2 text-sm text-stone"
                  >
                    Save unit
                  </button>
                </div>
              ) : null}
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Low-stock alert</span>
              <input
                type="number"
                min={0}
                step="0.001"
                className="field"
                value={lowStock}
                onChange={(e) => setLowStock(Number(e.target.value))}
              />
            </label>
          </>
        ) : (
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-ink/60">Inventory item *</span>
            <select
              required
              className="field"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
            >
              <option value="">Select…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.stock_qty} {i.unit})
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Quantity *</span>
          <input
            required
            type="number"
            min={0.001}
            step="0.001"
            className="field"
            value={qty || ""}
            onChange={(e) => setQty(Number(e.target.value))}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Cost / unit (ETB) *</span>
          <input
            required
            type="number"
            min={0}
            step="0.01"
            className="field"
            value={cost || ""}
            onChange={(e) => setCost(Number(e.target.value))}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-ink/60">Supplier *</span>
          <select
            required
            className="field"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.phone ? ` · ${s.phone}` : ""}
                {s.location ? ` · ${s.location}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Buy date *</span>
          <input
            required
            type="date"
            className="field"
            value={purchasedAt}
            onChange={(e) => setPurchasedAt(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Expiry date *</span>
          <input
            required
            type="date"
            className="field"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-ink/60">Note</span>
          <input
            className="field"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-teal py-2.5 text-sm font-semibold text-white sm:col-span-2"
        >
          Receive stock
        </button>
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        <form
          onSubmit={(e) => void onSupplier(e)}
          className="space-y-3 rounded-3xl border border-ink/8 bg-white/80 p-4"
        >
          <h3 className="font-display text-lg">
            {editingSupplierId ? "Edit supplier" : "Add supplier"}
          </h3>
          <p className="text-sm text-ink/55">
            Who you buy from — name, phone, location.
          </p>
          <input
            required
            className="field"
            placeholder="Name *"
            value={supName}
            onChange={(e) => setSupName(e.target.value)}
          />
          <input
            className="field"
            placeholder="Phone"
            value={supPhone}
            onChange={(e) => setSupPhone(e.target.value)}
          />
          <input
            className="field"
            placeholder="Location"
            value={supLocation}
            onChange={(e) => setSupLocation(e.target.value)}
          />
          <textarea
            className="field min-h-16"
            placeholder="Notes (optional)"
            value={supNotes}
            onChange={(e) => setSupNotes(e.target.value)}
          />
          <button
            type="submit"
            className="w-full rounded-xl bg-ink py-2.5 text-sm font-semibold text-stone"
          >
            {editingSupplierId ? "Update supplier" : "Save supplier"}
          </button>
          {editingSupplierId ? (
            <button
              type="button"
              onClick={clearSupplierForm}
              className="w-full text-sm text-teal underline"
            >
              Cancel edit
            </button>
          ) : null}
        </form>

        <section className="rounded-3xl border border-ink/8 bg-white/80 p-4">
          <h3 className="font-display text-lg">Suppliers</h3>
          <ul className="mt-3 space-y-2">
            {suppliers.map((s) => (
              <li
                key={s.id}
                className="flex items-start justify-between gap-2 rounded-2xl border border-ink/8 bg-stone/40 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-ink/55">
                    {[s.phone, s.location].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {s.notes ? (
                    <p className="mt-0.5 text-xs text-ink/45">{s.notes}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => startEditSupplier(s)}
                  className="shrink-0 rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs font-medium text-teal"
                >
                  Edit
                </button>
              </li>
            ))}
            {suppliers.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink/40">
                No suppliers yet
              </p>
            ) : null}
          </ul>
        </section>
      </div>

      <section className="rounded-3xl border border-ink/8 bg-white/80 p-4">
        <h3 className="font-display text-lg">Recent receipts</h3>
        <ul className="mt-3 space-y-2">
          {movements.map((m) => (
            <li
              key={m.id}
              className="rounded-2xl border border-ink/8 bg-stone/40 px-3 py-2 text-sm"
            >
              <div className="flex justify-between gap-2">
                <span className="font-medium">
                  +{m.quantity} {m.inventory_items?.unit}{" "}
                  {m.inventory_items?.name}
                </span>
                <span className="text-xs text-ink/45">
                  {new Date(m.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink/55">
                Buyer {m.buyer_name}
                {m.inventory_suppliers?.name
                  ? ` · from ${m.inventory_suppliers.name}`
                  : ""}
                {m.purchased_at ? ` · bought ${m.purchased_at}` : ""}
                {m.expires_at ? ` · exp ${m.expires_at}` : ""}
                {m.cost_per_unit != null
                  ? ` · ${formatMoney(Number(m.cost_per_unit))}/u`
                  : ""}
              </p>
            </li>
          ))}
          {movements.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink/40">No receipts yet</p>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
