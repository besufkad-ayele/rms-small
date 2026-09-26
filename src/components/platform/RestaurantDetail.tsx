"use client";

import { useEffect, useState } from "react";
import {
  addAdminNoteAction,
  expireAccessAction,
  extendTrialAction,
  grantPaidMonthsAction,
  resetSubscriberPasswordAction,
  setFollowUpAction,
  startTrialAction,
  updateTenantSubscriptionAction,
  type PaymentProofRow,
  type PlatformTenantRow,
} from "@/app/platform/actions";
import { packageModuleFlags, type PackageRow } from "@/lib/pricing";
import type { SubStatus } from "@/lib/tenant";
import { formatDateTime, formatMoney } from "@/lib/utils";
import {
  flagsFromSub,
  fromDatetimeLocalValue,
  Info,
  ModuleCheckboxes,
  StatusPill,
  toDatetimeLocalValue,
  type ModuleState,
} from "./platform-ui";

export function RestaurantDetail({
  row,
  proofs,
  packages,
  busy,
  setBusy,
  setError,
  flashOk,
  onBack,
  onOpenDoc,
  onReload,
}: {
  row: PlatformTenantRow;
  proofs: PaymentProofRow[];
  packages: PackageRow[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  setError: (v: string | null) => void;
  flashOk: (msg: string) => Promise<void>;
  onBack: () => void;
  onOpenDoc: (path: string | null | undefined) => void;
  onReload: () => Promise<void>;
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
  const [followUpLocal, setFollowUpLocal] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [note, setNote] = useState("");
  const [visiblePassword, setVisiblePassword] = useState(
    String(org.platform_login_password || ""),
  );
  const [showPassword, setShowPassword] = useState(true);

  useEffect(() => {
    setMods(flagsFromSub(sub));
    setPkgCode(String(sub?.package_code || sub?.plan_code || ""));
    setFollowUpLocal(toDatetimeLocalValue(sub?.follow_up_at as string | null));
    setFollowUpNote(String(sub?.follow_up_note || ""));
    setVisiblePassword(String(org.platform_login_password || ""));
    if (sub?.status === "trialing" && sub.trial_ends_at) {
      setExtendEndsLocal(toDatetimeLocalValue(String(sub.trial_ends_at)));
      setTrialEndsLocal(toDatetimeLocalValue(String(sub.trial_ends_at)));
    } else if (sub?.current_period_end) {
      setGrantEndsLocal(toDatetimeLocalValue(String(sub.current_period_end)));
    }
  }, [sub, org.platform_login_password]);

  async function resetPasswordHere() {
    setBusy(true);
    const res = await resetSubscriberPasswordAction(orgId);
    setBusy(false);
    if ("error" in res) {
      setError(String(res.error ?? "Reset failed"));
      return;
    }
    setVisiblePassword(res.password);
    setShowPassword(true);
    await flashOk("New password issued — copy and send to the owner.");
    await onReload();
  }

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
                status={String(org.verification_status || "pending")}
              />
              <StatusPill status={String(sub?.status || "—")} />
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-gold/40 bg-gold/15 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">
                Owner login
              </p>
              <p className="mt-1 break-all font-mono text-sm">
                Email: <strong>{loginEmail || "—"}</strong>
              </p>
              <p className="mt-1 font-mono text-sm">
                Password:{" "}
                {visiblePassword ? (
                  <strong>
                    {showPassword ? visiblePassword : "••••••••••••"}
                  </strong>
                ) : (
                  <span className="font-sans text-ink/55">
                    Not stored here — owner still uses signup password. Reset to
                    issue a password you can see and copy.
                  </span>
                )}
              </p>
              <p className="mt-1 text-[11px] text-ink/45">Login: /login</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {visiblePassword ? (
                <>
                  <button
                    type="button"
                    className="rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs font-medium"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-stone"
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        `Aramis Product login\nEmail: ${loginEmail}\nPassword: ${visiblePassword}\nURL: ${window.location.origin}/login`,
                      )
                    }
                  >
                    Copy for SMS
                  </button>
                </>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void resetPasswordHere()}
                className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-xs font-semibold"
              >
                Reset & show password
              </button>
            </div>
          </div>
        </div>

        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
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
            label="Period ends"
            value={
              sub?.current_period_end
                ? formatDateTime(String(sub.current_period_end))
                : "—"
            }
          />
          <Info
            label="Staff seats"
            value={String(sub?.max_staff_seats ?? "—")}
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
          <button
            type="button"
            className="rounded-lg bg-stone px-2 py-1 underline disabled:opacity-40"
            disabled={!org.business_license_url}
            onClick={() => onOpenDoc(org.business_license_url as string)}
          >
            License
          </button>
          <button
            type="button"
            className="rounded-lg bg-stone px-2 py-1 underline disabled:opacity-40"
            disabled={!org.id_document_url}
            onClick={() => onOpenDoc(org.id_document_url as string)}
          >
            ID document
          </button>
        </div>

        {org.admin_notes ? (
          <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-stone/50 p-3 text-xs text-ink/70">
            {String(org.admin_notes)}
          </pre>
        ) : null}
      </section>

      <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
        <h3 className="font-display text-lg">Access actions</h3>
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
            <button
              type="button"
              disabled={busy}
              className="rounded-xl bg-teal px-3 py-2 text-xs font-semibold text-white"
              onClick={() => {
                void (async () => {
                  setBusy(true);
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
                    packageCode: pkgCode || null,
                    issuePassword: false,
                    notes: "Trial started from restaurant detail",
                    followUpAt: fromDatetimeLocalValue(followUpLocal),
                    followUpNote: followUpNote || undefined,
                  });
                  setBusy(false);
                  if ("error" in res) {
                    setError(String(res.error ?? "Failed"));
                    return;
                  }
                  await flashOk(
                    `Trial started · ends ${formatDateTime(res.trialEndsAt)}`,
                  );
                  await onReload();
                })();
              }}
            >
              Start trial
            </button>
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
            <button
              type="button"
              disabled={busy}
              className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-stone"
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  const res = await extendTrialAction({
                    organizationId: orgId,
                    endsAt: fromDatetimeLocalValue(extendEndsLocal),
                    addDays: extendEndsLocal ? undefined : extendDays,
                    followUpAt: fromDatetimeLocalValue(followUpLocal),
                    followUpNote: followUpNote || undefined,
                  });
                  setBusy(false);
                  if ("error" in res) {
                    setError(String(res.error ?? "Failed"));
                    return;
                  }
                  await flashOk(
                    `Trial ends ${formatDateTime(res.trialEndsAt)}`,
                  );
                  await onReload();
                })();
              }}
            >
              {extendEndsLocal
                ? "Set trial end date"
                : `Extend +${extendDays} days`}
            </button>
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
            <button
              type="button"
              disabled={busy}
              className="rounded-xl bg-teal px-3 py-2 text-xs font-semibold text-white"
              onClick={() => {
                void (async () => {
                  setBusy(true);
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
                    packageCode: pkgCode || null,
                    followUpAt: fromDatetimeLocalValue(followUpLocal),
                    followUpNote: followUpNote || undefined,
                  });
                  setBusy(false);
                  if ("error" in res) {
                    setError(String(res.error ?? "Failed"));
                    return;
                  }
                  await flashOk(
                    `Paid until ${formatDateTime(res.periodEnd)}`,
                  );
                  await onReload();
                })();
              }}
            >
              {grantEndsLocal ? "Set paid end date" : "Grant months"}
            </button>
          </div>

          <div className="space-y-2 rounded-2xl bg-stone/40 p-3">
            <p className="text-xs font-semibold text-ink/60">Expire / cancel</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className="rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-xs font-semibold text-coral"
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    const res = await expireAccessAction({
                      organizationId: orgId,
                      mode: "expired",
                    });
                    setBusy(false);
                    if ("error" in res) {
                      setError(String(res.error ?? "Failed"));
                      return;
                    }
                    await flashOk("Access expired");
                    await onReload();
                  })();
                }}
              >
                Expire access
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-xl border border-coral/30 px-3 py-2 text-xs font-semibold text-coral"
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    const res = await expireAccessAction({
                      organizationId: orgId,
                      mode: "canceled",
                    });
                    setBusy(false);
                    if ("error" in res) {
                      setError(String(res.error ?? "Failed"));
                      return;
                    }
                    await flashOk("Subscription canceled");
                    await onReload();
                  })();
                }}
              >
                Cancel
              </button>
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
            <button
              type="button"
              disabled={busy || !followUpLocal}
              className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-stone disabled:opacity-50"
              onClick={() => {
                void (async () => {
                  const at = fromDatetimeLocalValue(followUpLocal);
                  if (!at) {
                    setError("Pick a follow-up date/time");
                    return;
                  }
                  setBusy(true);
                  const res = await setFollowUpAction({
                    organizationId: orgId,
                    followUpAt: at,
                    followUpNote: followUpNote || null,
                  });
                  setBusy(false);
                  if ("error" in res) {
                    setError(String(res.error ?? "Failed"));
                    return;
                  }
                  await flashOk("Follow-up saved");
                  await onReload();
                })();
              }}
            >
              Save follow-up
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-xl border border-ink/15 px-3 py-2 text-xs font-semibold"
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  const res = await setFollowUpAction({
                    organizationId: orgId,
                    followUpAt: null,
                  });
                  setBusy(false);
                  if ("error" in res) {
                    setError(String(res.error ?? "Failed"));
                    return;
                  }
                  setFollowUpLocal("");
                  setFollowUpNote("");
                  await flashOk("Follow-up cleared");
                  await onReload();
                })();
              }}
            >
              Clear / done
            </button>
          </div>
        </div>

        <form
          className="mt-4 space-y-3 rounded-2xl border border-ink/8 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void (async () => {
              setBusy(true);
              const res = await updateTenantSubscriptionAction({
                organizationId: orgId,
                status: String(fd.get("status")) as SubStatus,
                menuEnabled: mods.menu,
                orderingEnabled: mods.ordering,
                kitchenEnabled: mods.kitchen,
                inventoryEnabled: mods.inventory,
                financeEnabled: mods.finance,
                hrEnabled: mods.hr,
                trialDays: Number(fd.get("trialDays") || 14),
                periodMonths: Number(fd.get("periodMonths") || 0),
                maxStaffSeats: Number(fd.get("maxStaffSeats") || 2),
                notes: String(fd.get("notes") || ""),
              });
              setBusy(false);
              if ("error" in res) {
                setError(String(res.error ?? "Update failed"));
                return;
              }
              await flashOk("Subscription updated");
              await onReload();
            })();
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
              name="maxStaffSeats"
              type="number"
              className="field"
              defaultValue={Number(sub?.max_staff_seats ?? 2)}
            />
          </div>
          <ModuleCheckboxes value={mods} onChange={setMods} />
          <input
            name="notes"
            className="field"
            defaultValue={String(sub?.notes || "")}
            placeholder="Notes"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-ink px-4 py-2 text-xs font-semibold text-stone"
          >
            Save subscription
          </button>
        </form>

        <div className="mt-3 flex gap-2">
          <input
            className="field flex-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add admin note"
          />
          <button
            type="button"
            disabled={busy || !note.trim()}
            className="rounded-xl border border-ink/15 px-3 py-2 text-xs font-semibold"
            onClick={() => {
              void (async () => {
                setBusy(true);
                const res = await addAdminNoteAction({
                  organizationId: orgId,
                  note,
                });
                setBusy(false);
                if ("error" in res) {
                  setError(String(res.error ?? "Failed"));
                  return;
                }
                setNote("");
                await flashOk("Note added");
                await onReload();
              })();
            }}
          >
            Add note
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
        <h3 className="font-display text-lg">Payment proofs</h3>
        <ul className="mt-3 space-y-2">
          {proofs.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-stone/40 px-3 py-2 text-sm"
            >
              <span>
                {formatMoney(Number(p.amount))}
                {p.expected_amount_etb != null
                  ? ` (exp ${formatMoney(Number(p.expected_amount_etb))})`
                  : ""}{" "}
                · {String(p.months_requested || 1)} mo · {String(p.method)}
                {p.package_code ? ` · ${String(p.package_code)}` : ""}
              </span>
              <StatusPill status={String(p.status)} />
            </li>
          ))}
          {proofs.length === 0 ? (
            <li className="py-4 text-center text-sm text-ink/45">
              No proofs for this restaurant
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
