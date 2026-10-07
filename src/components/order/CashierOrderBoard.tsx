"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Banknote,
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Plus,
  Printer,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ThermalReceipt } from "@/components/order/ThermalReceipt";
import {
  attachOrderPaymentProof,
  isOrderPaid,
  lineRound,
  listCloudOrders,
  markOrderPaid,
  orderLines,
  requestCancelOrder,
  updateOrderStatus,
  type CloudSaleOrder,
} from "@/lib/cloud-sales";
import { formatBytes, IMAGE_SOURCE_MAX_BYTES } from "@/lib/menu-image";
import {
  DEFAULT_PAYMENT_METHODS,
  enabledPaymentMethods,
  getOrgPaymentMethods,
  type OrgPaymentMethod,
} from "@/lib/org-payment-methods";
import { canCashierOrderOps, isOwner } from "@/lib/permissions";
import { uploadSalePaymentProof } from "@/lib/sale-payment-proof";
import {
  SALE_ORDER_STATUS_LABELS,
  SALE_PAYMENT_STATUS_LABELS,
  type SaleOrderStatus,
  type SalePaymentStatus,
} from "@/lib/tenant";
import { cn, dayKey, formatDateTime, formatMoney } from "@/lib/utils";

type FilterMode = "open" | "paid" | "today" | "completed" | "all";

export function CashierOrderBoard({
  onAddItems,
}: {
  /** Jump back to Place order and add dishes onto this receipt. */
  onAddItems?: (order: CloudSaleOrder) => void;
}) {
  const { tenant } = useAuth();
  const orgId = tenant!.organization.id;
  const owner = isOwner(tenant!.membership);
  const cashierOps = canCashierOrderOps(tenant!.membership);
  const waiterView = !cashierOps;
  const [orders, setOrders] = useState<CloudSaleOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>(owner ? "today" : "open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [printOrder, setPrintOrder] = useState<CloudSaleOrder | null>(null);
  const [payDraft, setPayDraft] = useState<{
    orderId: string;
    method: string;
    reference: string;
  } | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [payMethods, setPayMethods] = useState<OrgPaymentMethod[]>(
    enabledPaymentMethods(DEFAULT_PAYMENT_METHODS),
  );

  useEffect(() => {
    void getOrgPaymentMethods(orgId)
      .then((m) => setPayMethods(enabledPaymentMethods(m)))
      .catch(() => undefined);
  }, [orgId]);

  const reload = useCallback(async () => {
    try {
      const o = await listCloudOrders(orgId, {
        dayKey: filter === "all" ? undefined : dayKey(new Date()),
        statuses:
          filter === "completed"
            ? ["completed"]
            : filter === "open" && !waiterView
              ? ["placed", "preparing", "ready"]
              : undefined,
        limit: owner && filter === "all" ? 250 : 120,
      });
      let list: CloudSaleOrder[];
      if (filter === "completed") {
        list = o.filter((order) => order.status === "completed");
      } else if (filter === "all") {
        list = o;
      } else {
        list = o.filter(
          (order) =>
            order.status !== "completed" &&
            (order.status !== "canceled" || (owner && !waiterView)),
        );
        if (waiterView) {
          list = list.filter((order) =>
            filter === "paid" ? isOrderPaid(order) : !isOrderPaid(order),
          );
        }
      }
      setOrders(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    }
  }, [orgId, filter, owner, waiterView]);

  useEffect(() => {
    void reload();
    const t = window.setInterval(() => void reload(), 10_000);
    return () => window.clearInterval(t);
  }, [reload]);

  useEffect(() => {
    if (!orders.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) =>
      prev && orders.some((o) => o.id === prev) ? prev : orders[0].id,
    );
  }, [orders]);

  useEffect(() => {
    if (!printOrder) return;
    const t = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(t);
  }, [printOrder]);

  useEffect(() => {
    // Clear proof when switching tickets
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofFile(null);
    setProofPreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on selection change
  }, [selectedId]);

  const selected = useMemo(
    () => orders.find((o) => o.id === selectedId) ?? null,
    [orders, selectedId],
  );

  function clearProof() {
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofFile(null);
    setProofPreview(null);
  }

  function onProofPicked(file: File | null) {
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    if (!file) {
      setProofFile(null);
      setProofPreview(null);
      return;
    }
    if (file.size > IMAGE_SOURCE_MAX_BYTES) {
      setError(
        `Proof image too large (${formatBytes(file.size)}). Max ${formatBytes(IMAGE_SOURCE_MAX_BYTES)}.`,
      );
      return;
    }
    setError(null);
    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
  }

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

  /** Waiter sends a payment photo. The ticket stays unpaid until a cashier verifies it. */
  async function sendPaymentPhoto(order: CloudSaleOrder, file: File) {
    if (file.size > IMAGE_SOURCE_MAX_BYTES) {
      setError(
        `Proof image too large (${formatBytes(file.size)}). Max ${formatBytes(IMAGE_SOURCE_MAX_BYTES)}.`,
      );
      return;
    }
    setBusyId(order.id);
    setError(null);
    try {
      const paymentProofUrl = await uploadSalePaymentProof(orgId, file);
      await attachOrderPaymentProof({
        orgId,
        orderId: order.id,
        paymentProofUrl,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the photo");
    } finally {
      setBusyId(null);
    }
  }

  /** Accept payment only — does not print. */
  async function acceptPayment(order: CloudSaleOrder) {
    if (!tenant) return;
    const draft =
      payDraft?.orderId === order.id
        ? payDraft
        : {
            orderId: order.id,
            method: order.payment_method || "cash",
            reference: order.payment_reference || "",
          };
    setBusyId(order.id);
    setError(null);
    try {
      let paymentProofUrl: string | null = order.payment_proof_url || null;
      if (draft.method !== "cash" && proofFile) {
        paymentProofUrl = await uploadSalePaymentProof(orgId, proofFile);
      }
      await markOrderPaid({
        orgId,
        orderId: order.id,
        paidBy: tenant.profile.full_name,
        paymentMethod: draft.method,
        paymentReference: draft.reference,
        paymentProofUrl,
      });
      setPayDraft(null);
      clearProof();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusyId(null);
    }
  }

  async function requestCancel(order: CloudSaleOrder) {
    if (!canRequestCancel(order)) {
      setError("Paid or completed orders cannot be canceled.");
      return;
    }
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

  /** Print only — requires paid. */
  function startPrint(order: CloudSaleOrder) {
    if (!isOrderPaid(order)) {
      setError("Mark as paid first, then print the receipt.");
      return;
    }
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

  const filters: { id: FilterMode; label: string }[] = waiterView
    ? [
        { id: "open", label: "Open" },
        { id: "paid", label: "Paid" },
        { id: "completed", label: "Completed" },
      ]
    : owner
      ? [
          { id: "open", label: "Open" },
          { id: "today", label: "All today" },
          { id: "completed", label: "Completed" },
          { id: "all", label: "All orders" },
        ]
      : [
          { id: "open", label: "Open" },
          { id: "today", label: "All today" },
          { id: "completed", label: "Completed" },
        ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/60">
          {waiterView
            ? "Add dishes on open tickets. Photograph the payment so the cashier can mark it paid."
            : owner
              ? "Check the payment photo, then mark paid and print."
              : "Check the payment photo, then mark paid and print."}
        </p>
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                filter === f.id ? "bg-teal text-white" : "bg-ink/5 text-ink/70",
              )}
            >
              {f.label}
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
        <p className="rounded-xl bg-coral/15 px-3 py-2 text-sm text-coral">
          {error}
        </p>
      ) : null}

      {orders.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-ink/15 py-12 text-center text-sm text-ink/45">
          No orders in this view yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_minmax(280px,380px)] lg:items-start lg:gap-4">
          <div className="order-1 lg:order-2 lg:sticky lg:top-20">
            {selected ? (
              <OrderDetailPanel
                order={selected}
                busy={busyId === selected.id}
                cashierOps={cashierOps}
                owner={owner}
                onAddItems={onAddItems}
                payMethods={payMethods}
                payDraft={
                  payDraft?.orderId === selected.id ? payDraft : null
                }
                proofPreview={proofPreview}
                onPayDraftChange={(method, reference) => {
                  setPayDraft({
                    orderId: selected.id,
                    method,
                    reference,
                  });
                  if (method === "cash") clearProof();
                }}
                onProofPicked={onProofPicked}
                onClearProof={clearProof}
                onMarkPaid={() => void acceptPayment(selected)}
                onPrint={() => startPrint(selected)}
                onComplete={() => void markCompleted(selected)}
                onCancel={() => void requestCancel(selected)}
                onSendPhoto={(file) => void sendPaymentPhoto(selected, file)}
              />
            ) : null}
          </div>

          <ul className="order-2 max-h-[55vh] space-y-2 overflow-y-auto overscroll-contain lg:order-1 lg:max-h-[calc(100vh-11rem)]">
            {orders.map((order) => {
              const lines = orderLines(order);
              const qty = lines.reduce((sum, line) => sum + Number(line.quantity), 0);
              const sends = new Set(lines.map((line) => lineRound(line))).size;
              const active = order.id === selectedId;
              const paid = isOrderPaid(order);
              return (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(order.id)}
                    className={cn(
                      "flex w-full flex-col rounded-2xl border bg-white/80 p-3 text-left transition",
                      active
                        ? "border-teal ring-2 ring-teal/25"
                        : order.cancel_requested
                          ? "border-coral/35"
                          : "border-ink/8 hover:border-ink/20",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {order.receipt_number}
                          {order.place_label ? (
                            <span className="text-ink/45">
                              {" "}
                              · {order.place_label}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-[11px] text-ink/45">
                          {qty} items
                          {sends > 1 ? ` · ${sends} kitchen sends` : ""} ·{" "}
                          {formatDateTime(order.created_at)}
                          {order.payment_proof_url
                            ? paid
                              ? " · photo"
                              : cashierOps
                                ? " · photo to check"
                                : " · photo sent"
                            : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StatusPill status={order.status} />
                        {cashierOps ? (
                          <PaymentPill status={paid ? "paid" : "unpaid"} />
                        ) : null}
                      </div>
                    </div>
                    {cashierOps ? (
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-ink/50">
                          {paid
                            ? `${order.payment_method.toUpperCase()}${
                                order.payment_reference
                                  ? ` · ${order.payment_reference}`
                                  : ""
                              }`
                            : "Awaiting payment"}
                        </span>
                        <span className="font-semibold text-teal">
                          {formatMoney(Number(order.total))}
                        </span>
                      </div>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function OrderDetailPanel({
  order,
  busy,
  cashierOps,
  owner,
  payMethods,
  payDraft,
  proofPreview,
  onPayDraftChange,
  onProofPicked,
  onClearProof,
  onMarkPaid,
  onPrint,
  onComplete,
  onCancel,
  onAddItems,
  onSendPhoto,
}: {
  order: CloudSaleOrder;
  busy: boolean;
  cashierOps: boolean;
  owner: boolean;
  payMethods: OrgPaymentMethod[];
  payDraft: { method: string; reference: string } | null;
  proofPreview: string | null;
  onPayDraftChange: (method: string, reference: string) => void;
  onProofPicked: (file: File | null) => void;
  onClearProof: () => void;
  onMarkPaid: () => void;
  onPrint: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onAddItems?: (order: CloudSaleOrder) => void;
  onSendPhoto?: (file: File) => void;
}) {
  const lines = orderLines(order);
  const grouped = new Map<number, typeof lines>();
  for (const line of lines) {
    const round = lineRound(line);
    grouped.set(round, [...(grouped.get(round) || []), line]);
  }
  const groups = [...grouped.entries()].sort((a, b) => a[0] - b[0]);
  const paid = isOrderPaid(order);
  const showProof = Boolean(order.payment_proof_url);
  const methodOptions =
    payMethods.length > 0
      ? payMethods
      : enabledPaymentMethods(DEFAULT_PAYMENT_METHODS);
  const method = payDraft?.method ?? order.payment_method ?? "cash";
  const safeMethod = methodOptions.some((m) => m.id === method)
    ? method
    : methodOptions[0]?.id ?? "cash";
  const reference = payDraft?.reference ?? order.payment_reference ?? "";
  const paidLabel =
    methodOptions.find((m) => m.id === order.payment_method)?.label ??
    order.payment_method;

  return (
    <section
      className={cn(
        "rounded-3xl border bg-white/95 p-4 shadow-sm sm:p-5",
        order.cancel_requested
          ? "border-coral/40 ring-1 ring-coral/20"
          : "border-ink/8",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-xl">{order.receipt_number}</p>
          <p className="mt-0.5 text-xs text-ink/50">
            {formatDateTime(order.created_at)}
            {order.place_label ? ` · ${order.place_label}` : ""}
            {order.source === "online" ? " · Website" : ""}
          </p>
          {order.source === "online" || order.guest_phone ? (
            <p className="mt-0.5 text-xs text-ink/55">
              Guest: {order.guest_name || order.cashier_name}
              {order.guest_phone ? ` · ${order.guest_phone}` : ""}
            </p>
          ) : cashierOps ? (
            <p className="mt-0.5 text-xs text-ink/45">
              {order.cashier_name}
              {paid
                ? ` · ${paidLabel}${
                    order.payment_reference
                      ? ` · ${order.payment_reference}`
                      : ""
                  }`
                : " · unpaid"}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusPill status={order.status} />
          {cashierOps ? (
            <PaymentPill status={paid ? "paid" : "unpaid"} />
          ) : null}
        </div>
      </div>

      {order.cancel_requested ? (
        <p className="mt-2 text-xs font-medium text-coral">
          Cancel requested
          {order.cancel_requested_by
            ? ` by ${order.cancel_requested_by}`
            : ""}
        </p>
      ) : null}

      {order.guest_note ? (
        <p className="mt-2 rounded-xl bg-stone/50 px-2.5 py-1.5 text-xs text-ink/65">
          Guest note: {order.guest_note}
        </p>
      ) : null}

      {order.kitchen_note ? (
        <p className="mt-2 rounded-xl bg-stone/50 px-2.5 py-1.5 text-xs text-ink/65">
          Kitchen: {order.kitchen_note}
        </p>
      ) : null}

      {showProof ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/45">
            {cashierOps && !paid
              ? "Payment photo to verify"
              : "Payment photo"}
          </p>
          <a
            href={order.payment_proof_url!}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-xl border border-ink/10 bg-stone/40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={order.payment_proof_url!}
              alt="Payment proof"
              className="max-h-48 w-full object-contain"
            />
          </a>
          <a
            href={order.payment_proof_url!}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-teal"
          >
            Open full size <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      ) : null}

      <div className="mt-3 max-h-48 space-y-2 overflow-auto text-sm lg:max-h-64">
        {groups.map(([round, group]) => (
          <div key={round}>
            {groups.length > 1 ? (
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink/45">
                {round === 1 ? "First order" : `Added send ${round}`}
              </p>
            ) : null}
            <ul className="space-y-1">
              {group.map((line, i) => (
                <li key={`${round}-${i}`} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {line.quantity}× {line.name}
                  </span>
                  {cashierOps ? (
                    <span className="shrink-0 tabular-nums text-ink/70">
                      {formatMoney(Number(line.line_total))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {!cashierOps && !paid && order.status !== "canceled" && onSendPhoto ? (
        <div className="mt-3 space-y-2 rounded-2xl border border-gold/30 bg-gold/10 p-3">
          <p className="text-xs font-semibold text-ink/70">
            {order.payment_proof_url
              ? "Photo sent. The cashier marks this paid after checking it."
              : "Photograph the payment. The cashier will see it and mark the receipt paid."}
          </p>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-ink/20 bg-white px-3 py-2.5 text-xs font-medium text-ink/70">
            <ImagePlus className="h-3.5 w-3.5" />
            {busy
              ? "Sending photo…"
              : order.payment_proof_url
                ? "Replace payment photo"
                : "Take payment photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onSendPhoto(file);
              }}
            />
          </label>
        </div>
      ) : null}

      {onAddItems &&
      order.status !== "canceled" &&
      order.status !== "completed" &&
      (cashierOps || !paid) ? (
        <button
          type="button"
          onClick={() => onAddItems(order)}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-teal/30 bg-teal/10 px-3 py-2.5 text-xs font-semibold text-teal"
        >
          <Plus className="h-3.5 w-3.5" />
          Add more to this receipt
        </button>
      ) : null}

      {cashierOps ? (
      <>
      <div className="mt-3 space-y-1 border-t border-ink/8 pt-3 text-sm">
        <div className="flex justify-between text-ink/60">
          <span>Subtotal</span>
          <span>{formatMoney(Number(order.subtotal))}</span>
        </div>
        <div className="flex justify-between text-ink/60">
          <span>Service</span>
          <span>{formatMoney(Number(order.service_charge))}</span>
        </div>
        <div className="flex justify-between text-ink/60">
          <span>VAT</span>
          <span>{formatMoney(Number(order.vat))}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span className="text-teal">{formatMoney(Number(order.total))}</span>
        </div>
      </div>

      {cashierOps && !paid && order.status !== "canceled" ? (
        <div className="mt-4 space-y-2 rounded-2xl border border-gold/30 bg-gold/10 p-3">
          <p className="text-xs font-semibold text-ink/70">
            {order.payment_proof_url
              ? "Photo is above. Mark paid after you verify it."
              : "Mark as paid"}
          </p>
          <select
            value={safeMethod}
            onChange={(e) =>
              onPayDraftChange(e.target.value, reference)
            }
            className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none"
          >
            {methodOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          {safeMethod !== "cash" ? (
            <>
              <input
                value={reference}
                onChange={(e) => onPayDraftChange(safeMethod, e.target.value)}
                placeholder="Reference / transaction ID"
                className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none"
              />
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-ink/20 bg-white px-3 py-2.5 text-xs font-medium text-ink/70">
                <ImagePlus className="h-3.5 w-3.5" />
                {proofPreview ? "Change proof photo" : "Attach payment screenshot"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) =>
                    onProofPicked(e.target.files?.[0] ?? null)
                  }
                />
              </label>
              {proofPreview ? (
                <div className="relative overflow-hidden rounded-xl border border-ink/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proofPreview}
                    alt="Payment proof preview"
                    className="max-h-32 w-full object-contain bg-stone/40"
                  />
                  <button
                    type="button"
                    onClick={onClearProof}
                    className="absolute right-2 top-2 rounded-full bg-ink/80 p-1 text-stone"
                    aria-label="Remove proof"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onMarkPaid}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-teal px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Banknote className="h-3.5 w-3.5" />
            Mark as paid
          </button>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {cashierOps && paid ? (
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink px-3 py-2.5 text-xs font-semibold text-stone"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
        ) : null}
        {order.status !== "completed" && order.status !== "canceled" ? (
          <button
            type="button"
            disabled={busy}
            onClick={onComplete}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal/90 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Complete
          </button>
        ) : null}
        {cashierOps && canRequestCancel(order) ? (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-coral/35 px-3 py-2 text-xs font-semibold text-coral disabled:opacity-50"
          >
            <Ban className="h-3.5 w-3.5" />
            Request cancel
          </button>
        ) : null}
      </div>
      </>
      ) : null}
    </section>
  );
}

function canRequestCancel(order: CloudSaleOrder): boolean {
  return (
    !isOrderPaid(order) &&
    !order.cancel_requested &&
    order.status !== "completed" &&
    order.status !== "canceled"
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

function PaymentPill({ status }: { status: SalePaymentStatus }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
        status === "paid"
          ? "bg-teal/15 text-teal"
          : "bg-coral/15 text-coral",
      )}
    >
      {SALE_PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}
