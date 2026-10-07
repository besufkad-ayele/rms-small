"use client";

import { useEffect, useState } from "react";
import { assignPublicSlugAction } from "@/app/m/actions";
import {
  addAdminNoteAction,
  expireAccessAction,
  extendTrialAction,
  grantPaidMonthsAction,
  setFollowUpAction,
  startTrialAction,
  updateTenantSubscriptionAction,
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
import { includedSeatsFromFlags, packageModuleFlags, type PackageRow } from "@/lib/pricing";
import { APP_MODULE_LABELS, type AppModule, type SubStatus } from "@/lib/tenant";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";
import {
  EffectiveStatusPill,
  flagsFromSub,
  fromDatetimeLocalValue,
  Info,
  MODULES,
  ModuleCheckboxes,
  ScoreBar,
  SegmentPill,
  StatusPill,
  toDatetimeLocalValue,
  TrendBadge,
  type ModuleState,
} from "./platform-ui";
import { SectionShimmer } from "@/components/ui/Shimmer";
import { DangerZone } from "./DangerZone";
import { OrgProfileEditor } from "./OrgProfileEditor";
import { OwnerLoginCard } from "./OwnerLoginCard";
import { PaymentRecords } from "./PaymentAdmin";
import { StaffManager } from "./StaffManager";
import { ActionButton, AsyncForm, SubmitButton, throwIfError } from "./feedback";

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
  const [mods, setMods] = useState<ModuleState>(flagsFromSub(sub));
  const [pkgCode, setPkgCode] = useState(
    String(sub?.package_code || sub?.plan_code || ""),
  );
  const [trialDays, setTrialDays] = useState(14);
  const [trialMonths, setTrialMonths] = useState(0);
  const [trialEndsLocal, setTrialEndsLocal] = useState("");
  const [extendDays, setExtendDays] = useState(14);
  const [extendEndsLocal, setExtendEndsLocal] = useState("");
  const [grantMonths, setGrantMonths] = useState(1);
  const [grantEndsLocal, setGrantEndsLocal] = useState("");
  const [extraSeats, setExtraSeats] = useState(
    Number(sub?.extra_staff_seats ?? 0),
  );
  const [followUpLocal, setFollowUpLocal] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [note, setNote] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const status = effectiveStatus(sub);
  const accessEnd = accessEndOf(sub);
  const endDays = daysUntil(accessEnd);
  const seats = Number(sub?.max_staff_seats ?? 0);
  const includedSeats = includedSeatsFromFlags(mods);
  const publicSlug = String(org.public_slug || "");

  useEffect(() => {
    setMods(flagsFromSub(sub));
    setPkgCode(String(sub?.package_code || sub?.plan_code || ""));
    setExtraSeats(Number(sub?.extra_staff_seats ?? 0));
    setFollowUpLocal(toDatetimeLocalValue(sub?.follow_up_at as string | null));
    setFollowUpNote(String(sub?.follow_up_note || ""));
    if (sub?.status === "trialing" && sub.trial_ends_at) {
      setExtendEndsLocal(toDatetimeLocalValue(String(sub.trial_ends_at)));
      setTrialEndsLocal(toDatetimeLocalValue(String(sub.trial_ends_at)));
    } else if (sub?.current_period_end) {
      setGrantEndsLocal(toDatetimeLocalValue(String(sub.current_period_end)));
    }
  }, [sub]);

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
            label="Plan / package"
            value={String(sub?.plan_code || sub?.package_code || "—")}
          />
          <Info
            label="Trial ends"
            value={
              sub?.trial_ends_at
                ? formatDateTime(String(sub.trial_ends_at))
                : "—"
            }
          />
          <Info
            label="Paid access ends"
            value={
              sub?.current_period_end
                ? formatDateTime(String(sub.current_period_end))
                : "—"
            }
          />
          <Info
            label="Staff seats"
            value={`${includedSeats} included${extraSeats ? ` + ${extraSeats} extra` : ""} · ${seats || includedSeats + extraSeats} total`}
          />
          <Info
            label="Public menu"
            value={publicSlug ? `/m/${publicSlug}` : "not published"}
          />
          <Info
            label="Follow-up"
            value={
              sub?.follow_up_at
                ? formatDateTime(String(sub.follow_up_at))
                : "—"
            }
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

      <OwnerLoginCard key={orgId} row={row} flashOk={flashOk} />

      <UsagePanel
        usage={usage}
        dayKeys={usageDayKeys}
        loading={usageLoading}
        flags={flagsFromSub(sub)}
        seats={seats}
        ownerLastSignInAt={row.ownerLastSignInAt}
      />

      <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
        <h3 className="font-display text-lg">Access, trial & public menu</h3>
        <p className="mt-1 text-sm text-ink/55">
          Pick an exact end date, or add days/months. One staff seat is included
          per selected module; extra seats are a one-time add-on.
        </p>
        {mods.online ? (
          <div className="mt-3 rounded-2xl bg-teal/10 p-3 text-sm">
            <p className="text-xs font-semibold text-ink/60">Public menu URL</p>
            <p className="mt-1 font-medium">
              {publicSlug ? `/m/${publicSlug}` : "Not assigned yet"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {publicSlug ? (
                <a
                  className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-teal underline"
                  href={`/m/${publicSlug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open public page
                </a>
              ) : null}
              <ActionButton
                pendingLabel="Publishing…"
                className="rounded-lg bg-teal px-2.5 py-1 text-xs font-semibold text-white"
                onAction={async () => {
                  const res = await assignPublicSlugAction(
                    orgId,
                    String(org.name),
                    Boolean(publicSlug),
                  );
                  throwIfError(res, "Could not publish URL");
                  if ("slug" in res) {
                    await flashOk(`Public menu at /m/${res.slug}`);
                  }
                  await onReload();
                }}
              >
                {publicSlug ? "Regenerate slug" : "Publish public URL"}
              </ActionButton>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-ink/45">
            Enable Website & public ordering to publish /m/{"{slug}"} for guest
            orders.
          </p>
        )}
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="space-y-2 rounded-2xl bg-stone/40 p-3">
            <p className="text-xs font-semibold text-ink/60">Start trial</p>
            <label className="block text-xs text-ink/55">
              Ends on (preferred)
              <input
                type="datetime-local"
                className="field mt-1"
                value={trialEndsLocal}
                onChange={(e) => setTrialEndsLocal(e.target.value)}
              />
            </label>
            <p className="text-[10px] text-ink/40">
              Or use days / months below if no date set
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                className="field"
                value={trialDays}
                onChange={(e) => setTrialDays(Number(e.target.value) || 14)}
                title="Days"
              />
              <input
                type="number"
                className="field"
                value={trialMonths}
                onChange={(e) => setTrialMonths(Number(e.target.value) || 0)}
                title="Months override"
                placeholder="Months"
              />
            </div>
            <ModuleCheckboxes value={mods} onChange={setMods} dense />
            <label className="block text-xs">
              Extra staff seats (one-time)
              <input
                type="number"
                min={0}
                className="field mt-1"
                value={extraSeats}
                onChange={(e) =>
                  setExtraSeats(Math.max(0, Number(e.target.value) || 0))
                }
              />
              <span className="mt-1 block text-[10px] text-ink/40">
                {includedSeats} included from modules
                {extraSeats ? ` + ${extraSeats} extra` : ""}
              </span>
            </label>
            <label className="block text-xs">
              Package
              <select
                className="field mt-1"
                value={pkgCode}
                onChange={(e) => {
                  const code = e.target.value;
                  setPkgCode(code);
                  const pkg = packages.find((p) => p.code === code);
                  if (pkg) setMods(packageModuleFlags(pkg));
                }}
              >
                <option value="">Custom</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <ActionButton
              pendingLabel="Starting…"
              className="rounded-xl bg-teal px-3 py-2 text-xs font-semibold text-white"
              onAction={async () => {
                const res = await startTrialAction({
                  organizationId: orgId,
                  trialDays,
                  trialMonths: trialMonths || undefined,
                  trialEndsAt: fromDatetimeLocalValue(trialEndsLocal),
                  menuEnabled: mods.menu,
                  orderingEnabled: mods.ordering,
                  kitchenEnabled: mods.kitchen,
                  inventoryEnabled: mods.inventory,
                  financeEnabled: mods.finance,
                  hrEnabled: mods.hr,
                  onlineEnabled: mods.online,
                  extraStaffSeats: extraSeats,
                  packageCode: pkgCode || null,
                  issuePassword: false,
                  notes: "Trial started from restaurant detail",
                  followUpAt: fromDatetimeLocalValue(followUpLocal),
                  followUpNote: followUpNote || undefined,
                });
                throwIfError(res, "Failed");
                if ("trialEndsAt" in res) {
                  await flashOk(
                    `Trial started · ends ${formatDateTime(String(res.trialEndsAt))}`,
                  );
                }
                await onReload();
              }}
            >
              Start trial
            </ActionButton>
          </div>

          <div className="space-y-2 rounded-2xl bg-stone/40 p-3">
            <p className="text-xs font-semibold text-ink/60">Extend trial</p>
            <label className="block text-xs text-ink/55">
              New trial end date
              <input
                type="datetime-local"
                className="field mt-1"
                value={extendEndsLocal}
                onChange={(e) => setExtendEndsLocal(e.target.value)}
              />
            </label>
            <p className="text-[10px] text-ink/40">
              Or add days from current trial end
            </p>
            <input
              type="number"
              className="field"
              value={extendDays}
              onChange={(e) => setExtendDays(Number(e.target.value) || 1)}
            />
            <ActionButton
              pendingLabel="Saving…"
              className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-stone"
              onAction={async () => {
                const res = await extendTrialAction({
                  organizationId: orgId,
                  endsAt: fromDatetimeLocalValue(extendEndsLocal),
                  addDays: extendEndsLocal ? undefined : extendDays,
                  followUpAt: fromDatetimeLocalValue(followUpLocal),
                  followUpNote: followUpNote || undefined,
                });
                throwIfError(res, "Failed");
                if ("trialEndsAt" in res) {
                  await flashOk(
                    `Trial ends ${formatDateTime(String(res.trialEndsAt))}`,
                  );
                }
                await onReload();
              }}
            >
              {extendEndsLocal
                ? "Set trial end date"
                : `Extend +${extendDays} days`}
            </ActionButton>
          </div>

          <div className="space-y-2 rounded-2xl bg-stone/40 p-3">
            <p className="text-xs font-semibold text-ink/60">
              Grant paid access (no proof)
            </p>
            <label className="block text-xs text-ink/55">
              Access until
              <input
                type="datetime-local"
                className="field mt-1"
                value={grantEndsLocal}
                onChange={(e) => setGrantEndsLocal(e.target.value)}
              />
            </label>
            <p className="text-[10px] text-ink/40">
              Or add months from current period
            </p>
            <select
              className="field"
              value={grantMonths}
              onChange={(e) => setGrantMonths(Number(e.target.value))}
            >
              {[1, 3, 6, 12].map((n) => (
                <option key={n} value={n}>
                  {n} month{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
            <ActionButton
              pendingLabel="Saving…"
              className="rounded-xl bg-teal px-3 py-2 text-xs font-semibold text-white"
              onAction={async () => {
                const res = await grantPaidMonthsAction({
                  organizationId: orgId,
                  months: grantEndsLocal ? undefined : grantMonths,
                  periodEndsAt: fromDatetimeLocalValue(grantEndsLocal),
                  menuEnabled: mods.menu,
                  orderingEnabled: mods.ordering,
                  kitchenEnabled: mods.kitchen,
                  inventoryEnabled: mods.inventory,
                  financeEnabled: mods.finance,
                  hrEnabled: mods.hr,
                  onlineEnabled: mods.online,
                  extraStaffSeats: extraSeats,
                  packageCode: pkgCode || null,
                  followUpAt: fromDatetimeLocalValue(followUpLocal),
                  followUpNote: followUpNote || undefined,
                });
                throwIfError(res, "Failed");
                if ("periodEnd" in res) {
                  await flashOk(
                    `Paid until ${formatDateTime(String(res.periodEnd))}`,
                  );
                }
                await onReload();
              }}
            >
              {grantEndsLocal ? "Set paid end date" : "Grant months"}
            </ActionButton>
          </div>

          <div className="space-y-2 rounded-2xl bg-stone/40 p-3">
            <p className="text-xs font-semibold text-ink/60">Expire / cancel</p>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                pendingLabel="Expiring…"
                className="rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-xs font-semibold text-coral"
                onAction={async () => {
                  if (
                    !window.confirm(
                      `Expire access for ${String(org.name)}? Their staff lose access immediately.`,
                    )
                  )
                    return;
                  const res = await expireAccessAction({
                    organizationId: orgId,
                    mode: "expired",
                  });
                  throwIfError(res, "Failed");
                  await flashOk("Access expired");
                  await onReload();
                }}
              >
                Expire access
              </ActionButton>
              <ActionButton
                pendingLabel="Canceling…"
                className="rounded-xl border border-coral/30 px-3 py-2 text-xs font-semibold text-coral"
                onAction={async () => {
                  if (
                    !window.confirm(
                      `Cancel the subscription for ${String(org.name)}? Their staff lose access immediately.`,
                    )
                  )
                    return;
                  const res = await expireAccessAction({
                    organizationId: orgId,
                    mode: "canceled",
                  });
                  throwIfError(res, "Failed");
                  await flashOk("Subscription canceled");
                  await onReload();
                }}
              >
                Cancel
              </ActionButton>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2 rounded-2xl border border-gold/30 bg-gold/10 p-3">
          <p className="text-xs font-semibold text-ink/70">
            Follow-up reminder (check on them)
          </p>
          <p className="text-[11px] text-ink/50">
            Shows on Overview when due. Also applied when you start/extend/grant
            if set here.
          </p>
          <label className="block text-xs text-ink/55">
            Remind me at
            <input
              type="datetime-local"
              className="field mt-1"
              value={followUpLocal}
              onChange={(e) => setFollowUpLocal(e.target.value)}
            />
          </label>
          <input
            className="field"
            placeholder="What to check (call, payment, training…)"
            value={followUpNote}
            onChange={(e) => setFollowUpNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <ActionButton
              disabled={!followUpLocal}
              pendingLabel="Saving…"
              className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-stone"
              onAction={async () => {
                const at = fromDatetimeLocalValue(followUpLocal);
                if (!at) throw new Error("Pick a follow-up date/time");
                const res = await setFollowUpAction({
                  organizationId: orgId,
                  followUpAt: at,
                  followUpNote: followUpNote || null,
                });
                throwIfError(res, "Failed");
                await flashOk("Follow-up saved");
                await onReload();
              }}
            >
              Save follow-up
            </ActionButton>
            <ActionButton
              pendingLabel="Clearing…"
              className="rounded-xl border border-ink/15 px-3 py-2 text-xs font-semibold"
              onAction={async () => {
                const res = await setFollowUpAction({
                  organizationId: orgId,
                  followUpAt: null,
                });
                throwIfError(res, "Failed");
                setFollowUpLocal("");
                setFollowUpNote("");
                await flashOk("Follow-up cleared");
                await onReload();
              }}
            >
              Clear / done
            </ActionButton>
          </div>
        </div>

        <AsyncForm
          key={String(sub?.updated_at || "")}
          className="mt-4 space-y-3 rounded-2xl border border-ink/8 p-3"
          onSubmitAsync={async (fd) => {
            const res = await updateTenantSubscriptionAction({
              organizationId: orgId,
              status: String(fd.get("status")) as SubStatus,
              menuEnabled: mods.menu,
              orderingEnabled: mods.ordering,
              kitchenEnabled: mods.kitchen,
              inventoryEnabled: mods.inventory,
              financeEnabled: mods.finance,
              hrEnabled: mods.hr,
              onlineEnabled: mods.online,
              extraStaffSeats: extraSeats,
              trialDays: Number(fd.get("trialDays") || 14),
              periodMonths: Number(fd.get("periodMonths") || 0),
              notes: String(fd.get("notes") || ""),
            });
            throwIfError(res, "Update failed");
            await flashOk("Subscription updated");
            await onReload();
          }}
        >
          <p className="text-xs font-semibold text-ink/60">Edit subscription</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <select
              name="status"
              className="field"
              defaultValue={String(sub?.status || "expired")}
            >
              <option value="trialing">trialing</option>
              <option value="active">active</option>
              <option value="past_due">past_due</option>
              <option value="expired">expired</option>
              <option value="canceled">canceled</option>
            </select>
            <input
              name="trialDays"
              type="number"
              className="field"
              defaultValue={14}
              placeholder="Trial days"
            />
            <select name="periodMonths" className="field" defaultValue="0">
              <option value="0">Don’t extend</option>
              <option value="1">+1 month</option>
              <option value="3">+3 months</option>
              <option value="6">+6 months</option>
              <option value="12">+12 months</option>
            </select>
            <input
              name="extraStaffSeats"
              type="number"
              min={0}
              className="field"
              value={extraSeats}
              onChange={(e) =>
                setExtraSeats(Math.max(0, Number(e.target.value) || 0))
              }
              title="Extra staff seats"
            />
          </div>
          <ModuleCheckboxes value={mods} onChange={setMods} />
          <input
            name="notes"
            className="field"
            defaultValue={String(sub?.notes || "")}
            placeholder="Notes"
          />
          <SubmitButton
            pendingLabel="Saving…"
            className="rounded-xl bg-ink px-4 py-2 text-xs font-semibold text-stone"
          >
            Save subscription
          </SubmitButton>
        </AsyncForm>

        <div className="mt-3 flex gap-2">
          <input
            className="field flex-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add admin note"
          />
          <ActionButton
            disabled={!note.trim()}
            pendingLabel="Adding…"
            className="rounded-xl border border-ink/15 px-3 py-2 text-xs font-semibold"
            onAction={async () => {
              const res = await addAdminNoteAction({
                organizationId: orgId,
                note,
              });
              throwIfError(res, "Failed");
              setNote("");
              await flashOk("Note added");
              await onReload();
            }}
          >
            Add note
          </ActionButton>
        </div>
      </section>

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
