"use client";

import type { Dispatch, SetStateAction } from "react";
import type { PlatformTenantRow } from "@/app/platform/actions";
import { cn, formatDateTime } from "@/lib/utils";
import {
  flagsFromSub,
  Info,
  ModuleCheckboxes,
  moduleLabels,
  type ModuleState,
} from "./platform-ui";

export function OnboardingSection({
  rows,
  filter,
  setFilter,
  approveMods,
  setApproveMods,
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
  onApprove,
  onReject,
  onOpenDoc,
  onOpenDetail,
}: {
  rows: PlatformTenantRow[];
  filter: "pending" | "approved" | "rejected" | "all";
  setFilter: (f: "pending" | "approved" | "rejected" | "all") => void;
  approveMods: Record<string, ModuleState>;
  setApproveMods: Dispatch<SetStateAction<Record<string, ModuleState>>>;
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
  onApprove: (row: PlatformTenantRow) => void;
  onReject: (row: PlatformTenantRow) => void;
  onOpenDoc: (path: string | null | undefined) => void;
  onOpenDetail: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
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
                    {row.owner?.full_name || "—"} · {String(org.org_type)} ·{" "}
                    {String(org.city || "—")}
                  </p>
                  <p className="mt-1 text-xs text-ink/45">
                    Submitted {formatDateTime(String(org.created_at))} ·{" "}
                    <span className="capitalize">{status}</span>
                  </p>
                </div>
                {status === "pending" ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onApprove(row)}
                      className="rounded-xl bg-teal px-3 py-2 text-xs font-semibold text-white"
                    >
                      Approve & start trial
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onReject(row)}
                      className="rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-xs font-semibold text-coral"
                    >
                      Reject
                    </button>
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
                  label="Address"
                  value={`${org.address || "—"}, ${org.city || ""}`}
                />
                <Info
                  label="Requested modules"
                  value={moduleLabels(flagsFromSub(sub)) || "—"}
                />
                <Info label="Sub status" value={String(sub?.status || "—")} />
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
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-ink/60">
                      Follow-up reminder
                    </span>
                    <input
                      type="datetime-local"
                      className="field"
                      value={followUpByOrg[orgId] ?? ""}
                      onChange={(e) =>
                        setFollowUpByOrg((prev) => ({
                          ...prev,
                          [orgId]: e.target.value,
                        }))
                      }
                    />
                    <input
                      className="field mt-2"
                      placeholder="Follow-up note (optional)"
                      value={followUpNoteByOrg[orgId] ?? ""}
                      onChange={(e) =>
                        setFollowUpNoteByOrg((prev) => ({
                          ...prev,
                          [orgId]: e.target.value,
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
                      setApproveMods((prev) => ({ ...prev, [orgId]: next }))
                    }
                  />
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  className="rounded-lg bg-stone px-2 py-1 underline disabled:opacity-40"
                  disabled={!org.business_license_url}
                  onClick={() =>
                    onOpenDoc(org.business_license_url as string)
                  }
                >
                  License {org.business_license_url ? "↗" : "(none)"}
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-stone px-2 py-1 underline disabled:opacity-40"
                  disabled={!org.id_document_url}
                  onClick={() => onOpenDoc(org.id_document_url as string)}
                >
                  ID {org.id_document_url ? "↗" : "(none)"}
                </button>
              </div>
            </article>
          );
        })}
        {rows.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-ink/15 py-12 text-center text-sm text-ink/50">
            No onboarded businesses in this filter
          </p>
        ) : null}
      </div>
    </div>
  );
}
