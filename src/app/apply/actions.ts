"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";

export type ApplicationInput = {
  fullName: string;
  email: string;
  phone: string;
  companyName?: string;
  orgType: "cafe" | "restaurant" | "other";
  website?: string;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  notes?: string;
  inventoryWanted: boolean;
  financeWanted: boolean;
};

export async function submitApplicationAction(
  input: ApplicationInput,
  licenseBase64?: string | null,
  licenseName?: string | null,
  idBase64?: string | null,
  idName?: string | null,
) {
  if (!input.fullName.trim() || !input.email.trim() || !input.phone.trim()) {
    return { error: "Name, email, and phone are required." };
  }
  if (!input.inventoryWanted && !input.financeWanted) {
    return { error: "Select at least one module." };
  }

  const admin = createAdminClient();
  const email = input.email.trim().toLowerCase();

  const { data: existing } = await admin
    .from("applications")
    .select("id, status")
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return { error: "An application with this email is already pending review." };
  }

  async function uploadDoc(
    kind: string,
    b64: string | null | undefined,
    name: string | null | undefined,
  ) {
    if (!b64) return null;
    const match = b64.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const contentType = match[1];
    const buf = Buffer.from(match[2], "base64");
    const ext = (name?.split(".").pop() || contentType.split("/")[1] || "bin").replace(
      /[^a-z0-9]/gi,
      "",
    );
    const path = `applications/${Date.now()}-${kind}.${ext}`;
    const { error } = await admin.storage.from("kyc-docs").upload(path, buf, {
      contentType,
      upsert: false,
    });
    if (error) throw new Error(error.message);
    return path;
  }

  let licensePath: string | null = null;
  let idPath: string | null = null;
  try {
    licensePath = await uploadDoc("license", licenseBase64, licenseName);
    idPath = await uploadDoc("id", idBase64, idName);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Document upload failed" };
  }

  const { data, error } = await admin
    .from("applications")
    .insert({
      full_name: input.fullName.trim(),
      email,
      phone: input.phone.trim(),
      company_name: input.companyName?.trim() || null,
      org_type: input.orgType,
      website: input.website?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      region: input.region?.trim() || null,
      country: input.country?.trim() || "Ethiopia",
      notes: input.notes?.trim() || null,
      inventory_wanted: input.inventoryWanted,
      finance_wanted: input.financeWanted,
      business_license_url: licensePath,
      id_document_url: idPath,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { ok: true as const, applicationId: data.id };
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
