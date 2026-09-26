"use client";

import {
  APP_MODULE_LABELS,
  type AppModule,
} from "@/lib/tenant";
import { cn } from "@/lib/utils";
import type { PaymentProofRow } from "@/app/platform/actions";

export const MODULES: AppModule[] = [
  "menu",
  "ordering",
  "inventory",
  "finance",
  "hr",
];

export type ModuleState = Record<AppModule, boolean>;

export type PlatformSection =
  | "overview"
  | "packages"
  | "onboarding"
  | "payments"
  | "subscribers"
  | "detail";

export function flagsFromSub(
  sub: Record<string, unknown> | null | undefined,
): ModuleState {
  const inv = Boolean(sub?.inventory_enabled ?? true);
  return {
    menu:
      sub?.menu_enabled === undefined || sub?.menu_enabled === null
        ? inv
        : Boolean(sub.menu_enabled),
    ordering:
      sub?.ordering_enabled === undefined || sub?.ordering_enabled === null
        ? inv
        : Boolean(sub.ordering_enabled),
    inventory: inv,
    finance: Boolean(sub?.finance_enabled ?? true),
    hr:
      sub?.hr_enabled === undefined || sub?.hr_enabled === null
        ? true
        : Boolean(sub.hr_enabled),
  };
}

export function flagsFromProof(proof: PaymentProofRow): ModuleState {
  const hasAny = MODULES.some((m) => {
    const v = proof[`${m}_enabled` as keyof PaymentProofRow];
    return v !== null && v !== undefined;
  });
  if (!hasAny) {
    return {
      menu: true,
      ordering: true,
      inventory: true,
      finance: true,
      hr: true,
    };
  }
  return {
    menu: Boolean(proof.menu_enabled),
    ordering: Boolean(proof.ordering_enabled),
    inventory: Boolean(proof.inventory_enabled),
    finance: Boolean(proof.finance_enabled),
    hr: Boolean(proof.hr_enabled),
  };
}

export function moduleLabels(flags: ModuleState) {
  return MODULES.filter((m) => flags[m])
    .map((m) => APP_MODULE_LABELS[m])
    .join(" · ");
}

export function isVideoProof(proof: PaymentProofRow) {
  if (proof.media_kind === "video") return true;
  if (proof.media_kind === "image") return false;
  const url = String(proof.image_url || "").toLowerCase();
  return /\.(mp4|webm|mov|m4v)(\?|$)/.test(url);
}

export function ModuleCheckboxes({
  value,
  onChange,
  namePrefix,
  dense,
}: {
  value: ModuleState;
  onChange: (next: ModuleState) => void;
  namePrefix?: string;
  dense?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap gap-3 text-sm", dense && "gap-2 text-xs")}>
      {MODULES.map((m) => (
        <label key={m} className="flex items-center gap-2">
          <input
            type="checkbox"
            name={namePrefix ? `${namePrefix}_${m}` : undefined}
            checked={value[m]}
            onChange={(e) => onChange({ ...value, [m]: e.target.checked })}
          />
          {APP_MODULE_LABELS[m]}
        </label>
      ))}
    </div>
  );
}

export function ModuleChips({ flags }: { flags: ModuleState }) {
  return (
    <div className="flex flex-wrap gap-1">
      {MODULES.filter((m) => flags[m]).map((m) => (
        <span
          key={m}
          className="rounded-md bg-teal/10 px-1.5 py-0.5 text-[10px] font-medium text-teal"
        >
          {APP_MODULE_LABELS[m]}
        </span>
      ))}
    </div>
  );
}

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone/50 px-3 py-2">
      <dt className="text-[11px] text-ink/50">{label}</dt>
      <dd className="mt-0.5 break-words font-medium">{value || "—"}</dd>
    </div>
  );
}

export function StatusPill({
  status,
  tone,
}: {
  status: string;
  tone?: "teal" | "gold" | "coral" | "ink";
}) {
  const t =
    tone ||
    (status === "approved" || status === "active" || status === "trialing"
      ? "teal"
      : status === "pending" || status === "past_due"
        ? "gold"
        : status === "rejected" || status === "expired" || status === "canceled"
          ? "coral"
          : "ink");
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
        t === "teal" && "bg-teal/15 text-teal",
        t === "gold" && "bg-gold/25 text-ink",
        t === "coral" && "bg-coral/15 text-coral",
        t === "ink" && "bg-ink/8 text-ink/70",
      )}
    >
      {status}
    </span>
  );
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-3xl border border-ink/5 bg-white/70"
        />
      ))}
    </div>
  );
}

/** Format ISO → value for <input type="datetime-local"> (local timezone). */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local datetime-local string → ISO, or null if empty/invalid. */
export function fromDatetimeLocalValue(local: string): string | null {
  if (!local.trim()) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
