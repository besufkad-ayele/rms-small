"use client";

import { useEffect, useState } from "react";
import {
  listOrgMembersAction,
  removeMemberAction,
  setMemberActiveAction,
  type OrgMemberRow,
} from "@/app/platform/manage-actions";
import { daysSince, relativeDays } from "@/lib/platform-metrics";
import { cn } from "@/lib/utils";
import { StatusPill } from "./platform-ui";
import { Shimmer } from "@/components/ui/Shimmer";
import { ActionButton, throwIfError } from "./feedback";

export function StaffManager({
  organizationId,
  seats,
  setError,
  flashOk,
}: {
  organizationId: string;
  seats: number;
  busy?: boolean;
  setBusy?: (v: boolean) => void;
  setError: (v: string | null) => void;
  flashOk: (msg: string) => Promise<void>;
}) {
  const [members, setMembers] = useState<OrgMemberRow[] | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    void listOrgMembersAction(organizationId).then((res) => {
      if (!alive) return;
      if ("error" in res) {
        setError(res.error);
        setMembers([]);
        return;
      }
      setMembers(res.members);
    });
    return () => {
      alive = false;
    };
  }, [organizationId, version, setError]);

  const staffCount = members?.filter((m) => m.role !== "owner" && m.active).length ?? 0;

  async function run(
    action: () => Promise<{ error?: string } | { ok: true }>,
    ok: string,
  ) {
    const res = await action();
    throwIfError(res, "Failed");
    await flashOk(ok);
    setVersion((v) => v + 1);
  }

  return (
    <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg">Staff & logins</h3>
        <p className={cn("text-xs", seats > 0 && staffCount >= seats ? "text-coral" : "text-ink/50")}>
          {staffCount} active staff / {seats || "—"} seats
        </p>
      </div>
      <ul className="mt-3 divide-y divide-ink/5">
        {members === null
          ? Array.from({ length: 3 }).map((_, i) => (
              <li key={`shimmer-${i}`} className="flex items-center gap-3 py-2.5">
                <Shimmer className="h-9 w-9 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Shimmer className="h-3 w-1/2" />
                  <Shimmer className="h-2.5 w-2/3" />
                </div>
              </li>
            ))
          : null}
        {members?.map((m) => {
          const signIn = daysSince(m.lastSignInAt);
          const isOwner = m.role === "owner";
          return (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium">{m.fullName}</span>
                <span className="ml-2 inline-flex gap-1 align-middle">
                  <StatusPill status={m.role} tone={isOwner ? "gold" : "ink"} />
                  {!m.active ? <StatusPill status="inactive" tone="coral" /> : null}
                </span>
                <span className="block text-xs text-ink/50">
                  {m.email || "—"}
                  {m.phone ? ` · ${m.phone}` : ""} · last sign-in{" "}
                  {signIn === null ? "never" : relativeDays(-signIn)}
                </span>
              </span>
              {isOwner ? (
                <span className="text-[11px] text-ink/40">Manage in Owner login</span>
              ) : (
                <span className="flex flex-wrap gap-2">
                  <ActionButton
                    pendingLabel="Saving…"
                    className="rounded-lg border border-ink/15 px-2.5 py-1 text-xs font-medium"
                    onAction={() =>
                      run(
                        () => setMemberActiveAction({ membershipId: m.id, active: !m.active }),
                        m.active ? `${m.fullName} deactivated` : `${m.fullName} reactivated`,
                      )
                    }
                  >
                    {m.active ? "Deactivate" : "Activate"}
                  </ActionButton>
                  <ActionButton
                    pendingLabel="Removing…"
                    className="rounded-lg border border-coral/30 px-2.5 py-1 text-xs font-medium text-coral"
                    onAction={async () => {
                      if (!window.confirm(`Remove ${m.fullName} from this restaurant?`)) return;
                      const deleteLogin = window.confirm(
                        "Also delete their login account? (Only if they belong to no other restaurant.) OK = delete login, Cancel = keep login.",
                      );
                      await run(
                        () => removeMemberAction({ membershipId: m.id, deleteLogin }),
                        `${m.fullName} removed`,
                      );
                    }}
                  >
                    Remove
                  </ActionButton>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
