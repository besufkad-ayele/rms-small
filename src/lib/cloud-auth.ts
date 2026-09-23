import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type {
  Membership,
  Organization,
  Profile,
  Subscription,
  TenantContext,
} from "@/lib/tenant";

const TRIAL_DAYS = Number(process.env.NEXT_PUBLIC_TRIAL_DAYS || 14);

export async function signUp(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        full_name: input.fullName.trim(),
        phone: input.phone?.trim() || null,
      },
    },
  });
  if (error) return { error: error.message };

  // Ensure session exists (autoconfirm / immediate login)
  if (!data.session) {
    const signed = await supabase.auth.signInWithPassword({
      email: input.email.trim(),
      password: input.password,
    });
    if (signed.error) {
      return {
        error:
          signed.error.message ||
          "Account created — confirm your email, then sign in.",
      };
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from("profiles")
      .update({
        email: input.email.trim().toLowerCase(),
        phone: input.phone?.trim() || null,
        full_name: input.fullName.trim(),
      })
      .eq("id", user.id);
  }

  return { user: user ?? data.user, session: data.session };
}

export async function signIn(email: string, password: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { error: error.message };
  return { user: data.user, session: data.session };
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
}

export async function getUser(): Promise<User | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function loadTenant(): Promise<TenantContext | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Bootstrap platform admin from env (first matching login)
  const adminEmail = process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAIL?.toLowerCase();
  if (adminEmail && user.email?.toLowerCase() === adminEmail) {
    await supabase
      .from("profiles")
      .update({ is_platform_admin: true, email: user.email })
      .eq("id", user.id);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const { data: membership } = await supabase
    .from("memberships")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!profile) return null;

  // Platform admins may have no tenant org
  if (!membership) {
    return null;
  }

  const [{ data: organization }, { data: subscription }] = await Promise.all([
    supabase
      .from("organizations")
      .select("*")
      .eq("id", membership.organization_id)
      .single(),
    supabase
      .from("subscriptions")
      .select("*")
      .eq("organization_id", membership.organization_id)
      .single(),
  ]);

  if (!organization || !subscription) return null;

  return {
    profile: profile as Profile,
    organization: organization as Organization,
    membership: membership as Membership,
    subscription: subscription as Subscription,
  };
}

export async function loadProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const adminEmail = process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAIL?.toLowerCase();
  if (adminEmail && user.email?.toLowerCase() === adminEmail) {
    await supabase
      .from("profiles")
      .update({ is_platform_admin: true, email: user.email })
      .eq("id", user.id);
  }
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Profile) || null;
}

async function uploadKyc(
  userId: string,
  kind: "license" | "id",
  file: File | null | undefined,
) {
  if (!file || file.size === 0) return null;
  const supabase = createClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("kyc-docs")
    .upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export async function onboardOrganization(input: {
  businessName: string;
  orgType: "cafe" | "restaurant" | "other";
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  inventoryEnabled: boolean;
  financeEnabled: boolean;
  licenseFile?: File | null;
  idFile?: File | null;
}) {
  if (!input.inventoryEnabled && !input.financeEnabled) {
    return { error: "Enable at least one module (Inventory or Finance)." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const existing = await loadTenant();
  if (existing) return { error: "You already own or belong to a business." };

  let licensePath: string | null = null;
  let idPath: string | null = null;
  try {
    licensePath = await uploadKyc(user.id, "license", input.licenseFile);
    idPath = await uploadKyc(user.id, "id", input.idFile);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Document upload failed" };
  }

  const { data: orgId, error } = await supabase.rpc("onboard_business", {
    p_name: input.businessName.trim(),
    p_org_type: input.orgType,
    p_phone: input.phone?.trim() || null,
    p_email: (input.email || user.email || "").trim().toLowerCase() || null,
    p_address: input.address?.trim() || null,
    p_city: input.city?.trim() || null,
    p_region: input.region?.trim() || null,
    p_country: input.country?.trim() || "Ethiopia",
    p_license: licensePath,
    p_id_doc: idPath,
    p_inventory: input.inventoryEnabled,
    p_finance: input.financeEnabled,
  });

  if (error) return { error: error.message };
  return { organizationId: orgId as string };
}

export async function updateModules(input: {
  organizationId: string;
  inventoryEnabled: boolean;
  financeEnabled: boolean;
}) {
  if (!input.inventoryEnabled && !input.financeEnabled) {
    return { error: "Keep at least one module enabled." };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("subscriptions")
    .update({
      inventory_enabled: input.inventoryEnabled,
      finance_enabled: input.financeEnabled,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function submitPaymentProof(input: {
  organizationId: string;
  amount: number;
  method: "cash" | "cbe" | "telebirr" | "other";
  reference?: string;
  file: File;
  monthsRequested?: number;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const months = Math.min(12, Math.max(1, input.monthsRequested ?? 1));
  const ext = input.file.name.split(".").pop() || "jpg";
  const path = `${input.organizationId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("payment-proofs")
    .upload(path, input.file, { upsert: false });
  if (uploadError) return { error: uploadError.message };

  const { data: pub } = supabase.storage.from("payment-proofs").getPublicUrl(path);

  const { error } = await supabase.from("payment_proofs").insert({
    organization_id: input.organizationId,
    amount: input.amount,
    method: input.method,
    reference: input.reference?.trim() || null,
    image_url: pub.publicUrl,
    status: "pending",
    submitted_by: user.id,
    months_requested: months,
  });
  if (error) return { error: error.message };

  // Keep current access; admin verifies then extends the period.
  return { ok: true };
}

export async function listOrgPaymentProofs(organizationId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("payment_proofs")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data || [];
}
