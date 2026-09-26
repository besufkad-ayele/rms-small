"use client";

import type { PlatformTenantRow } from "@/app/platform/actions";
import { formatDateTime } from "@/lib/utils";
import { flagsFromSub, ModuleChips, StatusPill } from "./platform-ui";

export function SubscribersSection({
  rows,
  query,
  setQuery,
  verifyFilter,
  setVerifyFilter,
  subStatusFilter,
  setSubStatusFilter,
  expiringOnly,
  setExpiringOnly,
  onOpen,
}: {
  rows: PlatformTenantRow[];
  query: string;
  setQuery: (q: string) => void;
  verifyFilter: string;
  setVerifyFilter: (v: string) => void;
  subStatusFilter: string;
  setSubStatusFilter: (v: string) => void;
  expiringOnly: boolean;
  setExpiringOnly: (v: boolean) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, phone, city…"
          className="field max-w-md"
        />
        <select
          className="field w-auto"
          value={verifyFilter}
          onChange={(e) => setVerifyFilter(e.target.value)}
        >
          <option value="all">All verification</option>
          <option value="pending">pending</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
        </select>
        <select
          className="field w-auto"
          value={subStatusFilter}
          onChange={(e) => setSubStatusFilter(e.target.value)}
        >
          <option value="all">All sub status</option>
          <option value="trialing">trialing</option>
          <option value="active">active</option>
          <option value="past_due">past_due</option>
          <option value="expired">expired</option>
          <option value="canceled">canceled</option>
        </select>
        <label className="flex items-center gap-2 rounded-xl bg-white px-3 text-xs">
          <input
            type="checkbox"
            checked={expiringOnly}
            onChange={(e) => setExpiringOnly(e.target.checked)}
          />
          Expiring ≤10d
        </label>
      </div>

      <div className="overflow-hidden rounded-3xl border border-ink/8 bg-white">
        <div className="hidden grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr] gap-2 border-b border-ink/8 bg-stone/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink/45 md:grid">
          <span>Business</span>
          <span>Owner</span>
          <span>Status</span>
          <span>Plan / modules</span>
          <span>Ends</span>
        </div>
        <ul className="divide-y divide-ink/5">
          {rows.map((row) => {
            const org = row.organization;
            const sub = row.subscription;
            const flags = flagsFromSub(sub);
            const end =
              sub?.status === "trialing"
                ? sub.trial_ends_at
                : sub?.current_period_end;
            return (
              <li key={String(org.id)}>
                <button
                  type="button"
                  onClick={() => onOpen(String(org.id))}
                  className="grid w-full gap-1 px-4 py-3 text-left text-sm hover:bg-stone/40 md:grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr] md:items-center md:gap-2"
                >
                  <span>
                    <span className="font-medium">{String(org.name)}</span>
                    <span className="mt-0.5 block text-xs text-ink/45">
                      {String(org.city || "—")} · {String(org.phone || "—")}
                      {org.platform_login_password
                        ? " · password on file"
                        : ""}
                    </span>
                  </span>
                  <span className="text-ink/70">
                    {row.owner?.full_name || "—"}
                    <span className="mt-0.5 block text-xs text-ink/45">
                      {row.ownerAuthEmail || row.owner?.email || "—"}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    <StatusPill
                      status={String(org.verification_status || "pending")}
                    />
                    <StatusPill status={String(sub?.status || "—")} />
                  </span>
                  <span>
                    <span className="text-xs text-ink/50">
                      {String(sub?.plan_code || "—")} · seats{" "}
                      {String(sub?.max_staff_seats ?? "—")}
                    </span>
                    <div className="mt-1">
                      <ModuleChips flags={flags} />
                    </div>
                  </span>
                  <span className="text-xs text-ink/55">
                    {end ? formatDateTime(String(end)) : "—"}
                  </span>
                </button>
              </li>
            );
          })}
          {rows.length === 0 ? (
            <li className="px-4 py-12 text-center text-sm text-ink/50">
              No subscribers match
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
