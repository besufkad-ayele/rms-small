"use server";

import { requirePlatformAdmin } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/server";
import { computeBill } from "@/lib/money";
import { dayKey } from "@/lib/utils";
import { ensureOrgPublicSlug } from "@/lib/org-slug";
import { moduleEnabled, type AppModule } from "@/lib/tenant";

export type PublicMenuItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  image_url: string | null;
  available: boolean;
};

export type PublicVenue = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  phone: string | null;
  address: string | null;
};

export async function loadPublicVenueAction(slug: string): Promise<
  | { error: string }
  | { venue: PublicVenue; items: PublicMenuItem[] }
> {
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, public_slug, city, phone, address, verification_status")
    .eq("public_slug", slug)
    .maybeSingle();
  if (!org) return { error: "Restaurant not found" };

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!sub) return { error: "Not available" };

  const live = moduleEnabled(
    sub as never,
    "online" as AppModule,
    org as never,
  );
  if (!live) return { error: "Online ordering is not active for this restaurant" };

  const { data: items } = await admin
    .from("menu_items")
    .select("id, name, category, price, description, image_url, available")
    .eq("organization_id", org.id)
    .eq("available", true)
    .order("category")
    .order("name");

  return {
    venue: {
      id: String(org.id),
      name: String(org.name),
      slug: String(org.public_slug || slug),
      city: org.city ? String(org.city) : null,
      phone: org.phone ? String(org.phone) : null,
      address: org.address ? String(org.address) : null,
    },
    items: (items || []) as PublicMenuItem[],
  };
}

export async function placePublicOrderAction(input: {
  slug: string;
  guestName: string;
  guestPhone: string;
  guestNote?: string;
  lines: Array<{ menuItemId: string; quantity: number }>;
}): Promise<{ error: string } | { ok: true; receipt: string }> {
  const name = input.guestName.trim();
  const phone = input.guestPhone.trim();
  if (name.length < 2) return { error: "Please enter your name" };
  if (phone.replace(/\D/g, "").length < 9) {
    return { error: "Please enter a valid phone number" };
  }
  if (!input.lines.length) return { error: "Your bag is empty" };

  const loaded = await loadPublicVenueAction(input.slug);
  if ("error" in loaded) return loaded;
  const byId = new Map(loaded.items.map((i) => [i.id, i]));

  const lines = input.lines
    .map((l) => {
      const item = byId.get(l.menuItemId);
      const qty = Math.max(1, Math.floor(l.quantity || 0));
      if (!item || qty < 1) return null;
      const line_total = Math.round(item.price * qty * 100) / 100;
      return {
        menu_item_id: item.id,
        name: item.name,
        unit_price: item.price,
        quantity: qty,
        line_total,
      };
    })
    .filter((l): l is NonNullable<typeof l> => Boolean(l));
  if (!lines.length) return { error: "Those items are no longer available" };

  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
  const admin = createAdminClient();
  const { data: meta } = await admin
    .from("org_meta")
    .select("receipt_seq, vat_percent, service_percent")
    .eq("organization_id", loaded.venue.id)
    .maybeSingle();
  const bill = computeBill(subtotal, {
    vatPercent: Number(meta?.vat_percent ?? 0),
    servicePercent: Number(meta?.service_percent ?? 0),
  });
  const next = (Number(meta?.receipt_seq ?? 0) || 0) + 1;
  await admin.from("org_meta").upsert({
    organization_id: loaded.venue.id,
    receipt_seq: next,
    seeded: false,
  });
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const receipt = `AR-${stamp}-${String(next).padStart(4, "0")}`;

  const { data: order, error } = await admin
    .from("sale_orders")
    .insert({
      organization_id: loaded.venue.id,
      receipt_number: receipt,
      subtotal: bill.subtotal,
      service_charge: bill.serviceCharge,
      vat: bill.vat,
      total: bill.total,
      payment_method: "other",
      cashier_name: name,
      day_key: dayKey(d),
      status: "placed",
      payment_status: "unpaid",
      source: "online",
      guest_name: name,
      guest_phone: phone,
      guest_note: input.guestNote?.trim() || null,
      place_label: "Online",
      vat_percent: bill.vatPercent,
      service_percent: bill.servicePercent,
    })
    .select("id")
    .single();
  if (error || !order) return { error: error?.message || "Could not place order" };

  const { error: lineErr } = await admin.from("sale_order_lines").insert(
    lines.map((l) => ({ ...l, order_id: order.id, round: 1, kitchen_status: "placed" })),
  );
  if (lineErr) return { error: lineErr.message };

  return { ok: true, receipt };
}

export async function assignPublicSlugAction(
  organizationId: string,
  name: string,
  forceNew = false,
) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error ?? "Unauthorized" };
  const { data: org } = await gate.admin
    .from("organizations")
    .select("name, public_slug")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return { error: "Organization not found" };
  const slug = await ensureOrgPublicSlug(
    gate.admin,
    organizationId,
    name || String(org.name),
    forceNew ? null : (org.public_slug as string | null),
  );
  return { slug };
}
