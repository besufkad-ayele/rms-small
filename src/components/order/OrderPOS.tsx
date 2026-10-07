"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Minus, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { useOfflineSync } from "@/components/offline/OfflineSyncProvider";
import { type CloudMenuItem } from "@/lib/cloud-catalog";
import {
  appendOrderItems,
  listOpenOrders,
  orderLines,
  type CloudSaleOrder,
} from "@/lib/cloud-sales";
import {
  completeSaleResilient,
  loadMenuResilient,
} from "@/lib/offline/resilient";
import { canCashierOrderOps } from "@/lib/permissions";
import { subscribeOrgOrderChanges } from "@/lib/realtime-orders";
import type { MenuCategory } from "@/lib/tenant";
import { MENU_CATEGORIES } from "@/lib/menu-categories";
import { parseMenuDescription } from "@/lib/menu-details";
import { sortMenuByTags, tagLabel } from "@/lib/menu-tags";
import { cn, formatMoney } from "@/lib/utils";

type CartLine = { menuItem: CloudMenuItem; quantity: number };

export function OrderPOS({
  onPlaced,
  appendTo = null,
  onClearAppend,
}: {
  onPlaced?: () => void;
  /** Existing receipt to add dishes onto. Opens from Placed orders. */
  appendTo?: CloudSaleOrder | null;
  onClearAppend?: () => void;
}) {
  const { tenant } = useAuth();
  const { t } = useI18n();
  const { refreshPendingCount } = useOfflineSync();
  const orgId = tenant!.organization.id;
  const cashierOps = tenant ? canCashierOrderOps(tenant.membership) : false;
  const [menu, setMenu] = useState<CloudMenuItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState<MenuCategory | "all">("all");
  const [placeLabel, setPlaceLabel] = useState("");
  const [kitchenNote, setKitchenNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedNote, setQueuedNote] = useState<string | null>(null);
  const [placedNote, setPlacedNote] = useState<string | null>(null);
  const [openOrders, setOpenOrders] = useState<CloudSaleOrder[]>([]);

  const reload = useCallback(async () => {
    setMenu(await loadMenuResilient(orgId, setMenu));
  }, [orgId]);

  const reloadOpen = useCallback(async () => {
    try {
      setOpenOrders(await listOpenOrders(orgId));
    } catch {
      setOpenOrders([]);
    }
  }, [orgId]);

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load menu"),
    );
  }, [reload]);

  const openInFlight = useRef(false);
  useEffect(() => {
    if (!orgId) return;
    let stopped = false;
    const tick = () => {
      if (stopped || openInFlight.current) return;
      openInFlight.current = true;
      void reloadOpen().finally(() => {
        openInFlight.current = false;
      });
    };
    const unsub = subscribeOrgOrderChanges(orgId, tick);
    return () => {
      stopped = true;
      unsub();
    };
  }, [orgId, reloadOpen]);

  useEffect(() => {
    setCart([]);
    setKitchenNote("");
    setPlaceLabel(appendTo?.place_label || "");
  }, [appendTo]);

  const matchingOrder = useMemo(() => {
    if (appendTo) return appendTo;
    const place = placeLabel.trim().toLowerCase();
    if (!place) return null;
    return (
      openOrders.find(
        (order) => (order.place_label || "").trim().toLowerCase() === place,
      ) ?? null
    );
  }, [appendTo, openOrders, placeLabel]);

  const alreadyOnReceipt = useMemo(
    () => (appendTo ? orderLines(appendTo) : []),
    [appendTo],
  );

  const available = menu.filter((m) => m.available);
  const filtered = useMemo(() => {
    const list =
      category === "all"
        ? available
        : available.filter((m) => m.category === category);
    return sortMenuByTags(list);
  }, [available, category]);
  const subtotal = useMemo(
    () => cart.reduce((s, c) => s + c.menuItem.price * c.quantity, 0),
    [cart],
  );

  function addItem(item: CloudMenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItem.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menuItem.id === item.id
            ? { ...c, quantity: c.quantity + 1 }
            : c,
        );
      }
      return [...prev, { menuItem: item, quantity: 1 }];
    });
  }

  function setQty(id: string, quantity: number) {
    setCart((prev) =>
      prev
        .map((c) => (c.menuItem.id === id ? { ...c, quantity } : c))
        .filter((c) => c.quantity > 0),
    );
  }

  async function checkout() {
    if (!tenant || cart.length === 0) return;
    setBusy(true);
    setError(null);
    setQueuedNote(null);
    setPlacedNote(null);
    try {
      if (matchingOrder) {
        const result = await appendOrderItems({
          orgId,
          orderId: matchingOrder.id,
          lines: cart,
          kitchenNote,
        });
        setCart([]);
        setKitchenNote("");
        const count = cart.reduce((sum, line) => sum + line.quantity, 0);
        setPlacedNote(
          `Added ${count} item${count === 1 ? "" : "s"} to ${result.order.receipt_number}${result.order.place_label ? ` · ${result.order.place_label}` : ""}. Same receipt, new kitchen send.${
            cashierOps
              ? ` Bill is now ${formatMoney(Number(result.order.total))}.${result.reopenedPayment ? " Mark paid again for the new total." : ""}`
              : ""
          }`,
        );
        await reloadOpen();
        await reload();
        window.setTimeout(() => onPlaced?.(), 600);
        return;
      }
      const { order, offlineQueued } = await completeSaleResilient({
        orgId,
        lines: cart,
        paymentMethod: "cash",
        cashierName: tenant.profile.full_name,
        placeLabel,
        kitchenNote,
        // Place only — unpaid until cashier marks paid on Placed orders.
        markPaid: false,
      });
      setCart([]);
      setPlaceLabel("");
      setKitchenNote("");
      if (offlineQueued) {
        setQueuedNote(
          "Saved on this device. Will sync when the connection is fast enough.",
        );
        await refreshPendingCount();
      }
      setPlacedNote(
        cashierOps
          ? `${order.receipt_number} placed (unpaid)${order.place_label ? ` · ${order.place_label}` : ""}. Mark paid under Placed orders, then print.`
          : `${order.receipt_number} placed${order.place_label ? ` · ${order.place_label}` : ""}. It stays on your open list until the cashier marks it paid.`,
      );
      await reloadOpen();
      await reload();
      window.setTimeout(() => onPlaced?.(), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sale failed");
    } finally {
      setBusy(false);
    }
  }

  const cartPanel = (
    <section className="flex max-h-[min(52vh,26rem)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-shell p-4 text-shell-fg shadow-lg sm:p-5 lg:max-h-[calc(100vh-7rem)]">
      <h2 className="shrink-0 font-display text-xl text-gold">
        {appendTo ? appendTo.receipt_number : "Current order"}
      </h2>
      {appendTo ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-gold/15 px-3 py-2 text-xs text-shell-fg">
          <p>
            Adding onto this receipt
            {appendTo.place_label ? ` · ${appendTo.place_label}` : ""}. Same
            bill, new kitchen send.
          </p>
          <button
            type="button"
            onClick={onClearAppend}
            className="shrink-0 font-semibold text-gold"
          >
            New receipt
          </button>
        </div>
      ) : null}
      <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
        {alreadyOnReceipt.map((line, index) => (
          <li
            key={`on-bill-${line.id || index}`}
            className="flex items-center justify-between gap-2 rounded-2xl bg-white/5 px-3 py-2 text-sm text-shell-fg/70"
          >
            <span className="min-w-0 truncate">
              {line.quantity}× {line.name}
            </span>
            <span className="shrink-0 text-[11px] uppercase tracking-wide">
              On bill
            </span>
          </li>
        ))}
        {cart.length > 0 && alreadyOnReceipt.length > 0 ? (
          <li className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gold">
            Adding now
          </li>
        ) : null}
        {cart.map((line) => (
          <li
            key={line.menuItem.id}
            className="flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2"
          >
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white/10">
              {line.menuItem.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={line.menuItem.image_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{line.menuItem.name}</p>
              <p className="text-xs text-shell-fg/60">
                {formatMoney(line.menuItem.price)}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-lg bg-white/10 p-1"
                onClick={() => setQty(line.menuItem.id, line.quantity - 1)}
              >
                    <Minus className="h-3.5 w-3.5" aria-hidden />
              </button>
              <span className="w-6 text-center text-sm">{line.quantity}</span>
              <button
                type="button"
                className="rounded-lg bg-white/10 p-1"
                onClick={() => setQty(line.menuItem.id, line.quantity + 1)}
              >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                className="ml-1 rounded-lg p-1 text-coral"
                onClick={() => setQty(line.menuItem.id, 0)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
        {cart.length === 0 && alreadyOnReceipt.length === 0 ? (
          <p className="py-4 text-center text-sm text-shell-fg/50 lg:py-8">
            Tap a dish to add it
          </p>
        ) : null}
      </ul>

      <div className="mt-3 shrink-0 space-y-2.5 border-t border-white/10 pt-3 sm:space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-shell-fg/70">Subtotal</span>
          <span>{formatMoney(subtotal)}</span>
        </div>
        <input
          value={appendTo ? appendTo.place_label || "" : placeLabel}
          onChange={(e) => setPlaceLabel(e.target.value)}
          readOnly={Boolean(appendTo)}
          placeholder="Table / place (e.g. T3, Patio)"
          className="w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-sm text-shell-fg outline-none placeholder:text-shell-fg/40 read-only:opacity-80"
        />
        <input
          value={kitchenNote}
          onChange={(e) => setKitchenNote(e.target.value)}
          placeholder="Kitchen note (optional)"
          className="w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-sm text-shell-fg outline-none placeholder:text-shell-fg/40"
        />
        <p className="text-[11px] text-shell-fg/50">
          {matchingOrder
            ? `Adds onto ${matchingOrder.receipt_number}. One bill, a new kitchen send.`
            : "Same table later? Use the same place name to add onto that bill."}
        </p>
        {error ? (
          <p className="rounded-xl bg-coral/20 px-3 py-2 text-sm text-coral">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy || cart.length === 0}
          onClick={() => void checkout()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          <CheckCircle2 className="h-4 w-4" />
          {busy
            ? "Sending…"
            : matchingOrder
              ? `Add to ${matchingOrder.receipt_number}`
              : "Place order"}
        </button>
      </div>
    </section>
  );

  const menuPanel = (
    <section className="rounded-3xl border border-ink/8 bg-white/80 p-3 sm:p-5">
      <div className="mb-4 flex flex-wrap gap-2">
        <Chip
          active={category === "all"}
          onClick={() => setCategory("all")}
          label="All"
        />
        {MENU_CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            active={category === c.id}
            onClick={() => setCategory(c.id)}
            label={c.label}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {filtered.map((item) => {
          const qty =
            cart.find((line) => line.menuItem.id === item.id)?.quantity ?? 0;
          return (
            <article
              key={item.id}
              role="button"
              tabIndex={0}
              aria-label={t("pos.addItem", { name: item.name })}
              onClick={() => addItem(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  addItem(item);
                }
              }}
              className={cn(
                "cursor-pointer rounded-2xl border bg-stone/60 p-3 text-left transition hover:border-teal/40 hover:bg-teal/5 active:scale-[0.98]",
                qty > 0 ? "border-teal bg-teal/5" : "border-ink/8",
              )}
            >
              <div className="mb-2 aspect-[4/3] w-full overflow-hidden rounded-xl bg-ink/5">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-ink/35">
                    No photo
                  </div>
                )}
              </div>
              <p className="font-medium leading-snug">{item.name}</p>
              {(item.tags || []).length > 0 ? (
                <p className="mt-1 flex flex-wrap gap-1">
                  {(item.tags || []).slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-ink/5 px-1.5 py-0.5 text-[10px] text-ink/55"
                    >
                      {tagLabel(t)}
                    </span>
                  ))}
                </p>
              ) : null}
              {parseMenuDescription(item.description).summary ? (
                <p className="mt-1 line-clamp-2 text-[11px] text-ink/50">
                  {parseMenuDescription(item.description).summary}
                </p>
              ) : null}
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-sm text-teal">{formatMoney(item.price)}</p>
                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    aria-label={t("pos.less", { name: item.name })}
                    disabled={qty === 0}
                    onClick={() => setQty(item.id, qty - 1)}
                    className="rounded-lg bg-ink/8 p-1.5 text-ink disabled:opacity-30"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <span className="w-5 text-center text-sm font-semibold tabular-nums">
                    {qty}
                  </span>
                  <button
                    type="button"
                    aria-label={t("pos.more", { name: item.name })}
                    onClick={() => addItem(item)}
                    className="rounded-lg bg-teal p-1.5 text-white"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {filtered.length === 0 ? (
          <p className="col-span-full py-10 text-center text-sm text-ink/50">
            No menu items yet. Add some under Menu.
          </p>
        ) : null}
      </div>
    </section>
  );

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1.4fr_1fr] lg:items-start">
      {queuedNote ? (
        <p className="order-first rounded-2xl border border-gold/40 bg-gold/15 px-4 py-3 text-sm text-ink lg:col-span-full">
          {queuedNote}
        </p>
      ) : null}
      {placedNote ? (
        <p className="order-first flex items-center gap-2 rounded-2xl border border-teal/30 bg-teal/10 px-4 py-3 text-sm text-ink lg:col-span-full">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-teal" />
          {placedNote}
        </p>
      ) : null}

      <div className="order-1 sticky top-[3.25rem] z-10 bg-stone/95 pb-2 backdrop-blur-md lg:order-2 lg:top-20 lg:self-start lg:bg-transparent lg:pb-0 lg:backdrop-blur-none">
        {cartPanel}
      </div>
      <div className="order-2 lg:order-1">{menuPanel}</div>
    </div>
  );
}

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium transition",
        active ? "bg-teal text-white" : "bg-ink/5 text-ink/70 hover:bg-ink/10",
      )}
    >
      {label}
    </button>
  );
}
