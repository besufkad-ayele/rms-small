"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { PackageRow } from "@/lib/pricing";

export type ApplicationInput = {
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
  orgType: "cafe" | "restaurant" | "other";
  website?: string;
  address?: string;
  city: string;
  region?: string;
  country?: string;
  tin?: string;
  vatNumber?: string;
  notes?: string;
  packageCode: string;
  menuWanted?: boolean;
  orderingWanted?: boolean;
  kitchenWanted?: boolean;
  inventoryWanted?: boolean;
  financeWanted?: boolean;
  hrWanted?: boolean;
  onlineWanted?: boolean;
  /** File extension for license upload, e.g. "pdf" or "jpg" */
  licenseExt?: string | null;
  /** File extension for ID upload */
  idExt?: string | null;
};

export type InterestUploadSlot = {
  bucket: string;
  path: string;
  signedUrl: string;
  token: string;
};

/** Active packages for the public interest form (no auth required). */
export async function listPublicPackagesAction() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("subscription_packages")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) return { error: error.message };
  return { packages: (data || []) as PackageRow[] };
}

function safeExt(raw: string | null | undefined, fallback: string) {
  const e = (raw || fallback).toLowerCase().replace(/[^a-z0-9]/g, "");
  return e || fallback;
}

async function signedUpload(
  admin: ReturnType<typeof createAdminClient>,
  bucket: string,
  path: string,
  upsert = false,
): Promise<InterestUploadSlot | { error: string }> {
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUploadUrl(path, { upsert });
  if (error || !data) {
    return { error: error?.message || `Could not prepare upload for ${path}` };
  }
  return {
    bucket,
    path,
    signedUrl: data.signedUrl,
    token: data.token,
  };
}

/**
 * Create the pending application (metadata only) and return signed upload
 * URLs so the browser can PUT logo/KYC directly to Storage — keeps the
 * Server Action body tiny (avoids the 1 MB limit).
 */
export async function startInterestApplicationAction(input: ApplicationInput) {
  if (!input.fullName.trim() || !input.email.trim() || !input.phone.trim()) {
    return { error: "Name, email, and phone are required." };
  }
  if (!input.companyName.trim()) {
    return { error: "Business name is required." };
  }
  if (!input.city.trim()) {
    return { error: "City is required." };
  }
  if (!input.packageCode.trim()) {
    return { error: "Select a package." };
  }

  const admin = createAdminClient();
  const email = input.email.trim().toLowerCase();

  const { data: pkg, error: pkgErr } = await admin
    .from("subscription_packages")
    .select("*")
    .eq("code", input.packageCode.trim())
    .eq("active", true)
    .maybeSingle();
  if (pkgErr) return { error: pkgErr.message };
  if (!pkg) return { error: "Selected package is not available." };

  const { data: existing } = await admin
    .from("applications")
    .select("id, status")
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return { error: "An application with this email is already pending review." };
  }

  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const authExists = listed.users.find((u) => u.email?.toLowerCase() === email);
  if (authExists) {
    return {
      error:
        "This email already has a login. Sign in at /login, or contact Aramis if you need help.",
    };
  }

  const menuWanted = input.menuWanted ?? Boolean(pkg.menu_enabled);
  const orderingWanted = input.orderingWanted ?? Boolean(pkg.ordering_enabled);
  const kitchenWanted =
    input.kitchenWanted ??
    Boolean(pkg.kitchen_enabled ?? pkg.ordering_enabled);
  const inventoryWanted =
    input.inventoryWanted ?? Boolean(pkg.inventory_enabled);
  const financeWanted = input.financeWanted ?? Boolean(pkg.finance_enabled);
  const hrWanted = input.hrWanted ?? Boolean(pkg.hr_enabled);
  const onlineWanted = input.onlineWanted ?? Boolean(pkg.online_enabled);

  const { data, error } = await admin
    .from("applications")
    .insert({
      full_name: input.fullName.trim(),
      email,
      phone: input.phone.trim(),
      company_name: input.companyName.trim(),
      org_type: input.orgType,
      website: input.website?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city.trim(),
      region: input.region?.trim() || null,
      country: input.country?.trim() || "Ethiopia",
      tin: input.tin?.trim() || null,
      vat_number: input.vatNumber?.trim() || null,
      notes: input.notes?.trim() || null,
      package_code: pkg.code,
      inventory_wanted: inventoryWanted,
      finance_wanted: financeWanted,
      menu_wanted: menuWanted,
      ordering_wanted: orderingWanted,
      kitchen_wanted: kitchenWanted,
      hr_wanted: hrWanted,
      online_wanted: onlineWanted,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message || "Could not save application." };
  }

  const applicationId = data.id as string;
  const licenseExt = input.licenseExt
    ? safeExt(input.licenseExt, "bin")
    : null;
  const idExt = input.idExt ? safeExt(input.idExt, "bin") : null;

  const logoSlot = await signedUpload(
    admin,
    "org-logos",
    `applications/${applicationId}/logo.webp`,
    true,
  );
  if ("error" in logoSlot) {
    await admin.from("applications").delete().eq("id", applicationId);
    return { error: logoSlot.error };
  }

  let licenseSlot: InterestUploadSlot | null = null;
  let idSlot: InterestUploadSlot | null = null;

  if (licenseExt) {
    const slot = await signedUpload(
      admin,
      "kyc-docs",
      `applications/${applicationId}/license.${licenseExt}`,
    );
    if ("error" in slot) {
      await admin.from("applications").delete().eq("id", applicationId);
      return { error: slot.error };
    }
    licenseSlot = slot;
  }

  if (idExt) {
    const slot = await signedUpload(
      admin,
      "kyc-docs",
      `applications/${applicationId}/id.${idExt}`,
    );
    if ("error" in slot) {
      await admin.from("applications").delete().eq("id", applicationId);
      return { error: slot.error };
    }
    idSlot = slot;
  }

  return {
    ok: true as const,
    applicationId,
    logo: logoSlot,
    license: licenseSlot,
    idDoc: idSlot,
  };
}

/**
 * After the browser uploads files to the signed URLs, attach paths/URLs
 * on the application row.
 */
export async function completeInterestApplicationAction(input: {
  applicationId: string;
  licensePath?: string | null;
  idPath?: string | null;
}) {
  const admin = createAdminClient();
  const applicationId = input.applicationId;

  const { data: app, error: loadErr } = await admin
    .from("applications")
    .select("id, status")
    .eq("id", applicationId)
    .maybeSingle();
  if (loadErr || !app) {
    return { error: loadErr?.message || "Application not found." };
  }
  if (app.status !== "pending") {
    return { error: "Application is no longer pending." };
  }

  const logoPath = `applications/${applicationId}/logo.webp`;
  const { data: logoList, error: listErr } = await admin.storage
    .from("org-logos")
    .list(`applications/${applicationId}`, { search: "logo.webp" });
  if (listErr) {
    await admin.from("applications").delete().eq("id", applicationId);
    return { error: listErr.message };
  }
  const hasLogo = (logoList || []).some((f) => f.name === "logo.webp");
  if (!hasLogo) {
    await admin.from("applications").delete().eq("id", applicationId);
    return { error: "Logo upload did not complete. Please try again." };
  }

  const { data: publicUrl } = admin.storage
    .from("org-logos")
    .getPublicUrl(logoPath);
  const logoUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;

  const { error: updErr } = await admin
    .from("applications")
    .update({
      logo_url: logoUrl,
      business_license_url: input.licensePath || null,
      id_document_url: input.idPath || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId);
  if (updErr) {
    return { error: updErr.message };
  }

  return { ok: true as const, applicationId };
}

/** @deprecated Prefer startInterestApplicationAction + completeInterestApplicationAction */
export async function submitApplicationAction(
  input: ApplicationInput,
  _licenseBase64?: string | null,
  _licenseName?: string | null,
  _idBase64?: string | null,
  _idName?: string | null,
  _logoBase64?: string | null,
) {
  void _licenseBase64;
  void _licenseName;
  void _idBase64;
  void _idName;
  void _logoBase64;
  return {
    error:
      "Please refresh the page — interest upload was updated. Submit again.",
  };
}

export async function getMyApplicationByEmailAction(email: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("applications")
    .select("*")
    .eq("email", email.trim().toLowerCase())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: error.message };
  return { application: data };
}

export async function adminLoginAction(email: string, password: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) return { error: error.message };

  const admin = createAdminClient();
  const adminEmail = (
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAIL || "admin@aramis.product"
  ).toLowerCase();

  if (data.user?.email?.toLowerCase() === adminEmail) {
    await admin
      .from("profiles")
      .update({ is_platform_admin: true, email: data.user.email })
      .eq("id", data.user.id);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", data.user!.id)
    .maybeSingle();

  if (!profile?.is_platform_admin) {
    await supabase.auth.signOut();
    return { error: "This account is not an Aramis platform admin." };
  }

  return { ok: true as const };
}
