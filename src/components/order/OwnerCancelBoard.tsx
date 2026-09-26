"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { loadMenuResilient } from "@/lib/offline/resilient";
import {
  cancelCloudSale,
  listCloudOrders,
  type CloudSaleOrder,
} from "@/lib/cloud-sales";
import type { CloudMenuItem } from "@/lib/cloud-catalog";
import {
  SALE_ORDER_STATUS_LABELS,
  type SaleOrderStatus,
} from "@/lib/tenant";
import { dayKey, formatMoney } from "@/lib/utils";

/** Owner-only: confirm real cancellation (especially cashier requests). */
export function OwnerCancelBoard() {
  const { tenant } = useAuth();
  const orgId = tenant!.organization.id;
  const [orders, setOrders] = useState<CloudSaleOrder[]>([]);
  const [menu, setMenu] = useState<CloudMenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [o, m] = await Promise.all([
        listCloudOrders(orgId, {
          dayKey: dayKey(new Date()),
          statuses: ["placed", "preparing", "ready", "completed"],
          limit: 100,
        }),
        loadMenuResilient(orgId),
      ]);
      setOrders(o.filter((x) => x.status !== "canceled"));
      setMenu(m);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    }
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const sorted = useMemo(
    () =>
      [...orders].sort((a, b) => {
        const ar = a.cancel_requested ? 0 : 1;
        const br = b.cancel_requested ? 0 : 1;
        if (ar !== br) return ar - br;
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }),
    [orders],
  );

  async function cancel(order: CloudSaleOrder) {
    if (
      !window.confirm(
        `Confirm cancel ${order.receipt_number}? Stock will be restored. This is the final cancel.`,
      )
    ) {
      return;
    }
    setBusyId(order.id);
    try {
      const menuById = new Map(menu.map((m) => [m.id, m]));
      await cancelCloudSale({
        orgId,
        orderId: order.id,
        canceledBy: tenant!.profile.full_name,
        menuById,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-coral/25 bg-coral/5 px-4 py-3 text-sm text-ink">
        Owner confirms cancellation. Requests from cashiers are listed first.
      </div>
      {error ? (
        <p className="rounded-xl bg-coral/15 px-3 py-2 text-sm text-coral">{error}</p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((order) => (
          <li
            key={order.id}
            className={`flex flex-col rounded-2xl border bg-white/80 p-3 ${
              order.cancel_requested
                ? "border-coral/45 ring-1 ring-coral/25"
                : "border-ink/8"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {order.receipt_number}
                </p>
                <p className="text-[11px] text-ink/45">
                  {new Date(order.created_at).toLocaleTimeString()}
                  {order.place_label ? ` · ${order.place_label}` : ""}
                </p>
              </div>
              <StatusPill status={order.status} />
            </div>
            {order.cancel_requested ? (
              <p className="mt-1 text-[11px] font-medium text-coral">
                Requested by {order.cancel_requested_by || "staff"}
              </p>
            ) : null}
            <p className="mt-2 line-clamp-2 text-xs text-ink/70">
              {(order.sale_order_lines || order.lines || [])
                .map((l) => `${l.quantity}× ${l.name}`)
                .join(", ")}
            </p>
            <p className="mt-1 text-sm font-semibold">
              {formatMoney(Number(order.total))}
            </p>
            <button
              type="button"
              disabled={busyId === order.id}
              onClick={() => void cancel(order)}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-coral px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              <Ban className="h-3.5 w-3.5" />
              {order.cancel_requested ? "Confirm cancel" : "Cancel order"}
            </button>
          </li>
        ))}
      </ul>
      {sorted.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-ink/15 py-12 text-center text-sm text-ink/45">
          No cancellable orders today.
        </p>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: SaleOrderStatus }) {
  return (
    <span className="shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] text-ink/60">
      {SALE_ORDER_STATUS_LABELS[status]}
    </span>
  );
}
