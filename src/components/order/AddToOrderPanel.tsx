"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Send } from "lucide-react";
import { appendOrderItems, type CloudSaleOrder } from "@/lib/cloud-sales";
import { type CloudMenuItem } from "@/lib/cloud-catalog";
import { loadMenuResilient } from "@/lib/offline/resilient";
import { cn, formatMoney } from "@/lib/utils";

type CartLine = { menuItem: CloudMenuItem; quantity: number };

/** Add dishes onto an open check. Same bill, new kitchen send. */
export function AddToOrderPanel({
  orgId,
  order,
  onAdded,
}: {
  orgId: string;
  order: CloudSaleOrder;
  onAdded: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<CloudMenuItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void loadMenuResilient(orgId, setMenu).then(setMenu).catch(() => undefined);
  }, [open, orgId]);

  const available = menu.filter((item) => item.available);
  const extra = useMemo(
    () => cart.reduce((sum, line) => sum + line.menuItem.price * line.quantity, 0),
    [cart],
  );
  const closed = order.status === "canceled" || order.status === "completed";
  if (closed) return null;

  function add(item: CloudMenuItem) {
    setCart((prev) => {
      const found = prev.find((line) => line.menuItem.id === item.id);
      if (!found) return [...prev, { menuItem: item, quantity: 1 }];
      return prev.map((line) =>
        line.menuItem.id === item.id
          ? { ...line, quantity: line.quantity + 1 }
          : line,
      );
    });
  }

  async function send() {
    if (cart.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await appendOrderItems({
        orgId,
        orderId: order.id,
        lines: cart,
        kitchenNote: note,
      });
      const count = cart.reduce((sum, line) => sum + line.quantity, 0);
      setCart([]);
      setNote("");
      setOpen(false);
      onAdded(
        `Added ${count} item${count === 1 ? "" : "s"} to ${result.order.receipt_number} as send ${result.round}. Same bill, now ${formatMoney(Number(result.order.total))}.${
          result.reopenedPayment
            ? " Mark paid again for the new total."
            : ""
        }`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add items");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-teal/30 bg-teal/10 px-3 py-2.5 text-xs font-semibold text-teal"
      >
        <Plus className="h-3.5 w-3.5" />
        {open ? "Close add-on" : "Add more to this bill"}
      </button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-2xl border border-ink/10 bg-stone/40 p-3">
          <p className="text-xs text-ink/60">
            New dishes stay on {order.receipt_number}. The kitchen gets them as
            a separate send.
          </p>
          <ul className="max-h-40 space-y-1 overflow-auto">
            {available.map((item) => {
              const qty =
                cart.find((line) => line.menuItem.id === item.id)?.quantity ?? 0;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => add(item)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm",
                      qty > 0 ? "bg-teal/10" : "bg-white hover:bg-white",
                    )}
                  >
                    <span className="min-w-0 truncate">{item.name}</span>
                    <span className="shrink-0 text-xs text-ink/55">
                      {qty > 0 ? `${qty} · ` : ""}
                      {formatMoney(item.price)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note for this send (optional)"
            className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none"
          />
          {error ? <p className="text-xs text-coral">{error}</p> : null}
          <button
            type="button"
            disabled={busy || cart.length === 0}
            onClick={() => void send()}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-teal px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {busy
              ? "Sending…"
              : `Send ${cart.reduce((s, l) => s + l.quantity, 0) || ""} to kitchen${
                  extra > 0 ? ` · ${formatMoney(extra)}` : ""
                }`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
