import { createClient } from "@/lib/supabase/client";

/** Filter / grouping kind for finance. */
export type PaymentKind = "cash" | "bank" | "telebirr" | "other";

export type OrgPaymentMethod = {
  id: string;
  label: string;
  kind: PaymentKind;
  enabled: boolean;
};

export type OrgPaymentMethods = {
  methods: OrgPaymentMethod[];
};

export const DEFAULT_PAYMENT_METHODS: OrgPaymentMethods = {
  methods: [
    { id: "cash", label: "Cash", kind: "cash", enabled: true },
    { id: "cbe", label: "CBE", kind: "bank", enabled: true },
    { id: "telebirr", label: "Telebirr", kind: "telebirr", enabled: true },
    { id: "other", label: "Other", kind: "other", enabled: true },
  ],
};

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  cash: "Cash",
  bank: "Banks",
  telebirr: "Telebirr",
  other: "Other",
};

const KINDS = new Set<PaymentKind>(["cash", "bank", "telebirr", "other"]);

export function slugPaymentId(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base ? `custom-${base}` : `custom-${Date.now().toString(36)}`;
}

export function kindForMethodId(
  id: string,
  catalog?: OrgPaymentMethod[],
): PaymentKind {
  const hit = catalog?.find((m) => m.id === id);
  if (hit) return hit.kind;
  if (id === "cash") return "cash";
  if (id === "telebirr") return "telebirr";
  if (id === "cbe") return "bank";
  if (id === "other") return "other";
  return "other";
}

export function labelForMethodId(
  id: string,
  catalog?: OrgPaymentMethod[],
): string {
  const hit = catalog?.find((m) => m.id === id);
  if (hit) return hit.label;
  if (id === "cash") return "Cash";
  if (id === "cbe") return "CBE";
  if (id === "telebirr") return "Telebirr";
  if (id === "other") return "Other";
  return id.replace(/^custom-/, "").replace(/-/g, " ") || id;
}

function normalize(raw: unknown): OrgPaymentMethods {
  const o = (raw && typeof raw === "object" ? raw : {}) as {
    methods?: unknown;
    enabled?: unknown;
  };

  // New shape
  if (Array.isArray(o.methods)) {
    const methods: OrgPaymentMethod[] = [];
    for (const row of o.methods) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = String(r.id || "").trim();
      const label = String(r.label || "").trim();
      if (!id || !label) continue;
      const kindRaw = String(r.kind || kindForMethodId(id)) as PaymentKind;
      const kind = KINDS.has(kindRaw) ? kindRaw : kindForMethodId(id);
      methods.push({
        id,
        label,
        kind,
        enabled: r.enabled !== false,
      });
    }
    if (!methods.some((m) => m.id === "cash")) {
      methods.unshift({
        id: "cash",
        label: "Cash",
        kind: "cash",
        enabled: true,
      });
    } else {
      const cash = methods.find((m) => m.id === "cash")!;
      cash.enabled = true;
      cash.kind = "cash";
    }
    return { methods };
  }

  // Legacy: { enabled: ["cash","cbe",...] }
  if (Array.isArray(o.enabled)) {
    const enabled = new Set(
      o.enabled.map((x) => String(x)).filter(Boolean),
    );
    enabled.add("cash");
    return {
      methods: DEFAULT_PAYMENT_METHODS.methods.map((m) => ({
        ...m,
        enabled: enabled.has(m.id),
      })),
    };
  }

  return {
    methods: DEFAULT_PAYMENT_METHODS.methods.map((m) => ({ ...m })),
  };
}

export function enabledPaymentMethods(
  cfg: OrgPaymentMethods,
): OrgPaymentMethod[] {
  return cfg.methods.filter((m) => m.enabled);
}

export async function getOrgPaymentMethods(
  orgId: string,
): Promise<OrgPaymentMethods> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("org_meta")
    .select("payment_methods")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error || !data) {
    return {
      methods: DEFAULT_PAYMENT_METHODS.methods.map((m) => ({ ...m })),
    };
  }
  try {
    return normalize(data.payment_methods);
  } catch {
    return {
      methods: DEFAULT_PAYMENT_METHODS.methods.map((m) => ({ ...m })),
    };
  }
}

export async function saveOrgPaymentMethods(
  orgId: string,
  methods: OrgPaymentMethods,
): Promise<OrgPaymentMethods> {
  const next = normalize(methods);
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("org_meta")
    .select("organization_id")
    .eq("organization_id", orgId)
    .maybeSingle();

  const payload = { payment_methods: next };
  if (existing) {
    const { error } = await supabase
      .from("org_meta")
      .update(payload)
      .eq("organization_id", orgId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("org_meta").insert({
      organization_id: orgId,
      receipt_seq: 0,
      seeded: false,
      ...payload,
    });
    if (error) throw new Error(error.message);
  }
  return next;
}
