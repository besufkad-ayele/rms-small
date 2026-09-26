"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChefHat, Clock } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  listKitchenOrders,
  updateOrderStatus,
  type CloudSaleOrder,
} from "@/lib/cloud-sales";
import {
  SALE_ORDER_STATUS_LABELS,
  type SaleOrderStatus,
} from "@/lib/tenant";
import { cn, formatMoney } from "@/lib/utils";

const COLUMNS: {
  status: SaleOrderStatus;
  next?: "placed" | "preparing" | "ready" | "completed";
}[] = [
  { status: "placed", next: "preparing" },
  { status: "preparing", next: "ready" },
  { status: "ready", next: "completed" },
];

export function KitchenBoard() {
  const { tenant } = useAuth();
  const orgId = tenant!.organization.id;
  const [orders, setOrders] = useState<CloudSaleOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setOrders(await listKitchenOrders(orgId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load kitchen queue");
    }
  }, [orgId]);

  useEffect(() => {
    void reload();
    const t = window.setInterval(() => void reload(), 12_000);
    return () => window.clearInterval(t);
  }, [reload]);

  async function advance(
    order: CloudSaleOrder,
    next: "placed" | "preparing" | "ready" | "completed",
  ) {
    setBusyId(order.id);
    try {
      await updateOrderStatus(orgId, order.id, next);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink/60">
          Today&apos;s tickets — advance when prep starts and when food is ready.
        </p>
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-xl border border-ink/10 bg-white px-3 py-1.5 text-xs font-medium"
        >
          Refresh
        </button>
      </div>
      {error ? (
        <p className="rounded-xl bg-coral/15 px-3 py-2 text-sm text-coral">{error}</p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => o.status === col.status);
          return (
            <section
              key={col.status}
              className="rounded-3xl border border-ink/8 bg-white/80 p-3 sm:p-4"
            >
              <h2 className="flex items-center gap-2 font-display text-lg">
                <ChefHat className="h-4 w-4 text-teal" />
                {SALE_ORDER_STATUS_LABELS[col.status]}
                <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-ink/50">
                  {list.length}
                </span>
              </h2>
              <ul className="mt-3 space-y-3">
                {list.map((order) => (
                  <li
                    key={order.id}
                    className="rounded-2xl border border-ink/8 bg-stone/50 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{order.receipt_number}</p>
                        {order.place_label ? (
                          <p className="text-xs text-teal">
                            Place: {order.place_label}
                          </p>
                        ) : null}
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink/45">
                          <Clock className="h-3 w-3" />
                          {new Date(order.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                      <p className="text-sm text-teal">
                        {formatMoney(order.total)}
                      </p>
                    </div>
                    <ul className="mt-2 space-y-0.5 text-sm">
                      {(order.sale_order_lines || order.lines || []).map(
                        (l, i) => (
                          <li key={i} className="flex justify-between gap-2">
                            <span>
                              {l.quantity}× {l.name}
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                    {order.kitchen_note ? (
                      <p className="mt-2 text-xs text-ink/55">
                        Note: {order.kitchen_note}
                      </p>
                    ) : null}
                    {col.next ? (
                      <button
                        type="button"
                        disabled={busyId === order.id}
                        onClick={() => void advance(order, col.next!)}
                        className={cn(
                          "mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white disabled:opacity-50",
                          col.next === "completed" ? "bg-ink" : "bg-teal",
                        )}
                      >
                        <Check className="h-3.5 w-3.5" />
                        {col.next === "preparing"
                          ? "Start prep"
                          : col.next === "ready"
                            ? "Mark ready"
                            : "Mark served"}
                      </button>
                    ) : null}
                  </li>
                ))}
                {list.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink/40">Empty</p>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
