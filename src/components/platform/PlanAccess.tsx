"use client";

import { useState } from "react";
import { assignPublicSlugAction } from "@/app/m/actions";
import {
  addAdminNoteAction,
  expireAccessAction,
  extendTrialAction,
  grantPaidMonthsAction,
  setFollowUpAction,
  startTrialAction,
  updateStaffSeatsAction,
  updateTenantFeaturesAction,
  updateTenantSubscriptionAction,
  type PlatformTenantRow,
} from "@/app/platform/actions";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import {
  accessEndOf,
  daysUntil,
  effectiveStatus,
  relativeDays,
  type TenantUsage,
} from "@/lib/platform-metrics";
import {
  includedSeatsFromFlags,
  packageModuleFlags,
  type PackageRow,
} from "@/lib/pricing";
import { type SubStatus } from "@/lib/tenant";
import { cn, formatDateTime } from "@/lib/utils";
import { ActionButton, throwIfError } from "./feedback";
import {
  EffectiveStatusPill,
  flagsFromSub,
  fromDatetimeLocalValue,
  Info,
  ModuleCheckboxes,
  toDatetimeLocalValue,
  type ModuleState,
} from "./platform-ui";

type AccessTab = "subscription" | "trial" | "features";

const TABS: { id: AccessTab; label: string }[] = [
  { id: "subscription", label: "Subscription" },
  { id: "trial", label: "Trial" },
  { id: "features", label: "Features" },
];

function upcomingLocal(iso: unknown) {
  if (!iso) return "";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return "";
  return toDatetimeLocalValue(String(iso));
}

function matchingPackageCode(
  sub: Record<string, unknown> | null,
  packages: PackageRow[],
  flags: ModuleState,
) {
  const code = String(sub?.package_code || "");
  const pkg = packages.find((p) => p.code === code);
  if (!pkg) return "";
  const pkgFlags = packageModuleFlags(pkg);
  const same = (Object.keys(flags) as (keyof ModuleState)[]).every(
    (key) => Boolean(pkgFlags[key]) === Boolean(flags[key]),
  );
  return same ? code : "";
}

function modulePayload(mods: ModuleState) {
  return {
    menuEnabled: mods.menu,
    orderingEnabled: mods.ordering,
    kitchenEnabled: mods.kitchen,
    inventoryEnabled: mods.inventory,
    financeEnabled: mods.finance,
    hrEnabled: mods.hr,
    onlineEnabled: mods.online,
  };
}

export function PlanAccess({
  row,
  usage,
  packages,
  flashOk,
  onReload,
}: {
  row: PlatformTenantRow;
  usage: TenantUsage | undefined;
  packages: PackageRow[];
  flashOk: (msg: string) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const org = row.organization;
  const sub = row.subscription;
  const orgId = String(org.id);
  const publicSlug = String(org.public_slug || "");
  const savedFlags = flagsFromSub(sub);
  const savedIncluded = includedSeatsFromFlags(savedFlags);
  const savedExtra = Number(sub?.extra_staff_seats ?? 0);
  const savedTotal = Number(sub?.max_staff_seats ?? savedIncluded + savedExtra);
  const staffInUse = usage?.staffActive;
  const status = effectiveStatus(sub);
  const accessEnd = accessEndOf(sub);
  const endDays = daysUntil(accessEnd);

  const [tab, setTab] = useState<AccessTab>("subscription");
  const [mods, setMods] = useState<ModuleState>(savedFlags);
  const [pkgCode, setPkgCode] = useState(() =>
    matchingPackageCode(sub, packages, savedFlags),
  );
  const [seatTotal, setSeatTotal] = useState(savedTotal);
  const [statusDraft, setStatusDraft] = useState<SubStatus>(
    (String(sub?.status || "expired") as SubStatus) || "expired",
  );
  const [subNotes, setSubNotes] = useState(String(sub?.notes || ""));
  const [trialDays, setTrialDays] = useState(14);
  const [trialMonths, setTrialMonths] = useState(0);
  const onTrial = sub?.status === "trialing";
  const [trialEndsLocal, setTrialEndsLocal] = useState(() =>
    onTrial ? upcomingLocal(sub?.trial_ends_at) : "",
  );
  const [extendDays, setExtendDays] = useState(14);
  const [extendEndsLocal, setExtendEndsLocal] = useState(() =>
    onTrial ? upcomingLocal(sub?.trial_ends_at) : "",
  );
  const [grantMonths, setGrantMonths] = useState(1);
  const [grantEndsLocal, setGrantEndsLocal] = useState(() =>
    onTrial ? "" : upcomingLocal(sub?.current_period_end),
  );
  const [followUpLocal, setFollowUpLocal] = useState(() =>
    toDatetimeLocalValue(sub?.follow_up_at as string | null),
  );
  const [followUpNote, setFollowUpNote] = useState(
    String(sub?.follow_up_note || ""),
  );
  const [note, setNote] = useState("");

  const draftIncluded = includedSeatsFromFlags(mods);
  const draftExtra =
    seatTotal >= draftIncluded ? seatTotal - draftIncluded : savedExtra;
  const seatFloor = savedIncluded;
  const seatsFull =
    staffInUse !== undefined && savedTotal > 0 && staffInUse >= savedTotal;

  return (
    <section
      id="plan-access"
      className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-lg">Plan</h3>
          <p className="mt-1 text-sm text-ink/55">
            Seats, subscription, trial, and the features this place has.
          </p>
        </div>
        <EffectiveStatusPill status={status} />
      </div>

      <div className="mt-4 rounded-2xl border border-ink/10 bg-stone/40 p-3 sm:p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              Staff seats
            </p>
            <p className="mt-1 font-display text-3xl leading-none">{savedTotal}</p>
            <p className="mt-1 text-xs text-ink/55">
              {savedIncluded} included with features
              {savedExtra ? ` · ${savedExtra} extra` : " · no extra seats"}
              {staffInUse !== undefined ? ` · ${staffInUse} in use` : ""}
              {seatsFull ? " · full" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block text-xs text-ink/55">
              Set total
              <input
                type="number"
                min={seatFloor}
                className="field mt-1 w-24"
                value={seatTotal}
                onChange={(e) =>
                  setSeatTotal(Math.max(0, Number(e.target.value) || 0))
                }
              />
            </label>
            <button
              type="button"
              className="rounded-xl border border-ink/15 px-3 py-2 text-xs font-semibold"
              onClick={() => setSeatTotal((n) => n + 1)}
            >
              +1
            </button>
            <ActionButton
              disabled={seatTotal === savedTotal || seatTotal < seatFloor}
              pendingLabel="Saving…"
              className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-stone disabled:opacity-40"
              onAction={async () => {
                const res = await updateStaffSeatsAction({
                  organizationId: orgId,
                  maxStaffSeats: seatTotal,
                });
                throwIfError(res, "Could not update seats");
                const next =
                  ("maxStaffSeats" in res ? res.maxStaffSeats : null) ??
                  seatTotal;
                await flashOk(
                  next > savedTotal
                    ? `Seats increased to ${next}`
                    : `Seats set to ${next}`,
                );
                await onReload();
              }}
            >
              {seatTotal > savedTotal ? "Increase seats" : "Update seats"}
            </ActionButton>
          </div>
        </div>
        {seatTotal < seatFloor ? (
          <p className="mt-2 text-xs text-coral">
            Total cannot go below {seatFloor} included with the current features.
            Turn a feature off first if you need a smaller cap.
          </p>
        ) : (
          <p className="mt-2 text-xs text-ink/45">
            One seat is included per feature. Raising the total adds extra seats
            and does not change the trial or paid dates.
            {staffInUse !== undefined && seatTotal < staffInUse
              ? ` ${staffInUse} staff are already active, so a lower cap will not remove them.`
              : ""}
          </p>
        )}
      </div>

      <SegmentedTabs
        className="mt-4"
        size="sm"
        tabs={TABS}
        value={tab}
        onChange={setTab}
      />

      {tab === "subscription" ? (
        <div className="mt-4 space-y-3">
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <Info
              label="Package"
              value={String(sub?.package_code || sub?.plan_code || "custom")}
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
              label="Access"
              value={
                accessEnd
                  ? `${relativeDays(endDays)} · ${formatDateTime(accessEnd)}`
                  : "No end date"
              }
            />
          </dl>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2 rounded-2xl bg-stone/40 p-3">
              <p className="text-xs font-semibold text-ink/60">Status</p>
              <select
                className="field"
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value as SubStatus)}
              >
                <option value="trialing">trialing</option>
                <option value="active">active</option>
                <option value="past_due">past_due</option>
                <option value="expired">expired</option>
                <option value="canceled">canceled</option>
              </select>
              <input
                className="field"
                value={subNotes}
                onChange={(e) => setSubNotes(e.target.value)}
                placeholder="Subscription notes"
              />
              <ActionButton
                pendingLabel="Saving…"
                className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-stone"
                onAction={async () => {
                  const res = await updateTenantSubscriptionAction({
                    organizationId: orgId,
                    status: statusDraft,
                    ...modulePayload(savedFlags),
                    extraStaffSeats: savedExtra,
                    keepDates: true,
                    notes: subNotes,
                  });
                  throwIfError(res, "Could not update subscription");
                  await flashOk("Subscription updated");
                  await onReload();
                }}
              >
                Save status
              </ActionButton>
              <p className="text-[11px] text-ink/40">
                Saves status and notes only. Trial length and paid end dates stay
                as they are.
              </p>
            </div>

            <div className="space-y-2 rounded-2xl bg-stone/40 p-3">
              <p className="text-xs font-semibold text-ink/60">
                Grant paid access
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
                Or add months from the current period
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
                    ...modulePayload(mods),
                    extraStaffSeats: draftExtra,
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
              <p className="text-[11px] text-ink/40">
                Applies the features and seat total currently set on this page.
              </p>
            </div>
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

          <div className="space-y-2 rounded-2xl border border-gold/30 bg-gold/10 p-3">
            <p className="text-xs font-semibold text-ink/70">Follow-up reminder</p>
            <p className="text-[11px] text-ink/50">
              Shows on Overview when due. Also applied when you start a trial or
              grant paid access if it is set here.
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

          <div className="flex gap-2">
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
        </div>
      ) : null}

      {tab === "trial" ? (
        <div className="mt-4 space-y-3">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <Info
              label="Trial ends"
              value={
                sub?.trial_ends_at
                  ? formatDateTime(String(sub.trial_ends_at))
                  : "No trial end date"
              }
            />
            <Info
              label="Status"
              value={String(sub?.status || "—")}
            />
          </dl>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2 rounded-2xl bg-stone/40 p-3">
              <p className="text-xs font-semibold text-ink/60">Start trial</p>
              <label className="block text-xs text-ink/55">
                Ends on
                <input
                  type="datetime-local"
                  className="field mt-1"
                  value={trialEndsLocal}
                  onChange={(e) => setTrialEndsLocal(e.target.value)}
                />
              </label>
              <p className="text-[10px] text-ink/40">
                Or use days / months when no date is set
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-ink/55">
                  Days
                  <input
                    type="number"
                    className="field mt-1"
                    value={trialDays}
                    onChange={(e) => setTrialDays(Number(e.target.value) || 14)}
                  />
                </label>
                <label className="block text-xs text-ink/55">
                  Months
                  <input
                    type="number"
                    className="field mt-1"
                    value={trialMonths}
                    onChange={(e) => setTrialMonths(Number(e.target.value) || 0)}
                    placeholder="0"
                  />
                </label>
              </div>
              <ActionButton
                pendingLabel="Starting…"
                className="rounded-xl bg-teal px-3 py-2 text-xs font-semibold text-white"
                onAction={async () => {
                  const res = await startTrialAction({
                    organizationId: orgId,
                    trialDays,
                    trialMonths: trialMonths || undefined,
                    trialEndsAt: fromDatetimeLocalValue(trialEndsLocal),
                    ...modulePayload(mods),
                    extraStaffSeats: draftExtra,
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
              <p className="text-[11px] text-ink/40">
                Uses the features on the Features tab and the seat total above.
              </p>
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
                Or add days from the current trial end
              </p>
              <label className="block text-xs text-ink/55">
                Days to add
                <input
                  type="number"
                  className="field mt-1"
                  value={extendDays}
                  onChange={(e) => setExtendDays(Number(e.target.value) || 1)}
                />
              </label>
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
          </div>
        </div>
      ) : null}

      {tab === "features" ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-ink/55">
            Each selected feature includes one staff seat. Extra seats stay put,
            so the total moves with the features you turn on or off.
          </p>
          <label className="block text-xs text-ink/55">
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
          <ModuleCheckboxes
            value={mods}
            onChange={(next) => {
              setMods(next);
              setPkgCode("");
            }}
          />
          <p
            className={cn(
              "text-xs",
              draftIncluded === savedIncluded ? "text-ink/45" : "text-ink/70",
            )}
          >
            {draftIncluded} feature{draftIncluded === 1 ? "" : "s"} selected ·{" "}
            {draftIncluded} included seat{draftIncluded === 1 ? "" : "s"}
            {savedExtra ? ` + ${savedExtra} extra` : ""} ·{" "}
            {draftIncluded + savedExtra} total after save
          </p>
          <ActionButton
            pendingLabel="Saving…"
            className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-stone"
            onAction={async () => {
              const res = await updateTenantFeaturesAction({
                organizationId: orgId,
                ...modulePayload(mods),
                packageCode: pkgCode || null,
              });
              throwIfError(res, "Could not update features");
              const next =
                ("maxStaffSeats" in res ? res.maxStaffSeats : null) ??
                draftIncluded + savedExtra;
              await flashOk(`Features saved · ${next} seats`);
              await onReload();
            }}
          >
            Save features
          </ActionButton>

          {mods.online ? (
            <div className="rounded-2xl bg-teal/10 p-3 text-sm">
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
            <p className="text-xs text-ink/45">
              Turn on Website & public ordering to publish a guest menu at
              /m/{"{slug}"}.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
