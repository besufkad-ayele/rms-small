"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, CheckCircle2, Printer } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ThermalReceipt } from "@/components/order/ThermalReceipt";
import {
  listCloudOrders,
  requestCancelOrder,
  updateOrderStatus,
  type CloudSaleOrder,
} from "@/lib/cloud-sales";
import { canCashierOrderOps } from "@/lib/permissions";
import {
  SALE_ORDER_STATUS_LABELS,
  type SaleOrderStatus,
} from "@/lib/tenant";
import { cn, dayKey, formatMoney } from "@/lib/utils";

export function CashierOrderBoard() {
  const { tenant } = useAuth();
  const orgId = tenant!.organization.id;
  const cashierOps = canCashierOrderOps(tenant!.membership);
  const [orders, setOrders] = useState<CloudSaleOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [printOrder, setPrintOrder] = useState<CloudSaleOrder | null>(null);

  const reload = useCallback(async () => {
    try {
      const o = await listCloudOrders(orgId, {
        dayKey: dayKey(new Date()),
        statuses:
          filter === "open"
            ? ["placed", "preparing", "ready"]
            : undefined,
        limit: 100,
      });
      setOrders(o.filter((x) => x.status !== "canceled"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    }
  }, [orgId, filter]);

  useEffect(() => {
    void reload();
    const t = window.setInterval(() => void reload(), 10_000);
    return () => window.clearInterval(t);
  }, [reload]);

  useEffect(() => {
    if (!printOrder) return;
    const t = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(t);
  }, [printOrder]);

  async function markCompleted(order: CloudSaleOrder) {
    setBusyId(order.id);
    try {
      await updateOrderStatus(orgId, order.id, "completed");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function requestCancel(order: CloudSaleOrder) {
    if (
      !window.confirm(
        `Request cancel for ${order.receipt_number}? The owner must confirm the real cancellation.`,
      )
    ) {
      return;
    }
    setBusyId(order.id);
    try {
      await requestCancelOrder({
        orgId,
        orderId: order.id,
        requestedBy: tenant!.profile.full_name,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusyId(null);
    }
  }

  function startPrint(order: CloudSaleOrder) {
    const lines = order.sale_order_lines || order.lines || [];
    setPrintOrder({ ...order, lines });
  }

  if (printOrder && tenant) {
    return (
      <ThermalReceipt
        order={printOrder}
        businessName={tenant.organization.name}
        phone={tenant.organization.phone}
        address={tenant.organization.address}
        orgId={orgId}
        onDone={() => setPrintOrder(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/60">
          {cashierOps
            ? "Placed orders — print or complete. Cancel request goes to the owner."
            : "Your open tickets — mark complete when served."}
        </p>
        <div className="flex gap-2">
          {(["open", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                filter === f ? "bg-teal text-white" : "bg-ink/5 text-ink/70",
              )}
            >
              {f === "open" ? "Open" : "All today"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-xl border border-ink/10 bg-white px-3 py-1.5 text-xs font-medium"
          >
            Refresh
          </button>
        </div>
      </div>
      {error ? (
        <p className="rounded-xl bg-coral/15 px-3 py-2 text-sm text-coral">{error}</p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {orders.map((order) => {
          const lines = order.sale_order_lines || order.lines || [];
          return (
            <li
              key={order.id}
              className={cn(
                "flex flex-col rounded-2xl border bg-white/80 p-3",
                order.cancel_requested
                  ? "border-coral/40 ring-1 ring-coral/20"
                  : "border-ink/8",
              )}
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
                  Cancel requested
                  {order.cancel_requested_by
                    ? ` by ${order.cancel_requested_by}`
                    : ""}
                </p>
              ) : null}
              <ul className="mt-2 max-h-20 space-y-0.5 overflow-auto text-xs text-ink/75">
                {lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">
                      {l.quantity}× {l.name}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatMoney(Number(l.line_total))}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 space-y-0.5 border-t border-ink/8 pt-2 text-[11px] text-ink/55">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatMoney(Number(order.subtotal))}</span>
                </div>
                <div className="flex justify-between">
                  <span>Service</span>
                  <span>{formatMoney(Number(order.service_charge))}</span>
                </div>
                <div className="flex justify-between">
                  <span>VAT</span>
                  <span>{formatMoney(Number(order.vat))}</span>
                </div>
                <div className="flex justify-between font-semibold text-ink">
                  <span>Total</span>
                  <span>{formatMoney(Number(order.total))}</span>
                </div>
              </div>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                {cashierOps ? (
                  <button
                    type="button"
                    onClick={() => startPrint(order)}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-ink px-2 py-1.5 text-[11px] font-semibold text-stone"
                  >
                    <Printer className="h-3 w-3" />
                    Print
                  </button>
                ) : null}
                {order.status !== "completed" ? (
                  <button
                    type="button"
                    disabled={busyId === order.id}
                    onClick={() => void markCompleted(order)}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-teal px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Complete
                  </button>
                ) : null}
                {cashierOps &&
                !order.cancel_requested &&
                order.status !== "completed" ? (
                  <button
                    type="button"
                    disabled={busyId === order.id}
                    onClick={() => void requestCancel(order)}
                    className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-coral/35 px-2 py-1.5 text-[11px] font-semibold text-coral disabled:opacity-50"
                  >
                    <Ban className="h-3 w-3" />
                    Request cancel
                  </button>
                ) : null}
              </div>            </li>
          );
        })}
      </ul>
      {orders.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-ink/15 py-12 text-center text-sm text-ink/45">
          No orders in this view yet.
        </p>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: SaleOrderStatus }) {
  const tone =
    status === "canceled"
      ? "bg-coral/15 text-coral"
      : status === "ready"
        ? "bg-teal/15 text-teal"
        : status === "completed"
          ? "bg-ink/10 text-ink/70"
          : "bg-gold/25 text-ink";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
        tone,
      )}
    >
      {SALE_ORDER_STATUS_LABELS[status]}
    </span>
  );
}
