"use client";

import { useState } from "react";
import {
  resetSubscriberPasswordAction,
  type PlatformTenantRow,
} from "@/app/platform/actions";
import { setOwnerPasswordAction } from "@/app/platform/manage-actions";
import { daysSince, relativeDays } from "@/lib/platform-metrics";
import { ActionButton, throwIfError } from "./feedback";

const NOT_STORED =
  "Password changed, but it could not be saved for later viewing. Copy it now, then apply migration 20260926_platform_login_password.sql.";

export function OwnerLoginCard({
  row,
  flashOk,
}: {
  row: PlatformTenantRow;
  flashOk: (msg: string) => Promise<void>;
}) {
  const org = row.organization;
  const orgId = String(org.id);
  const loginEmail = String(
    row.ownerAuthEmail || row.owner?.email || org.email || "",
  );
  const [issued, setIssued] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [custom, setCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const password =
    issued ??
    (org.platform_login_password ? String(org.platform_login_password) : "");
  const signIn = daysSince(row.ownerLastSignInAt);
  const loginUrl =
    typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";

  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg">Owner login</h3>
        <p className="text-xs text-ink/50">
          Last sign-in: {signIn === null ? "never" : relativeDays(-signIn)} ·
          /login
        </p>
      </div>

      <div className="mt-3 space-y-2 rounded-2xl bg-stone/50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">
              Email
            </p>
            <p className="mt-0.5 break-all font-mono text-sm font-semibold">
              {loginEmail || "—"}
            </p>
          </div>
          {loginEmail ? (
            <button
              type="button"
              className="shrink-0 rounded-lg border border-ink/15 px-2.5 py-1 text-xs font-medium"
              onClick={() => void copy("email", loginEmail)}
            >
              {copied === "email" ? "Copied" : "Copy"}
            </button>
          ) : null}
        </div>

        <div className="border-t border-ink/8 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">
            Password
          </p>
          {password ? (
            <p className="mt-0.5 break-all font-mono text-sm font-semibold">
              {show ? password : "••••••••••••"}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-ink/55">
              Hidden — the owner still uses the password they chose at
              signup. Generate one below if they need a new password.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!password}
              className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              onClick={() => setShow((v) => !v)}
            >
              {show ? "Hide password" : "Show password"}
            </button>
            {password && show ? (
              <>
                <button
                  type="button"
                  className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-medium"
                  onClick={() => void copy("password", password)}
                >
                  {copied === "password" ? "Copied" : "Copy password"}
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-stone"
                  onClick={() =>
                    void copy(
                      "sms",
                      `Aramis Product login\nEmail: ${loginEmail}\nPassword: ${password}\nURL: ${loginUrl}`,
                    )
                  }
                >
                  {copied === "sms" ? "Copied" : "Copy for SMS"}
                </button>
              </>
            ) : null}
          </div>
          {warning ? <p className="mt-2 text-[11px] text-coral">{warning}</p> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-ink/8 p-3 sm:flex-row sm:flex-wrap sm:items-end">
        <ActionButton
          pendingLabel="Generating…"
          onAction={async () => {
            if (
              !window.confirm(
                "Issue a new random password? The owner's current password stops working.",
              )
            )
              return;
            const res = await resetSubscriberPasswordAction(orgId);
            throwIfError(res, "Reset failed");
            if ("password" in res) {
              setIssued(res.password ?? null);
              setShow(true);
              setWarning(res.stored ? null : NOT_STORED);
            }
            await flashOk("New password issued — copy it and send it to the owner.");
          }}
          className="rounded-xl bg-teal px-3 py-2 text-xs font-semibold text-white"
        >
          Generate new password
        </ActionButton>
        <span className="hidden px-1 text-xs text-ink/40 sm:inline">or</span>
        <label className="min-w-0 flex-1 text-xs text-ink/55">
          Set a specific password (min 8 characters)
          <div className="mt-1 flex gap-2">
            <input
              type={showCustom ? "text" : "password"}
              autoComplete="new-password"
              className="field"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="New password"
            />
            <button
              type="button"
              className="rounded-xl border border-ink/15 px-2.5 text-xs"
              onClick={() => setShowCustom((v) => !v)}
            >
              {showCustom ? "Hide" : "Show"}
            </button>
          </div>
        </label>
        <ActionButton
          disabled={custom.trim().length < 8}
          pendingLabel="Saving…"
          onAction={async () => {
            if (custom.trim().length < 8) {
              throw new Error("Password must be at least 8 characters");
            }
            if (
              !window.confirm(
                "Set this as the owner's password? Their current password stops working.",
              )
            )
              return;
            const res = await setOwnerPasswordAction({
              organizationId: orgId,
              password: custom,
            });
            throwIfError(res, "Could not set password");
            if ("password" in res) {
              setIssued(res.password ?? null);
              setCustom("");
              setShow(true);
              setWarning(res.stored ? null : NOT_STORED);
            }
            await flashOk("Password updated.");
          }}
          className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-stone"
        >
          Set password
        </ActionButton>
      </div>
    </section>
  );
}
