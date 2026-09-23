"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Minus, Plus, Printer, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  listMenu,
  seedOrgCatalog,
  type CloudMenuItem,
} from "@/lib/cloud-catalog";
import {
  completeCloudSale,
  type CloudSaleOrder,
} from "@/lib/cloud-sales";
import type { MenuCategory, PaymentMethod } from "@/lib/tenant";
import { MENU_CATEGORIES } from "@/lib/menu-categories";
import { cn, formatMoney } from "@/lib/utils";
import { ThermalReceipt } from "@/components/order/ThermalReceipt";

type CartLine = { menuItem: CloudMenuItem; quantity: number };

export function OrderPOS() {
  const { tenant } = useAuth();
  const orgId = tenant!.organization.id;
  const [menu, setMenu] = useState<CloudMenuItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState<MenuCategory | "all">("all");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<CloudSaleOrder | null>(null);

  const reload = useCallback(async () => {
    await seedOrgCatalog(orgId);
    setMenu(await listMenu(orgId));
  }, [orgId]);

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load menu"),
    );
  }, [reload]);

  const available = menu.filter((m) => m.available);
  const filtered =
    category === "all"
      ? available
      : available.filter((m) => m.category === category);
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
    try {
      const order = await completeCloudSale({
        orgId,
        lines: cart,
        paymentMethod,
        paymentReference,
        cashierName: tenant.profile.full_name,
      });
      setLastSale(order);
      setCart([]);
      setPaymentReference("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sale failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!lastSale) return;
    const t = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(t);
  }, [lastSale]);

  if (lastSale && tenant) {
    return (
      <ThermalReceipt
        order={lastSale}
        businessName={tenant.organization.name}
        phone={tenant.organization.phone}
        address={tenant.organization.address}
        onDone={() => setLastSale(null)}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <section className="rounded-3xl border border-ink/8 bg-white/80 p-3 sm:p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <Chip active={category === "all"} onClick={() => setCategory("all")} label="All" />
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
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => addItem(item)}
              className="rounded-2xl border border-ink/8 bg-stone/60 p-3 text-left transition hover:border-teal/40 hover:bg-teal/5 active:scale-[0.98]"
            >
              <p className="font-medium leading-snug">{item.name}</p>
              {item.description ? (
                <p className="mt-1 line-clamp-2 text-[11px] text-ink/50">
                  {item.description}
                </p>
              ) : null}
              <p className="mt-1 text-sm text-teal">{formatMoney(item.price)}</p>
              <p className="mt-2 text-[11px] text-ink/45">{item.vote_count} sold</p>
            </button>
          ))}
          {filtered.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm text-ink/50">
              No menu items yet. Add some under Menu.
            </p>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col rounded-3xl border border-ink/8 bg-ink p-4 text-stone shadow-lg sm:p-5">
        <h2 className="font-display text-xl text-gold">Current order</h2>
        <ul className="mt-4 max-h-[40vh] flex-1 space-y-3 overflow-auto lg:max-h-none">
          {cart.map((line) => (
            <li
              key={line.menuItem.id}
              className="flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{line.menuItem.name}</p>
                <p className="text-xs text-stone/60">
                  {formatMoney(line.menuItem.price)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className="rounded-lg bg-white/10 p-1" onClick={() => setQty(line.menuItem.id, line.quantity - 1)}>
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center text-sm">{line.quantity}</span>
                <button type="button" className="rounded-lg bg-white/10 p-1" onClick={() => setQty(line.menuItem.id, line.quantity + 1)}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button type="button" className="ml-1 rounded-lg p-1 text-coral" onClick={() => setQty(line.menuItem.id, 0)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
          {cart.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone/50">
              Tap items to build the order
            </p>
          ) : null}
        </ul>

        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-stone/70">Subtotal</span>
            <span>{formatMoney(subtotal)}</span>
          </div>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className="w-full rounded-xl border border-white/15 bg-ink px-3 py-2.5 text-sm outline-none"
          >
            <option value="cash">Cash</option>
            <option value="cbe">CBE</option>
            <option value="telebirr">Telebirr</option>
            <option value="other">Other</option>
          </select>
          {paymentMethod !== "cash" ? (
            <input
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="Reference / transaction ID"
              className="w-full rounded-xl border border-white/15 bg-ink px-3 py-2.5 text-sm outline-none"
            />
          ) : null}
          {error ? (
            <p className="rounded-xl bg-coral/20 px-3 py-2 text-sm text-coral">{error}</p>
          ) : null}
          <button
            type="button"
            disabled={busy || cart.length === 0}
            onClick={() => void checkout()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            {busy ? "Saving…" : "Charge & print receipt"}
          </button>
        </div>
      </section>
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
