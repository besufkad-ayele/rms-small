import { createClient } from "@/lib/supabase/client";

/** Paper width in millimeters (common thermal sizes). */
export type ReceiptWidthMm = 58 | 80;

export type ReceiptProfile = {
  widthMm: ReceiptWidthMm;
  businessName: string;
  phone: string;
  address: string;
  title: string;
  headerNote: string;
  extraLines: string;
  footer: string;
  showService: boolean;
  showVat: boolean;
  serviceLabel: string;
  vatLabel: string;
};

export type OrgReceiptSettings = {
  vat_percent: number;
  service_percent: number;
  profile: ReceiptProfile;
};

export const DEFAULT_RECEIPT_PROFILE: ReceiptProfile = {
  widthMm: 80,
  businessName: "",
  phone: "",
  address: "",
  title: "Sales receipt",
  headerNote: "",
  extraLines: "",
  footer: "Thank you — powered by Aramis",
  showService: true,
  showVat: true,
  serviceLabel: "Service",
  vatLabel: "VAT",
};

export const DEFAULT_RECEIPT_SETTINGS: OrgReceiptSettings = {
  vat_percent: 15,
  service_percent: 10,
  profile: { ...DEFAULT_RECEIPT_PROFILE },
};

function asProfile(raw: unknown, fallback: ReceiptProfile): ReceiptProfile {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const width = Number(o.widthMm) === 58 ? 58 : 80;
  return {
    widthMm: width,
    businessName: String(o.businessName ?? fallback.businessName),
    phone: String(o.phone ?? fallback.phone),
    address: String(o.address ?? fallback.address),
    title: String(o.title ?? fallback.title) || "Sales receipt",
    headerNote: String(o.headerNote ?? fallback.headerNote),
    extraLines: String(o.extraLines ?? fallback.extraLines),
    footer: String(o.footer ?? fallback.footer),
    showService: o.showService !== false,
    showVat: o.showVat !== false,
    serviceLabel: String(o.serviceLabel ?? fallback.serviceLabel) || "Service",
    vatLabel: String(o.vatLabel ?? fallback.vatLabel) || "VAT",
  };
}

export async function getOrgReceiptSettings(
  orgId: string,
): Promise<OrgReceiptSettings> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("org_meta")
    .select("vat_percent, service_percent, receipt_footer, receipt_profile")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error || !data) return { ...DEFAULT_RECEIPT_SETTINGS, profile: { ...DEFAULT_RECEIPT_PROFILE } };

  const baseProfile = {
    ...DEFAULT_RECEIPT_PROFILE,
    footer:
      String(data.receipt_footer || "").trim() ||
      DEFAULT_RECEIPT_PROFILE.footer,
  };
  return {
    vat_percent: Number(data.vat_percent ?? 15),
    service_percent: Number(data.service_percent ?? 10),
    profile: asProfile(data.receipt_profile, baseProfile),
  };
}

/** @deprecated use getOrgReceiptSettings */
export async function getOrgTaxSettings(orgId: string) {
  const s = await getOrgReceiptSettings(orgId);
  return {
    vat_percent: s.vat_percent,
    service_percent: s.service_percent,
    receipt_footer: s.profile.footer,
  };
}

export async function saveOrgReceiptSettings(
  orgId: string,
  input: OrgReceiptSettings,
): Promise<void> {
  const vat = Math.min(100, Math.max(0, Number(input.vat_percent) || 0));
  const service = Math.min(100, Math.max(0, Number(input.service_percent) || 0));
  const profile: ReceiptProfile = {
    ...DEFAULT_RECEIPT_PROFILE,
    ...input.profile,
    widthMm: input.profile.widthMm === 58 ? 58 : 80,
    businessName: input.profile.businessName.trim(),
    phone: input.profile.phone.trim(),
    address: input.profile.address.trim(),
    title: input.profile.title.trim() || "Sales receipt",
    headerNote: input.profile.headerNote.trim(),
    extraLines: input.profile.extraLines.trim(),
    footer: input.profile.footer.trim(),
    serviceLabel: input.profile.serviceLabel.trim() || "Service",
    vatLabel: input.profile.vatLabel.trim() || "VAT",
  };

  const supabase = createClient();
  const { data: meta } = await supabase
    .from("org_meta")
    .select("receipt_seq, seeded")
    .eq("organization_id", orgId)
    .maybeSingle();
  const { error } = await supabase.from("org_meta").upsert({
    organization_id: orgId,
    receipt_seq: meta?.receipt_seq ?? 0,
    seeded: meta?.seeded ?? false,
    vat_percent: vat,
    service_percent: service,
    receipt_footer: profile.footer,
    receipt_profile: profile,
  });
  if (error) throw new Error(error.message);
}

/** @deprecated use saveOrgReceiptSettings */
export async function saveOrgTaxSettings(
  orgId: string,
  input: {
    vat_percent: number;
    service_percent: number;
    receipt_footer: string;
  },
) {
  const current = await getOrgReceiptSettings(orgId);
  await saveOrgReceiptSettings(orgId, {
    vat_percent: input.vat_percent,
    service_percent: input.service_percent,
    profile: { ...current.profile, footer: input.receipt_footer },
  });
}

export type OrgTaxSettings = {
  vat_percent: number;
  service_percent: number;
  receipt_footer: string;
};
