import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.RLS_LIVE_TEST === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const stamp = `${Date.now()}`;
const password = "RlsTest-2026!aa";
const emailA = `rls-a-${stamp}@aramis.test`;
const emailB = `rls-b-${stamp}@aramis.test`;

describe.skipIf(!enabled || !url || !anon || !service)(
  "live RLS (requires RLS_LIVE_TEST=1 and .env.local)",
  () => {
    let admin: SupabaseClient;
    let userA: string;
    let userB: string;
    let orgId: string | null = null;

    beforeAll(async () => {
      admin = createClient(url, service, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const a = await admin.auth.admin.createUser({
        email: emailA,
        password,
        email_confirm: true,
      });
      const b = await admin.auth.admin.createUser({
        email: emailB,
        password,
        email_confirm: true,
      });
      if (a.error || !a.data.user) throw a.error ?? new Error("create user A");
      if (b.error || !b.data.user) throw b.error ?? new Error("create user B");
      userA = a.data.user.id;
      userB = b.data.user.id;

      const { data: org, error: orgErr } = await admin
        .from("organizations")
        .insert({
          name: `RLS Test Cafe ${stamp}`,
          email: emailA,
          verification_status: "pending",
          created_by: userA,
        })
        .select("id")
        .single();
      if (orgErr || !org) throw orgErr ?? new Error("create org");
      orgId = String(org.id);

      const { error: memErr } = await admin.from("memberships").insert({
        organization_id: orgId,
        user_id: userA,
        role: "owner",
        active: true,
        can_order: true,
        can_menu: true,
        can_inventory: true,
        can_finance: true,
        can_billing: true,
        can_manage_staff: true,
      });
      if (memErr) throw memErr;
    }, 60_000);

    afterAll(async () => {
      if (!admin) return;
      if (orgId) {
        const { data: orders } = await admin
          .from("sale_orders")
          .select("id")
          .eq("organization_id", orgId);
        const orderIds = (orders ?? []).map((row) => row.id);
        if (orderIds.length > 0) {
          await admin.from("sale_order_lines").delete().in("order_id", orderIds);
        }
        await admin.from("sale_orders").delete().eq("organization_id", orgId);
        await admin.from("memberships").delete().eq("organization_id", orgId);
        await admin.from("subscriptions").delete().eq("organization_id", orgId);
        await admin.from("organizations").delete().eq("id", orgId);
      }
      if (userA) await admin.auth.admin.deleteUser(userA);
      if (userB) await admin.auth.admin.deleteUser(userB);
    }, 60_000);

    async function session(email: string) {
      const client = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      return client;
    }

    it("blocks a user from setting is_platform_admin on themselves", async () => {
      const client = await session(emailA);
      const { error } = await client
        .from("profiles")
        .update({ is_platform_admin: true })
        .eq("id", userA);
      expect(error).toBeTruthy();
      const { data } = await admin
        .from("profiles")
        .select("is_platform_admin")
        .eq("id", userA)
        .maybeSingle();
      expect(data?.is_platform_admin).toBe(false);
    });

    it("blocks joining another organization without an invite", async () => {
      const client = await session(emailB);
      const { error } = await client.from("memberships").insert({
        organization_id: orgId,
        user_id: userB,
        role: "owner",
        active: true,
      });
      expect(error).toBeTruthy();
      const { count } = await admin
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("user_id", userB);
      expect(count ?? 0).toBe(0);
    });

    it("does not let an owner self-approve KYC", async () => {
      const client = await session(emailA);
      await client
        .from("organizations")
        .update({ verification_status: "approved" })
        .eq("id", orgId);
      const { data } = await admin
        .from("organizations")
        .select("verification_status")
        .eq("id", orgId)
        .maybeSingle();
      expect(data?.verification_status).toBe("pending");
    });

    it("blocks tenant INSERT on subscriptions", async () => {
      const client = await session(emailA);
      const { error } = await client.from("subscriptions").insert({
        organization_id: orgId,
        status: "active",
        plan_code: "full",
        inventory_enabled: true,
      });
      expect(error).toBeTruthy();
    });

    it("hides another org's sale_orders from a non-member", async () => {
      const client = await session(emailB);
      const { data } = await client
        .from("sale_orders")
        .select("id")
        .eq("organization_id", orgId);
      expect(data ?? []).toHaveLength(0);
    });

    it("rejects complete_sale from a user who is not in the org", async () => {
      const client = await session(emailB);
      const { error } = await client.rpc("complete_sale", {
        p_org_id: orgId,
        p_client_order_id: `rls-outsider-${stamp}`,
        p_lines: [
          {
            menu_item_id: crypto.randomUUID(),
            quantity: 1,
            name: "probe",
            unit_price: 1,
          },
        ],
        p_cashier_name: "rls",
      });
      expect(error).toBeTruthy();
      const { count } = await admin
        .from("sale_orders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("client_order_id", `rls-outsider-${stamp}`);
      expect(count ?? 0).toBe(0);
    });

    it("rejects a non-member INSERT on sale_orders", async () => {
      const client = await session(emailB);
      const { error } = await client.from("sale_orders").insert({
        organization_id: orgId,
        receipt_number: `RLS-${stamp}`,
        subtotal: 1,
        total: 1,
        payment_method: "cash",
        cashier_name: "rls",
        day_key: "2026-10-07",
        status: "placed",
      });
      expect(error).toBeTruthy();
    });
  },
);
