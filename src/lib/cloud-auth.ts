import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type {
  Membership,
  Organization,
  Profile,
  Subscription,
  TenantContext,
  TenantLoadResult,
} from "@/lib/tenant";
import { resolveStaffRole } from "@/lib/tenant";

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

/**
 * Load tenant for the signed-in user.
 * Distinguishes “no membership” (needs onboarding) from load failures
 * when a membership already exists (must NOT send user to onboarding).
 */
export async function loadTenantDetailed(): Promise<TenantLoadResult> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr) {
      return { tenant: null, hasMembership: false, error: userErr.message };
    }
    if (!user) {
      return { tenant: null, hasMembership: false, error: null };
    }

    // Bootstrap platform admin from env (first matching login)
    const adminEmail =
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAIL?.toLowerCase();
    if (adminEmail && user.email?.toLowerCase() === adminEmail) {
      await supabase
        .from("profiles")
        .update({ is_platform_admin: true, email: user.email })
        .eq("id", user.id);
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      return {
        tenant: null,
        hasMembership: false,
        error: profileErr.message,
      };
    }

    const membershipQuery = await supabase
      .from("memberships")
      .select("*")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let membership = membershipQuery.data;

    // Pre-migration DBs may not have `active`, or first query may error
    if (!membership) {
      const legacy = await supabase
        .from("memberships")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (legacy.error && membershipQuery.error) {
        return {
          tenant: null,
          hasMembership: false,
          error: legacy.error.message || membershipQuery.error.message,
        };
      }
      if (legacy.error && !legacy.data) {
        // Only treat as hard failure when we have no row at all
        if (membershipQuery.error) {
          return {
            tenant: null,
            hasMembership: false,
            error: membershipQuery.error.message,
          };
        }
      } else if (legacy.data && legacy.data.active !== false) {
        membership = legacy.data;
      }
    }

    if (!membership) {
      return { tenant: null, hasMembership: false, error: null };
    }

    if (!profile) {
      return {
        tenant: null,
        hasMembership: true,
        error: "Profile missing — try refreshing or contact support.",
      };
    }

    const [
      { data: organization, error: orgErr },
      { data: subscription, error: subErr },
    ] = await Promise.all([
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

    if (orgErr || !organization) {
      return {
        tenant: null,
        hasMembership: true,
        error: orgErr?.message || "Could not load your business.",
      };
    }
    if (subErr || !subscription) {
      return {
        tenant: null,
        hasMembership: true,
        error: subErr?.message || "Could not load subscription.",
      };
    }

    return {
      tenant: {
        profile: profile as Profile,
        organization: organization as Organization,
        membership: {
          ...(membership as Membership),
          role: resolveStaffRole(
            (membership as Membership).role,
            user.user_metadata as Record<string, unknown> | undefined,
          ),
        },
        subscription: subscription as Subscription,
      },
      hasMembership: true,
      error: null,
    };
  } catch (err) {
    return {
      tenant: null,
      hasMembership: false,
      error: err instanceof Error ? err.message : "Failed to load account",
    };
  }
}

export async function loadTenant(): Promise<TenantContext | null> {
  const result = await loadTenantDetailed();
  return result.tenant;
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
  tin?: string;
  vatNumber?: string;
  website?: string;
  inventoryEnabled: boolean;
  financeEnabled: boolean;
  menuEnabled?: boolean;
  orderingEnabled?: boolean;
  hrEnabled?: boolean;
  licenseFile?: File | null;
  idFile?: File | null;
}) {
  const menu = input.menuEnabled ?? input.inventoryEnabled;
  const ordering = input.orderingEnabled ?? input.inventoryEnabled;
  const hr = input.hrEnabled ?? true;
  if (
    !input.inventoryEnabled &&
    !input.financeEnabled &&
    !menu &&
    !ordering &&
    !hr
  ) {
    return { error: "Enable at least one module." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const existing = await loadTenantDetailed();
  if (existing.hasMembership) {
    return { error: "You already own or belong to a business." };
  }

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
    p_tin: input.tin?.trim() || null,
    p_vat: input.vatNumber?.trim() || null,
    p_website: input.website?.trim() || null,
    p_menu: menu,
    p_ordering: ordering,
    p_hr: hr,
  });

  if (error) return { error: error.message };
  return { organizationId: orgId as string };
}

export type ModuleFlags = {
  menuEnabled: boolean;
  orderingEnabled: boolean;
  kitchenEnabled: boolean;
  inventoryEnabled: boolean;
  financeEnabled: boolean;
  hrEnabled: boolean;
};

export async function updateModules(
  _input: { organizationId: string } & ModuleFlags,
) {
  // Module flags are set only by platform admin (trial start / payment approval).
  // Owners request changes via payment proof — they cannot unlock modules themselves.
  return {
    error:
      "Modules are controlled by Aramis. Request a package or modules below and wait for approval.",
  };
}

export async function submitPaymentProof(input: {
  organizationId: string;
  amount: number;
  method: "cash" | "cbe" | "telebirr" | "other";
  reference?: string;
  file: File;
  monthsRequested?: number;
  modules?: Partial<ModuleFlags>;
  packageCode?: string | null;
  expectedAmountEtb?: number | null;
  amountBreakdown?: Record<string, unknown> | null;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const months = Math.min(12, Math.max(1, input.monthsRequested ?? 1));
  const isVideo = input.file.type.startsWith("video/");
  const ext = input.file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
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
    media_kind: isVideo ? "video" : "image",
    menu_enabled: input.modules?.menuEnabled ?? null,
    ordering_enabled: input.modules?.orderingEnabled ?? null,
    kitchen_enabled: input.modules?.kitchenEnabled ?? null,
    inventory_enabled: input.modules?.inventoryEnabled ?? null,
    finance_enabled: input.modules?.financeEnabled ?? null,
    hr_enabled: input.modules?.hrEnabled ?? null,
    package_code: input.packageCode || null,
    expected_amount_etb:
      input.expectedAmountEtb != null ? Number(input.expectedAmountEtb) : null,
    amount_breakdown: input.amountBreakdown || null,
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
