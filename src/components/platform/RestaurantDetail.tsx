"use client";

import { useState } from "react";
import {
  type PaymentProofRow,
  type PlatformTenantRow,
} from "@/app/platform/actions";
import { SparkLines } from "@/components/finance/SparkLines";
import {
  accessEndOf,
  daysSince,
  daysUntil,
  effectiveStatus,
  relativeDays,
  type TenantUsage,
} from "@/lib/platform-metrics";
import { includedSeatsFromFlags, type PackageRow } from "@/lib/pricing";
import { APP_MODULE_LABELS, type AppModule } from "@/lib/tenant";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";
import {
  EffectiveStatusPill,
  flagsFromSub,
  Info,
  MODULES,
  ModuleChips,
  ScoreBar,
  SegmentPill,
  StatusPill,
  TrendBadge,
  type ModuleState,
} from "./platform-ui";
import { SectionShimmer } from "@/components/ui/Shimmer";
import { DangerZone } from "./DangerZone";
import { OrgProfileEditor } from "./OrgProfileEditor";
import { OwnerLoginCard } from "./OwnerLoginCard";
import { PaymentRecords } from "./PaymentAdmin";
import { PlanAccess } from "./PlanAccess";
import { StaffManager } from "./StaffManager";
import { ActionButton } from "./feedback";

const MODULE_USAGE_HINT: Partial<Record<AppModule, string>> = {
  menu: "has menu items",
  ordering: "orders in 30d",
  kitchen: "orders in 30d",
  inventory: "stock moves in 30d",
  finance: "day close / X-report in 30d",
  hr: "active staff accounts",
  online: "guest / website orders in 30d",
};

export function RestaurantDetail({
  row,
  usage,
  usageDayKeys,
  usageLoading,
  proofs,
  packages,
  busy,
  setBusy,
  setError,
  flashOk,
  onBack,
  onOpenDoc,
  onReload,
  onDeleted,
}: {
  row: PlatformTenantRow;
  usage: TenantUsage | undefined;
  usageDayKeys: string[];
  usageLoading: boolean;
  proofs: PaymentProofRow[];
  packages: PackageRow[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  setError: (v: string | null) => void;
  flashOk: (msg: string) => Promise<void>;
  onBack: () => void;
  onOpenDoc: (path: string | null | undefined) => Promise<void> | void;
  onReload: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const org = row.organization;
  const sub = row.subscription;
  const orgId = String(org.id);
  const loginEmail = String(
    row.ownerAuthEmail || row.owner?.email || org.email || "",
  );
  const [editingProfile, setEditingProfile] = useState(false);
  const status = effectiveStatus(sub);
  const accessEnd = accessEndOf(sub);
  const endDays = daysUntil(accessEnd);
  const savedFlags = flagsFromSub(sub);
  const includedSeats = includedSeatsFromFlags(savedFlags);
  const extraSeats = Number(sub?.extra_staff_seats ?? 0);
  const seats = Number(sub?.max_staff_seats ?? includedSeats + extraSeats);
  const publicSlug = String(org.public_slug || "");
  const staffInUse = usage?.staffActive;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-xs font-medium text-teal underline"
      >
        ← Back to subscribers
      </button>

      <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">{String(org.name)}</h2>
            <p className="text-sm text-ink/60">
              {String(org.org_type)} · {String(org.city || "—")}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <StatusPill
                status={`KYC ${String(org.verification_status || "pending")}`}
                tone={
                  org.verification_status === "approved"
                    ? "teal"
                    : org.verification_status === "rejected"
                      ? "coral"
                      : "gold"
                }
              />
              <EffectiveStatusPill status={status} />
              {usage ? <SegmentPill segment={usage.segment} /> : null}
            </div>
            <div className="mt-2">
              <ModuleChips flags={savedFlags} />
            </div>
          </div>
          <div className="text-right text-sm">
            <p
              className={cn(
                "font-semibold",
                endDays !== null && endDays <= 7 ? "text-coral" : "text-ink",
              )}
            >
              {accessEnd ? `Access ends ${relativeDays(endDays)}` : "No end date"}
            </p>
            <p className="text-xs text-ink/50">
              {accessEnd ? formatDateTime(accessEnd) : "—"}
            </p>
            <a href="#plan-access" className="mt-2 block font-display text-2xl leading-none">
              {seats}
            </a>
            <a href="#plan-access" className="text-[11px] text-ink/50 underline">
              staff seats
              {staffInUse !== undefined ? ` · ${staffInUse} in use` : ""}
            </a>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Info
            label="Monthly value"
            value={
              row.billing.monthlyEtb > 0
                ? `${formatMoney(row.billing.monthlyEtb)}${row.billing.monthlySource === "catalog" ? " (list price)" : ""}`
                : "—"
            }
          />
          <Info
            label="Lifetime paid"
            value={formatMoney(row.billing.lifetimePaidEtb)}
          />
          <Info
            label="Approved payments"
            value={String(row.billing.approvedPayments)}
          />
          <Info
            label="Last paid"
            value={
              row.billing.lastPaidAt
                ? formatDateTime(row.billing.lastPaidAt)
                : "never"
            }
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
            Restaurant details
          </p>
          <button
            type="button"
            onClick={() => setEditingProfile((v) => !v)}
            className="rounded-lg border border-ink/15 px-2.5 py-1 text-xs font-medium"
          >
            {editingProfile ? "Close edit" : "Edit details"}
          </button>
        </div>

        {editingProfile ? (
          <OrgProfileEditor
            key={String(org.updated_at || "")}
            row={row}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            flashOk={flashOk}
            onReload={onReload}
            onDone={() => setEditingProfile(false)}
          />
        ) : null}

        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Owner" value={String(row.owner?.full_name || "—")} />
          <Info label="Auth email" value={loginEmail || "—"} />
          <Info label="Owner phone" value={String(row.owner?.phone || "—")} />
          <Info label="Business email" value={String(org.email || "—")} />
          <Info label="Business phone" value={String(org.phone || "—")} />
          <Info label="Address" value={String(org.address || "—")} />
          <Info
            label="City / region"
            value={`${org.city || "—"}, ${org.region || "—"}`}
          />
          <Info label="Country" value={String(org.country || "—")} />
          <Info label="TIN" value={String(org.tin || "—")} />
          <Info label="VAT" value={String(org.vat_number || "—")} />
          <Info label="Website" value={String(org.website || "—")} />
          <Info
            label="Public menu"
            value={publicSlug ? `/m/${publicSlug}` : "not published"}
          />
          <Info
            label="Staff seats"
            value={`${includedSeats} included${extraSeats ? ` + ${extraSeats} extra` : ""} · ${seats} total`}
          />
        </dl>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <ActionButton
            className="rounded-lg bg-stone px-2 py-1 underline"
            disabled={!org.business_license_url}
            pendingLabel="Opening…"
            onAction={async () => onOpenDoc(org.business_license_url as string)}
          >
            License
          </ActionButton>
          <ActionButton
            className="rounded-lg bg-stone px-2 py-1 underline"
            disabled={!org.id_document_url}
            pendingLabel="Opening…"
            onAction={async () => onOpenDoc(org.id_document_url as string)}
          >
            ID document
          </ActionButton>
        </div>

        {org.admin_notes ? (
          <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-stone/50 p-3 text-xs text-ink/70">
            {String(org.admin_notes)}
          </pre>
        ) : null}
      </section>

      <PlanAccess
        key={`${String(sub?.updated_at || "")}:${String(org.updated_at || "")}:${publicSlug}`}
        row={row}
        usage={usage}
        packages={packages}
        flashOk={flashOk}
        onReload={onReload}
      />

      <OwnerLoginCard key={orgId} row={row} flashOk={flashOk} />

      <UsagePanel
        usage={usage}
        dayKeys={usageDayKeys}
        loading={usageLoading}
        flags={flagsFromSub(sub)}
        seats={seats}
        ownerLastSignInAt={row.ownerLastSignInAt}
      />

      <PaymentRecords
        organizationId={orgId}
        proofs={proofs}
        packages={packages}
        busy={busy}
        setBusy={setBusy}
        setError={setError}
        flashOk={flashOk}
        onChanged={onReload}
      />

      <StaffManager
        organizationId={orgId}
        seats={seats}
        busy={busy}
        setBusy={setBusy}
        setError={setError}
        flashOk={flashOk}
      />

      <DangerZone
        organizationId={orgId}
        organizationName={String(org.name)}
        busy={busy}
        setBusy={setBusy}
        setError={setError}
        flashOk={flashOk}
        onReload={onReload}
        onDeleted={onDeleted}
      />
    </div>
  );
}

function UsagePanel({
  usage,
  dayKeys,
  loading,
  flags,
  seats,
  ownerLastSignInAt,
}: {
  usage: TenantUsage | undefined;
  dayKeys: string[];
  loading: boolean;
  flags: ModuleState;
  seats: number;
  ownerLastSignInAt: string | null;
}) {
  if (!usage) {
    if (loading) return <SectionShimmer variant="usage" />;
    return (
      <section className="rounded-3xl border border-ink/8 bg-white p-4 text-sm text-ink/50 sm:p-5">
        No usage data for this restaurant yet.
      </section>
    );
  }
  const lastOrder = daysSince(usage.lastOrderAt);
  const signIn = daysSince(ownerLastSignInAt);
  const labels = dayKeys.map((k) =>
    new Date(`${k}T12:00:00`).toLocaleDateString("en", {
      month: "short",
      day: "numeric",
    }),
  );

  return (
    <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg">Usage · last 30 days</h3>
        <span className="flex items-center gap-2">
          <SegmentPill segment={usage.segment} />
          <ScoreBar score={usage.score} />
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl bg-stone/50 px-3 py-2">
          <dt className="text-[11px] text-ink/50">Orders</dt>
          <dd className="mt-0.5 font-medium">
            {usage.orders30d}{" "}
            <TrendBadge current={usage.orders30d} previous={usage.ordersPrev30d} />
          </dd>
        </div>
        <Info label="Paid sales" value={formatMoney(usage.sales30d)} />
        <Info label="Active days" value={`${usage.activeDays30d} / 30`} />
        <Info label="Orders last 7d" value={String(usage.orders7d)} />
        <Info
          label="Last order"
          value={lastOrder === null ? "none in 60 days" : relativeDays(-lastOrder)}
        />
        <Info
          label="Owner last sign-in"
          value={signIn === null ? "never" : relativeDays(-signIn)}
        />
      </dl>

      <div className="mt-4">
        <SparkLines
          labels={labels}
          series={[
            {
              key: "sales",
              label: "Paid sales",
              values: usage.dailySales,
              color: "#0f766e",
            },
          ]}
          details={usage.dailyOrders.map((orders) => ({ orders }))}
          height={160}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-xs font-semibold text-ink/60">Module adoption</p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {MODULES.map((m) => {
              const enabled = flags[m];
              const hint = MODULE_USAGE_HINT[m];
              const used = usage.modulesUsed.includes(m);
              return (
                <li
                  key={m}
                  title={hint ? `Counted as used when it ${hint}` : undefined}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-3 py-1.5 text-xs",
                    !enabled
                      ? "bg-stone/30 text-ink/35"
                      : used
                        ? "bg-teal/10 text-teal"
                        : "bg-coral/10 text-coral",
                  )}
                >
                  <span className="font-medium">{APP_MODULE_LABELS[m]}</span>
                  <span>
                    {!enabled
                      ? "not in plan"
                      : !hint
                        ? "enabled"
                        : used
                          ? "in use"
                          : "paid for, not used"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Info
            label="Staff seats"
            value={`${usage.staffActive} / ${seats || "—"}${seats > 0 && usage.staffActive >= seats ? " · full (upsell)" : ""}`}
          />
          <Info label="Menu items" value={String(usage.menuItems)} />
          <Info label="Inventory items" value={String(usage.inventoryItems)} />
          <Info
            label="Day closes (30d)"
            value={String(usage.dayCloses30d)}
          />
        </div>
      </div>
    </section>
  );
}
