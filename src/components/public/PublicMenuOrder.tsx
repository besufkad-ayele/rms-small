"use client";

import { useMemo, useState } from "react";
import { placePublicOrderAction, type PublicMenuItem, type PublicVenue } from "@/app/m/actions";
import { formatMoney } from "@/lib/utils";

export function PublicMenuOrder({
  venue,
  items,
}: {
  venue: PublicVenue;
  items: PublicMenuItem[];
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, PublicMenuItem[]>();
    for (const item of items) {
      const key = item.category || "other";
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [items]);

  const lines = items
    .map((item) => ({ item, quantity: cart[item.id] || 0 }))
    .filter((l) => l.quantity > 0);
  const total = lines.reduce((s, l) => s + l.item.price * l.quantity, 0);

  function add(id: string, delta: number) {
    setCart((prev) => {
      const next = { ...prev, [id]: Math.max(0, (prev[id] || 0) + delta) };
      if (next[id] === 0) delete next[id];
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await placePublicOrderAction({
      slug: venue.slug,
      guestName: name,
      guestPhone: phone,
      guestNote: note,
      lines: lines.map((l) => ({ menuItemId: l.item.id, quantity: l.quantity })),
    });
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setReceipt(res.receipt);
    setCart({});
  }

  if (receipt) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl bg-white p-6 text-center">
        <p className="font-display text-2xl">Order received</p>
        <p className="mt-2 text-sm text-ink/60">
          {venue.name} will prepare it. Show this number if they call you.
        </p>
        <p className="mt-4 font-mono text-xl font-semibold">{receipt}</p>
        <button
          type="button"
          className="mt-6 rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white"
          onClick={() => setReceipt(null)}
        >
          Order again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        {grouped.map(([cat, list]) => (
          <section key={cat} className="rounded-3xl bg-white p-4">
            <h2 className="font-display text-lg capitalize">{cat.replace(/-/g, " ")}</h2>
            <ul className="mt-3 divide-y divide-ink/8">
              {list.map((item) => (
                <li key={item.id} className="flex gap-3 py-3">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt=""
                      className="h-16 w-16 rounded-xl object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.name}</p>
                    {item.description ? (
                      <p className="text-xs text-ink/50">{item.description}</p>
                    ) : null}
                    <p className="mt-1 text-sm">{formatMoney(item.price)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="h-8 w-8 rounded-lg border border-ink/15"
                      onClick={() => add(item.id, -1)}
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-sm">
                      {cart[item.id] || 0}
                    </span>
                    <button
                      type="button"
                      className="h-8 w-8 rounded-lg bg-teal text-white"
                      onClick={() => add(item.id, 1)}
                    >
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {items.length === 0 ? (
          <p className="rounded-3xl bg-white p-8 text-center text-sm text-ink/50">
            Menu is empty right now.
          </p>
        ) : null}
      </div>

      <aside className="h-fit rounded-3xl bg-white p-4 lg:sticky lg:top-4">
        <h2 className="font-display text-lg">Your order</h2>
        {lines.length === 0 ? (
          <p className="mt-2 text-sm text-ink/50">Add items from the menu.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {lines.map((l) => (
              <li key={l.item.id} className="flex justify-between gap-2">
                <span>
                  {l.quantity} × {l.item.name}
                </span>
                <span>{formatMoney(l.item.price * l.quantity)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-right font-semibold">{formatMoney(total)}</p>
        <div className="mt-3 space-y-2">
          <input
            className="field"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="field"
            placeholder="Phone"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <textarea
            className="field min-h-16"
            placeholder="Note for the kitchen (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {error ? <p className="mt-2 text-xs text-coral">{error}</p> : null}
        <button
          type="button"
          disabled={busy || !lines.length}
          className="mt-3 w-full rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() => void submit()}
        >
          {busy ? "Placing…" : "Place order"}
        </button>
        <p className="mt-2 text-[11px] text-ink/45">
          Pay at the restaurant. They will see your name and phone on the order.
        </p>
      </aside>
    </div>
  );
}
