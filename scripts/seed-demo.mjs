/**
 * Seed Aramis demo data: platform admin + demo café with menu/inventory/orders.
 * Run: node --env-file=.env.local scripts/seed-demo.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAIL || "admin@aramis.product";
const ADMIN_PASSWORD = process.env.ARAMIS_ADMIN_PASSWORD || "AramisAdmin2026!";
const DEMO_EMAIL = "cafe@demo.aramis.product";
const DEMO_PASSWORD = "DemoCafe2026!";

async function ensureUser(email, password, meta) {
  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = listed.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: meta,
    });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: meta,
  });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  console.log("Seeding Aramis demo…");

  const adminId = await ensureUser(ADMIN_EMAIL, ADMIN_PASSWORD, {
    full_name: "Aramis Owner",
  });
  await admin.from("profiles").upsert({
    id: adminId,
    full_name: "Aramis Owner",
    email: ADMIN_EMAIL,
    phone: "+251900000001",
    is_platform_admin: true,
  });
  console.log("Admin ready:", ADMIN_EMAIL, ADMIN_PASSWORD);

  // Sample pending application
  await admin.from("applications").delete().eq("email", "pending@example.cafe");
  await admin.from("applications").insert({
    full_name: "Sara Bekele",
    email: "pending@example.cafe",
    phone: "+251911000111",
    company_name: "Blue Nile Coffee",
    org_type: "cafe",
    website: "https://example.com",
    address: "Bole Road",
    city: "Addis Ababa",
    region: "Addis Ababa",
    country: "Ethiopia",
    notes: "Seeded pending application for demo",
    inventory_wanted: true,
    finance_wanted: true,
    status: "pending",
  });
  console.log("Pending application: pending@example.cafe");

  // Demo café owner
  const demoId = await ensureUser(DEMO_EMAIL, DEMO_PASSWORD, {
    full_name: "Demo Café Owner",
    phone: "+251922000222",
  });
  await admin.from("profiles").upsert({
    id: demoId,
    full_name: "Demo Café Owner",
    email: DEMO_EMAIL,
    phone: "+251922000222",
    is_platform_admin: false,
  });

  // Clean previous demo org by name
  const { data: oldOrgs } = await admin
    .from("organizations")
    .select("id")
    .eq("email", DEMO_EMAIL);
  for (const o of oldOrgs || []) {
    await admin.from("organizations").delete().eq("id", o.id);
  }

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: "Demo Highlands Café",
      org_type: "cafe",
      phone: "+251922000222",
      email: DEMO_EMAIL,
      address: "Piassa",
      city: "Addis Ababa",
      region: "Addis Ababa",
      country: "Ethiopia",
      verification_status: "approved",
      verified_at: new Date().toISOString(),
      verified_by: adminId,
      created_by: demoId,
    })
    .select("*")
    .single();
  if (orgErr) throw orgErr;

  await admin.from("memberships").insert({
    organization_id: org.id,
    user_id: demoId,
    role: "owner",
  });

  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 14);
  await admin.from("subscriptions").insert({
    organization_id: org.id,
    status: "trialing",
    inventory_enabled: true,
    finance_enabled: true,
    trial_ends_at: trialEnds.toISOString(),
    plan_code: "aramis_starter",
    notes: "Seeded demo café",
  });

  await admin.from("org_meta").upsert({
    organization_id: org.id,
    receipt_seq: 3,
    seeded: true,
  });

  const { data: inv } = await admin
    .from("inventory_items")
    .insert([
      {
        organization_id: org.id,
        name: "Coffee beans",
        unit: "kg",
        stock_qty: 15,
        low_stock_threshold: 2,
        cost_per_unit: 850,
      },
      {
        organization_id: org.id,
        name: "Milk",
        unit: "L",
        stock_qty: 25,
        low_stock_threshold: 4,
        cost_per_unit: 95,
      },
      {
        organization_id: org.id,
        name: "Bread rolls",
        unit: "pcs",
        stock_qty: 50,
        low_stock_threshold: 10,
        cost_per_unit: 15,
      },
    ])
    .select("*");

  const byName = Object.fromEntries((inv || []).map((i) => [i.name, i]));
  const { data: menu } = await admin
    .from("menu_items")
    .insert([
      {
        organization_id: org.id,
        name: "Espresso",
        category: "hot-drinks",
        price: 45,
        available: true,
        description: "Single shot",
        vote_count: 12,
      },
      {
        organization_id: org.id,
        name: "Macchiato",
        category: "hot-drinks",
        price: 55,
        available: true,
        description: "With milk foam",
        vote_count: 28,
      },
      {
        organization_id: org.id,
        name: "Sandwich",
        category: "food",
        price: 120,
        available: true,
        description: "Daily special",
        vote_count: 7,
      },
    ])
    .select("*");

  const espresso = menu.find((m) => m.name === "Espresso");
  const macchiato = menu.find((m) => m.name === "Macchiato");
  const sandwich = menu.find((m) => m.name === "Sandwich");

  await admin.from("menu_recipes").insert([
    {
      menu_item_id: espresso.id,
      inventory_item_id: byName["Coffee beans"].id,
      quantity_required: 0.018,
    },
    {
      menu_item_id: macchiato.id,
      inventory_item_id: byName["Coffee beans"].id,
      quantity_required: 0.018,
    },
    {
      menu_item_id: macchiato.id,
      inventory_item_id: byName["Milk"].id,
      quantity_required: 0.05,
    },
    {
      menu_item_id: sandwich.id,
      inventory_item_id: byName["Bread rolls"].id,
      quantity_required: 1,
    },
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const { data: order1 } = await admin
    .from("sale_orders")
    .insert({
      organization_id: org.id,
      receipt_number: `AR-${today.replace(/-/g, "")}-0001`,
      subtotal: 155,
      service_charge: 15.5,
      vat: 25.58,
      total: 196.08,
      payment_method: "cash",
      cashier_name: "Demo Café Owner",
      day_key: today,
    })
    .select("*")
    .single();

  await admin.from("sale_order_lines").insert([
    {
      order_id: order1.id,
      menu_item_id: macchiato.id,
      name: "Macchiato",
      unit_price: 55,
      quantity: 1,
      line_total: 55,
    },
    {
      order_id: order1.id,
      menu_item_id: sandwich.id,
      name: "Sandwich",
      unit_price: 120,
      quantity: 1,
      line_total: 120,
    },
  ]);

  const { data: order2 } = await admin
    .from("sale_orders")
    .insert({
      organization_id: org.id,
      receipt_number: `AR-${today.replace(/-/g, "")}-0002`,
      subtotal: 145,
      service_charge: 14.5,
      vat: 23.93,
      total: 183.43,
      payment_method: "telebirr",
      payment_reference: "TB-SEED-001",
      cashier_name: "Demo Café Owner",
      day_key: today,
    })
    .select("*")
    .single();

  await admin.from("sale_order_lines").insert([
    {
      order_id: order2.id,
      menu_item_id: espresso.id,
      name: "Espresso",
      unit_price: 45,
      quantity: 1,
      line_total: 45,
    },
    {
      order_id: order2.id,
      menu_item_id: macchiato.id,
      name: "Macchiato",
      unit_price: 55,
      quantity: 2,
      line_total: 110,
    },
  ]);

  await admin.from("applications").upsert(
    {
      full_name: "Demo Café Owner",
      email: DEMO_EMAIL,
      phone: "+251922000222",
      company_name: "Demo Highlands Café",
      org_type: "cafe",
      city: "Addis Ababa",
      country: "Ethiopia",
      inventory_wanted: true,
      finance_wanted: true,
      status: "approved",
      organization_id: org.id,
      generated_password: DEMO_PASSWORD,
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminId,
    },
    { onConflict: "id" },
  );

  // Insert approved application cleanly
  await admin.from("applications").delete().eq("email", DEMO_EMAIL);
  await admin.from("applications").insert({
    full_name: "Demo Café Owner",
    email: DEMO_EMAIL,
    phone: "+251922000222",
    company_name: "Demo Highlands Café",
    org_type: "cafe",
    city: "Addis Ababa",
    country: "Ethiopia",
    inventory_wanted: true,
    finance_wanted: true,
    status: "approved",
    organization_id: org.id,
    generated_password: DEMO_PASSWORD,
    reviewed_at: new Date().toISOString(),
    reviewed_by: adminId,
  });

  console.log("\n=== DEMO CREDENTIALS ===");
  console.log("Admin login:  /admin-login");
  console.log("  email:   ", ADMIN_EMAIL);
  console.log("  password:", ADMIN_PASSWORD);
  console.log("  manage:  /platform");
  console.log("Customer login: /login");
  console.log("  email:   ", DEMO_EMAIL);
  console.log("  password:", DEMO_PASSWORD);
  console.log("Apply (no password): /apply");
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
