"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  listOrgStaffDirectoryAction,
  type StaffDirectoryPerson,
} from "@/app/app/staff/actions";
import {
  issueInventory,
  listMovements,
  type CloudInventoryMovement,
} from "@/lib/cloud-inventory-ledger";
import type { CloudInventoryItem } from "@/lib/cloud-catalog";
import { loadInventoryResilient } from "@/lib/offline/resilient";

export function InventoryIssue() {
  const { tenant, user } = useAuth();
  const orgId = tenant!.organization.id;
  const [items, setItems] = useState<CloudInventoryItem[]>([]);
  const [staff, setStaff] = useState<StaffDirectoryPerson[]>([]);
  const [movements, setMovements] = useState<CloudInventoryMovement[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(0);
  const [purpose, setPurpose] = useState("");
  const [issuerId, setIssuerId] = useState(user?.id || "");
  const [forWhomId, setForWhomId] = useState("");

  const reload = useCallback(async () => {
    const [inv, mov, dir] = await Promise.all([
      loadInventoryResilient(orgId),
      listMovements(orgId, { kind: "out", limit: 40 }),
      listOrgStaffDirectoryAction(),
    ]);
    setItems(inv);
    setMovements(mov);
    if ("people" in dir) {
      setStaff(dir.people);
      setIssuerId((prev) => prev || user?.id || dir.people[0]?.userId || "");
    } else {
      setError(dir.error);
    }
  }, [orgId, user?.id]);

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : "Load failed"),
    );
  }, [reload]);

  async function onIssue(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!purpose.trim()) {
      setError("Purpose is required (what is this for?).");
      return;
    }
    const issuer = staff.find((s) => s.userId === issuerId);
    const recipient = staff.find((s) => s.userId === forWhomId);
    if (!issuer) {
      setError("Select who takes out the stock.");
      return;
    }
    if (!recipient) {
      setError("Select who the stock is for.");
      return;
    }
    try {
      await issueInventory({
        orgId,
        inventoryItemId: itemId,
        quantity: qty,
        issuedByUserId: issuer.userId,
        issuedByName: issuer.fullName,
        detail: purpose.trim(),
        note: `For: ${recipient.fullName}`,
      });
      setMessage("Stock issued.");
      setQty(0);
      setPurpose("");
      setForWhomId("");
      setItemId("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Issue failed");
    }
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
        onSubmit={(e) => void onIssue(e)}
        className="grid gap-3 rounded-3xl border border-ink/8 bg-white/80 p-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <h3 className="font-display text-lg">Issue / take-out</h3>
          <p className="mt-1 text-sm text-ink/55">
            Choose staff who takes out and who receives it ·{" "}
            {new Date().toLocaleString()}
          </p>
        </div>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-ink/60">Item *</span>
          <select
            required
            className="field"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
          >
            <option value="">Select…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.stock_qty} {i.unit}
                {i.expiry_date ? ` · exp ${i.expiry_date}` : ""})
              </option>
            ))}
          </select>
        </label>
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
          <span className="mb-1 block text-ink/60">Purpose *</span>
          <input
            required
            className="field"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Lunch prep"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Who takes out *</span>
          <select
            required
            className="field"
            value={issuerId}
            onChange={(e) => setIssuerId(e.target.value)}
          >
            <option value="">Select staff…</option>
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.fullName} ({s.role})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">For whom *</span>
          <select
            required
            className="field"
            value={forWhomId}
            onChange={(e) => setForWhomId(e.target.value)}
          >
            <option value="">Select staff…</option>
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.fullName} ({s.role})
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-xl bg-ink py-2.5 text-sm font-semibold text-stone sm:col-span-2"
        >
          Issue stock
        </button>
      </form>

      <section className="rounded-3xl border border-ink/8 bg-white/80 p-4">
        <h3 className="font-display text-lg">Recent issues</h3>
        <ul className="mt-3 space-y-2">
          {movements.map((m) => (
            <li
              key={m.id}
              className="rounded-2xl border border-ink/8 bg-stone/40 px-3 py-2 text-sm"
            >
              <div className="flex justify-between gap-2">
                <span className="font-medium">
                  −{m.quantity} {m.inventory_items?.unit}{" "}
                  {m.inventory_items?.name}
                </span>
                <span className="text-xs text-ink/45">
                  {new Date(m.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink/55">
                Taken out by {m.issued_by_name}
                {m.note ? ` · ${m.note}` : ""}
                {m.detail ? ` · ${m.detail}` : ""}
              </p>
            </li>
          ))}
          {movements.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink/40">No issues yet</p>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
