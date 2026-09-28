import { createClient } from "@/lib/supabase/client";
import {
  cacheReceiptSettings,
  getCachedReceiptSettings,
  setCatalogSyncMeta,
  type CachedReceiptSettings,
} from "@/lib/offline/cache";
import { getConnectionSnapshot } from "@/lib/offline/connection";

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

/** Same-tab memory cache — avoids IndexedDB on every sale/print. */
const memoryCache = new Map<string, CachedReceiptSettings>();

function canReachCloud(): boolean {
  return getConnectionSnapshot().status !== "down";
}

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

function normalizeSettings(raw: OrgReceiptSettings): OrgReceiptSettings {
  return {
    vat_percent: Math.min(100, Math.max(0, Number(raw.vat_percent) || 0)),
    service_percent: Math.min(
      100,
      Math.max(0, Number(raw.service_percent) || 0),
    ),
    profile: {
      ...DEFAULT_RECEIPT_PROFILE,
      ...raw.profile,
      widthMm: raw.profile.widthMm === 58 ? 58 : 80,
      businessName: raw.profile.businessName.trim(),
      phone: raw.profile.phone.trim(),
      address: raw.profile.address.trim(),
      title: raw.profile.title.trim() || "Sales receipt",
      headerNote: raw.profile.headerNote.trim(),
      extraLines: raw.profile.extraLines.trim(),
      footer: raw.profile.footer.trim(),
      serviceLabel: raw.profile.serviceLabel.trim() || "Service",
      vatLabel: raw.profile.vatLabel.trim() || "VAT",
    },
  };
}

function settingsEqual(a: OrgReceiptSettings, b: OrgReceiptSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseRemoteRow(data: {
  vat_percent?: unknown;
  service_percent?: unknown;
  receipt_footer?: unknown;
  receipt_profile?: unknown;
  updated_at?: unknown;
}): CachedReceiptSettings {
  const baseProfile = {
    ...DEFAULT_RECEIPT_PROFILE,
    footer:
      String(data.receipt_footer || "").trim() ||
      DEFAULT_RECEIPT_PROFILE.footer,
  };
  return {
    settings: {
      vat_percent: Number(data.vat_percent ?? 15),
      service_percent: Number(data.service_percent ?? 10),
      profile: asProfile(data.receipt_profile, baseProfile),
    },
    remoteUpdatedAt:
      typeof data.updated_at === "string" && data.updated_at
        ? data.updated_at
        : null,
  };
}

async function readLocal(orgId: string): Promise<CachedReceiptSettings | null> {
  const mem = memoryCache.get(orgId);
  if (mem) return mem;
  const disk = await getCachedReceiptSettings(orgId);
  if (disk?.settings) {
    memoryCache.set(orgId, disk);
    return disk;
  }
  return null;
}

async function writeLocal(
  orgId: string,
  payload: CachedReceiptSettings,
): Promise<void> {
  memoryCache.set(orgId, payload);
  await cacheReceiptSettings(orgId, payload);
  await setCatalogSyncMeta(orgId, {
    receiptSettingsPulledAt: payload.remoteUpdatedAt,
  });
}

/** Fetch full receipt settings from Supabase (always hits network). */
export async function fetchOrgReceiptSettingsRemote(
  orgId: string,
): Promise<CachedReceiptSettings> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("org_meta")
    .select(
      "vat_percent, service_percent, receipt_footer, receipt_profile, updated_at",
    )
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error || !data) {
    return {
      settings: {
        ...DEFAULT_RECEIPT_SETTINGS,
        profile: { ...DEFAULT_RECEIPT_PROFILE },
      },
      remoteUpdatedAt: null,
    };
  }
  return parseRemoteRow(data);
}

/**
 * Lightweight revision check — only returns remote updated_at.
 * Used so we skip a full download when finance receipt details are unchanged.
 */
async function fetchReceiptRevisionRemote(
  orgId: string,
): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("org_meta")
    .select("updated_at")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error || !data?.updated_at) return null;
  return String(data.updated_at);
}

/**
 * Pull receipt settings only when the remote revision changed (or no cache).
 * Returns the settings that should be used locally.
 */
export async function pullReceiptSettingsIfChanged(
  orgId: string,
  options?: { force?: boolean },
): Promise<OrgReceiptSettings> {
  const local = await readLocal(orgId);

  if (!options?.force && local && canReachCloud()) {
    try {
      const remoteAt = await fetchReceiptRevisionRemote(orgId);
      // No revision signal → trust browser cache (avoid pointless full downloads).
      if (!remoteAt) return local.settings;
      if (local.remoteUpdatedAt && remoteAt === local.remoteUpdatedAt) {
        return local.settings;
      }
      // Revision changed (or first stamped pull) → full download below.
    } catch {
      return local.settings;
    }
  }

  if (!canReachCloud() && local) return local.settings;

  const fresh = await fetchOrgReceiptSettingsRemote(orgId);
  if (
    local &&
    settingsEqual(local.settings, fresh.settings) &&
    local.remoteUpdatedAt === fresh.remoteUpdatedAt
  ) {
    return local.settings;
  }
  await writeLocal(orgId, fresh);
  return fresh.settings;
}

/**
 * Fast path for sales / prints / designer:
 * - Return browser cache immediately when present
 * - Only re-download when remote revision changed (background soft check)
 * - Await network when nothing is cached yet
 */
export async function getOrgReceiptSettings(
  orgId: string,
  options?: {
    force?: boolean;
    onFresh?: (settings: OrgReceiptSettings) => void;
  },
): Promise<OrgReceiptSettings> {
  if (options?.force) {
    const settings = await pullReceiptSettingsIfChanged(orgId, { force: true });
    options.onFresh?.(settings);
    return settings;
  }

  const local = await readLocal(orgId);
  if (local) {
    if (canReachCloud()) {
      void pullReceiptSettingsIfChanged(orgId)
        .then((fresh) => {
          if (!settingsEqual(local.settings, fresh)) {
            options?.onFresh?.(fresh);
          }
        })
        .catch(() => undefined);
    }
    return local.settings;
  }

  if (!canReachCloud()) {
    return {
      ...DEFAULT_RECEIPT_SETTINGS,
      profile: { ...DEFAULT_RECEIPT_PROFILE },
    };
  }

  const settings = await pullReceiptSettingsIfChanged(orgId, { force: true });
  options?.onFresh?.(settings);
  return settings;
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
): Promise<OrgReceiptSettings> {
  const normalized = normalizeSettings(input);
  const now = new Date().toISOString();

  const supabase = createClient();
  const { data: meta } = await supabase
    .from("org_meta")
    .select("receipt_seq, seeded")
    .eq("organization_id", orgId)
    .maybeSingle();
  const { data, error } = await supabase
    .from("org_meta")
    .upsert({
      organization_id: orgId,
      receipt_seq: meta?.receipt_seq ?? 0,
      seeded: meta?.seeded ?? false,
      vat_percent: normalized.vat_percent,
      service_percent: normalized.service_percent,
      receipt_footer: normalized.profile.footer,
      receipt_profile: normalized.profile,
      updated_at: now,
    })
    .select("updated_at")
    .single();
  if (error) throw new Error(error.message);

  // Write-through: every device that saves updates local cache immediately.
  await writeLocal(orgId, {
    settings: normalized,
    remoteUpdatedAt:
      typeof data?.updated_at === "string" ? data.updated_at : now,
  });
  return normalized;
}

/** Prefetch into browser cache (login / Sync now). */
export async function prefetchReceiptSettings(orgId: string): Promise<void> {
  if (!canReachCloud()) return;
  await pullReceiptSettingsIfChanged(orgId);
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
