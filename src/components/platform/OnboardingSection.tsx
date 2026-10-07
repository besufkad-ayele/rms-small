"use client";

import type { Dispatch, SetStateAction } from "react";
import type {
  ApplicationRow,
  PlatformTenantRow,
} from "@/app/platform/actions";
import type { PackageRow } from "@/lib/pricing";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";
import {
  flagsFromSub,
  Info,
  ModuleCheckboxes,
  moduleLabels,
  type ModuleState,
} from "./platform-ui";
import { ActionButton } from "./feedback";

function appModuleState(app: ApplicationRow): ModuleState {
  return {
    menu: Boolean(app.menu_wanted ?? true),
    ordering: Boolean(app.ordering_wanted ?? true),
    kitchen: Boolean(app.kitchen_wanted ?? true),
    inventory: Boolean(app.inventory_wanted ?? true),
    finance: Boolean(app.finance_wanted ?? true),
    hr: Boolean(app.hr_wanted ?? true),
    online: Boolean(app.online_wanted ?? false),
  };
}

export function OnboardingSection({
  applications,
  rows,
  packages,
  filter,
  setFilter,
  approveMods,
  setApproveMods,
  packageById,
  setPackageById,
  trialDaysByOrg,
  setTrialDaysByOrg,
  trialMonthsByOrg,
  setTrialMonthsByOrg,
  trialEndsByOrg,
  setTrialEndsByOrg,
  followUpByOrg,
  setFollowUpByOrg,
  followUpNoteByOrg,
  setFollowUpNoteByOrg,
  busy,
  onApproveApplication,
  onRejectApplication,
  onApprove,
  onReject,
  onOpenDoc,
  onOpenDetail,
}: {
  applications: ApplicationRow[];
  rows: PlatformTenantRow[];
  packages: PackageRow[];
  filter: "pending" | "approved" | "rejected" | "all";
  setFilter: (f: "pending" | "approved" | "rejected" | "all") => void;
  approveMods: Record<string, ModuleState>;
  setApproveMods: Dispatch<SetStateAction<Record<string, ModuleState>>>;
  packageById: Record<string, string>;
  setPackageById: Dispatch<SetStateAction<Record<string, string>>>;
  trialDaysByOrg: Record<string, number>;
  setTrialDaysByOrg: Dispatch<SetStateAction<Record<string, number>>>;
  trialMonthsByOrg: Record<string, number>;
  setTrialMonthsByOrg: Dispatch<SetStateAction<Record<string, number>>>;
  trialEndsByOrg: Record<string, string>;
  setTrialEndsByOrg: Dispatch<SetStateAction<Record<string, string>>>;
  followUpByOrg: Record<string, string>;
  setFollowUpByOrg: Dispatch<SetStateAction<Record<string, string>>>;
  followUpNoteByOrg: Record<string, string>;
  setFollowUpNoteByOrg: Dispatch<SetStateAction<Record<string, string>>>;
  busy: boolean;
  onApproveApplication: (app: ApplicationRow) => Promise<void> | void;
  onRejectApplication: (app: ApplicationRow) => Promise<void> | void;
  onApprove: (row: PlatformTenantRow) => Promise<void> | void;
  onReject: (row: PlatformTenantRow) => Promise<void> | void;
  onOpenDoc: (path: string | null | undefined) => Promise<void> | void;
  onOpenDetail: (id: string) => void;
}) {
  const filteredApps = applications.filter((a) => {
    const status = String(a.status || "pending");
    if (filter === "all") return true;
    return status === filter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium capitalize",
              filter === f ? "bg-ink text-stone" : "bg-ink/5 text-ink/70",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-xl">Interest applications</h2>
          <p className="text-sm text-ink/55">
            Passwordless requests. Approving creates login credentials for you
            to send.
          </p>
        </div>

        <div className="grid gap-3">
          {filteredApps.map((app) => {
            const id = String(app.id);
            const status = String(app.status || "pending");
            const mods = approveMods[id] ?? appModuleState(app);
            const pkgCode =
              packageById[id] || String(app.package_code || "");
            const pkg = packages.find((p) => p.code === pkgCode);
            return (
              <article
                key={id}
                className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                  <div className="flex gap-3">
                    {app.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={String(app.logo_url)}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-2xl border border-ink/10 object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-stone text-xs text-ink/40">
                        Logo
                      </div>
                    )}
                    <div>
                      <p className="font-display text-xl">
                        {String(app.company_name || "Untitled business")}
                      </p>
                      <p className="text-sm text-ink/60">
                        {String(app.full_name || "—")} ·{" "}
                        {String(app.org_type || "—")} ·{" "}
                        {String(app.city || "—")}
                      </p>
                      <p className="mt-1 text-xs text-ink/45">
                        Submitted{" "}
                        {formatDateTime(String(app.created_at || ""))} ·{" "}
                        <span className="capitalize">{status}</span>
                      </p>
                    </div>
                  </div>
                  {status === "pending" ? (
                    <div className="flex flex-wrap gap-2">
                      <ActionButton
                        disabled={busy}
                        pendingLabel="Approving…"
                        onAction={() => onApproveApplication(app)}
                        className="min-h-11 w-full rounded-xl bg-teal px-3 py-2.5 text-xs font-semibold text-white sm:w-auto"
                      >
                        Approve & issue credentials
                      </ActionButton>
                      <ActionButton
                        disabled={busy}
                        pendingLabel="Rejecting…"
                        onAction={() => onRejectApplication(app)}
                        className="min-h-11 w-full rounded-xl border border-coral/30 bg-coral/10 px-3 py-2.5 text-xs font-semibold text-coral sm:w-auto"
                      >
                        Reject
                      </ActionButton>
                    </div>
                  ) : null}
                </div>

                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <Info label="Email" value={String(app.email || "—")} />
                  <Info label="Phone" value={String(app.phone || "—")} />
                  <Info label="TIN" value={String(app.tin || "—")} />
                  <Info
                    label="Address"
                    value={`${app.address || "—"}, ${app.city || ""}`}
                  />
                  <Info
                    label="Requested package"
                    value={
                      pkg
                        ? `${pkg.name} · ${formatMoney(Number(pkg.monthly_price_etb) || 0)}/mo`
                        : pkgCode || "—"
                    }
                  />
                  <Info
                    label="Requested modules"
                    value={moduleLabels(mods) || "—"}
                  />
                </dl>

                {status === "pending" ? (
                  <div className="mt-4 space-y-3 rounded-2xl bg-stone/50 p-3">
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs text-ink/60">
                        Package
                      </span>
                      <select
                        className="field"
                        value={pkgCode}
                        onChange={(e) => {
                          const code = e.target.value;
                          setPackageById((prev) => ({
                            ...prev,
                            [id]: code,
                          }));
                          const nextPkg = packages.find((p) => p.code === code);
                          if (nextPkg) {
                            setApproveMods((prev) => ({
                              ...prev,
                              [id]: {
                                menu: nextPkg.menu_enabled,
                                ordering: nextPkg.ordering_enabled,
                                kitchen:
                                  nextPkg.kitchen_enabled ??
                                  nextPkg.ordering_enabled,
                                inventory: nextPkg.inventory_enabled,
                                finance: nextPkg.finance_enabled,
                                hr: nextPkg.hr_enabled,
                                online: Boolean(nextPkg.online_enabled),
                              },
                            }));
                          }
                        }}
                      >
                        <option value="">Custom modules</option>
                        {packages.map((p) => (
                          <option key={p.id} value={p.code}>
                            {p.name} ·{" "}
                            {formatMoney(Number(p.monthly_price_etb) || 0)}/mo
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs text-ink/60">
                        Trial ends on (preferred)
                      </span>
                      <input
                        type="datetime-local"
                        className="field"
                        value={trialEndsByOrg[id] ?? ""}
                        onChange={(e) =>
                          setTrialEndsByOrg((prev) => ({
                            ...prev,
                            [id]: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="mb-1 block text-xs text-ink/60">
                          Or trial days
                        </span>
                        <input
                          type="number"
                          min={1}
                          className="field"
                          value={trialDaysByOrg[id] ?? 14}
                          onChange={(e) =>
                            setTrialDaysByOrg((prev) => ({
                              ...prev,
                              [id]: Number(e.target.value) || 14,
                            }))
                          }
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block text-xs text-ink/60">
                          Or trial months
                        </span>
                        <input
                          type="number"
                          min={0}
                          className="field"
                          value={trialMonthsByOrg[id] ?? 0}
                          onChange={(e) =>
                            setTrialMonthsByOrg((prev) => ({
                              ...prev,
                              [id]: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </label>
                    </div>
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs text-ink/60">
                        Follow-up reminder
                      </span>
                      <input
                        type="datetime-local"
                        className="field"
                        value={followUpByOrg[id] ?? ""}
                        onChange={(e) =>
                          setFollowUpByOrg((prev) => ({
                            ...prev,
                            [id]: e.target.value,
                          }))
                        }
                      />
                      <input
                        className="field mt-2"
                        placeholder="Follow-up note (optional)"
                        value={followUpNoteByOrg[id] ?? ""}
                        onChange={(e) =>
                          setFollowUpNoteByOrg((prev) => ({
                            ...prev,
                            [id]: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <p className="text-xs font-medium text-ink/60">
                      Trial modules
                    </p>
                    <ModuleCheckboxes
                      value={mods}
                      onChange={(next) =>
                        setApproveMods((prev) => ({ ...prev, [id]: next }))
                      }
                    />
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <ActionButton
                    className="rounded-lg bg-stone px-2 py-1 underline"
                    disabled={!app.business_license_url}
                    pendingLabel="Opening…"
                    onAction={async () =>
                      onOpenDoc(app.business_license_url as string)
                    }
                  >
                    {`License ${app.business_license_url ? "↗" : "(none)"}`}
                  </ActionButton>
                  <ActionButton
                    className="rounded-lg bg-stone px-2 py-1 underline"
                    disabled={!app.id_document_url}
                    pendingLabel="Opening…"
                    onAction={async () =>
                      onOpenDoc(app.id_document_url as string)
                    }
                  >
                    {`ID ${app.id_document_url ? "↗" : "(none)"}`}
                  </ActionButton>
                </div>
              </article>
            );
          })}
          {filteredApps.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-ink/15 py-10 text-center text-sm text-ink/50">
              No interest applications in this filter
            </p>
          ) : null}
        </div>
      </section>

      {rows.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="font-display text-xl">Legacy KYC orgs</h2>
            <p className="text-sm text-ink/55">
              Accounts that signed up before passwordless interest applications.
            </p>
          </div>
          <div className="grid gap-3">
            {rows.map((row) => {
              const org = row.organization;
              const sub = row.subscription;
              const orgId = String(org.id);
              const status = String(org.verification_status || "pending");
              const mods = approveMods[orgId] ?? flagsFromSub(sub);
              return (
                <article
                  key={orgId}
                  className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                    <div>
                      <button
                        type="button"
                        onClick={() => onOpenDetail(orgId)}
                        className="text-left font-display text-xl hover:text-teal"
                      >
                        {String(org.name)}
                      </button>
                      <p className="text-sm text-ink/60">
                        {row.owner?.full_name || "—"} ·{" "}
                        {String(org.org_type)} · {String(org.city || "—")}
                      </p>
                      <p className="mt-1 text-xs text-ink/45">
                        Submitted {formatDateTime(String(org.created_at))} ·{" "}
                        <span className="capitalize">{status}</span>
                      </p>
                    </div>
                    {status === "pending" ? (
                      <div className="flex flex-wrap gap-2">
                        <ActionButton
                          disabled={busy}
                          pendingLabel="Approving…"
                          onAction={() => onApprove(row)}
                          className="min-h-11 w-full rounded-xl bg-teal px-3 py-2.5 text-xs font-semibold text-white sm:w-auto"
                        >
                          Approve & start trial
                        </ActionButton>
                        <ActionButton
                          disabled={busy}
                          pendingLabel="Rejecting…"
                          onAction={() => onReject(row)}
                          className="min-h-11 w-full rounded-xl border border-coral/30 bg-coral/10 px-3 py-2.5 text-xs font-semibold text-coral sm:w-auto"
                        >
                          Reject
                        </ActionButton>
                      </div>
                    ) : null}
                  </div>

                  <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <Info
                      label="Login email"
                      value={String(row.ownerAuthEmail || org.email || "—")}
                    />
                    <Info
                      label="Phone"
                      value={String(row.owner?.phone || org.phone || "—")}
                    />
                    <Info label="TIN" value={String(org.tin || "—")} />
                    <Info
                      label="Requested modules"
                      value={moduleLabels(flagsFromSub(sub)) || "—"}
                    />
                    <Info
                      label="Sub status"
                      value={String(sub?.status || "—")}
                    />
                  </dl>

                  {status === "pending" ? (
                    <div className="mt-4 space-y-3 rounded-2xl bg-stone/50 p-3">
                      <label className="block text-sm">
                        <span className="mb-1 block text-xs text-ink/60">
                          Trial ends on (preferred)
                        </span>
                        <input
                          type="datetime-local"
                          className="field"
                          value={trialEndsByOrg[orgId] ?? ""}
                          onChange={(e) =>
                            setTrialEndsByOrg((prev) => ({
                              ...prev,
                              [orgId]: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block text-sm">
                          <span className="mb-1 block text-xs text-ink/60">
                            Or trial days
                          </span>
                          <input
                            type="number"
                            min={1}
                            className="field"
                            value={trialDaysByOrg[orgId] ?? 14}
                            onChange={(e) =>
                              setTrialDaysByOrg((prev) => ({
                                ...prev,
                                [orgId]: Number(e.target.value) || 14,
                              }))
                            }
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1 block text-xs text-ink/60">
                            Or trial months
                          </span>
                          <input
                            type="number"
                            min={0}
                            className="field"
                            value={trialMonthsByOrg[orgId] ?? 0}
                            onChange={(e) =>
                              setTrialMonthsByOrg((prev) => ({
                                ...prev,
                                [orgId]: Number(e.target.value) || 0,
                              }))
                            }
                          />
                        </label>
                      </div>
                      <p className="text-xs font-medium text-ink/60">
                        Trial modules
                      </p>
                      <ModuleCheckboxes
                        value={mods}
                        onChange={(next) =>
                          setApproveMods((prev) => ({
                            ...prev,
                            [orgId]: next,
                          }))
                        }
                      />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
