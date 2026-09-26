"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, UserPlus, Users } from "lucide-react";
import {
  createStaffAction,
  getStaffSeatInfoAction,
  listStaffAction,
  resetStaffPasswordAction,
  setStaffActiveAction,
  updateStaffPermissionsAction,
  type StaffMemberRow,
} from "@/app/app/staff/actions";
import {
  STAFF_FEATURE_LABELS,
  defaultPermissionsForRole,
  type StaffPermissions,
} from "@/lib/permissions";
import {
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  type MemberRole,
} from "@/lib/tenant";
import { cn } from "@/lib/utils";

type PermKey = keyof StaffPermissions;
type StaffRole = Exclude<MemberRole, "owner">;

const PERM_KEYS: PermKey[] = [
  "can_order",
  "can_menu",
  "can_kitchen",
  "can_inventory",
  "can_inventory_issue",
  "can_finance",
  "can_billing",
  "can_manage_staff",
];

const PERM_TO_FEATURE: Record<PermKey, keyof typeof STAFF_FEATURE_LABELS> = {
  can_order: "order",
  can_menu: "menu",
  can_kitchen: "kitchen",
  can_inventory: "inventory",
  can_inventory_issue: "inventory_issue",
  can_finance: "finance",
  can_billing: "billing",
  can_manage_staff: "staff",
};

function emptyPerms(): StaffPermissions {
  return defaultPermissionsForRole("cashier");
}

export function StaffPanel() {
  const [staff, setStaff] = useState<StaffMemberRow[]>([]);
  const [seatsUsed, setSeatsUsed] = useState(0);
  const [seatsMax, setSeatsMax] = useState(2);
  const [planCode, setPlanCode] = useState("aramis_starter");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createdCred, setCreatedCred] = useState<{
    email: string;
    password: string;
    fullName: string;
  } | null>(null);

  const [role, setRole] = useState<StaffRole>("cashier");
  const [perms, setPerms] = useState<StaffPermissions>(emptyPerms);

  const reload = useCallback(async () => {
    const [list, seats] = await Promise.all([
      listStaffAction(),
      getStaffSeatInfoAction(),
    ]);
    if ("error" in list) {
      setError(list.error);
      return;
    }
    if ("error" in seats) {
      setError(seats.error);
      return;
    }
    setStaff(list.staff);
    setSeatsUsed(seats.seatsUsed);
    setSeatsMax(seats.seatsMax);
    setPlanCode(seats.planCode);
    setError(null);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setPerms(defaultPermissionsForRole(role));
  }, [role]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    setCreatedCred(null);
    const fd = new FormData(e.currentTarget);
    const result = await createStaffAction({
      fullName: String(fd.get("fullName") || ""),
      email: String(fd.get("email") || ""),
      password: String(fd.get("password") || ""),
      phone: String(fd.get("phone") || "") || undefined,
      role,
      permissions: perms,
    });
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setCreatedCred({
      email: result.email,
      password: result.password,
      fullName: result.fullName,
    });
    setMessage(`Login created for ${result.fullName}. Share these credentials securely.`);
    e.currentTarget.reset();
    setRole("cashier");
    setPerms(emptyPerms());
    await reload();
  }

  async function toggleActive(row: StaffMemberRow) {
    setBusy(true);
    setError(null);
    const result = await setStaffActiveAction({
      membershipId: row.membershipId,
      active: !row.active,
    });
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setMessage(row.active ? "Staff deactivated." : "Staff reactivated.");
    await reload();
  }

  async function savePerms(
    row: StaffMemberRow,
    next: StaffPermissions,
    nextRole?: StaffRole,
  ) {
    setBusy(true);
    setError(null);
    const result = await updateStaffPermissionsAction({
      membershipId: row.membershipId,
      permissions: next,
      ...(nextRole ? { role: nextRole } : {}),
    });
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setMessage("Permissions updated.");
    await reload();
  }

  async function resetPassword(row: StaffMemberRow) {
    const password = window.prompt(
      `New password for ${row.fullName} (min 6 characters):`,
    );
    if (!password) return;
    setBusy(true);
    setError(null);
    const result = await resetStaffPasswordAction({
      membershipId: row.membershipId,
      password,
    });
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setCreatedCred({
      email: row.email || "",
      password: result.password,
      fullName: row.fullName,
    });
    setMessage("Password reset. Share the new password with your staff.");
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied to clipboard.");
    } catch {
      setError("Could not copy — select the text manually.");
    }
  }

  const seatsLeft = Math.max(0, seatsMax - seatsUsed);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <section className="rounded-3xl border border-ink/8 bg-gradient-to-br from-ink via-ink to-teal/90 p-5 text-stone shadow-xl sm:p-6">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-white/10 p-2.5">
            <Users className="h-5 w-5 text-gold" />
          </span>
          <div>
            <h2 className="font-display text-2xl text-gold">Staff &amp; HR</h2>
            <p className="mt-1 text-sm text-stone/75">
              Create logins for your team. Choose exactly which features each
              person can use — they only see this restaurant.
            </p>
            <p className="mt-3 text-sm">
              <span className="font-semibold text-white">
                {seatsUsed}/{seatsMax}
              </span>{" "}
              staff seats used · plan{" "}
              <span className="font-mono text-xs text-gold">{planCode}</span>
              {seatsLeft === 0 ? (
                <span className="ml-2 text-coral">Limit reached</span>
              ) : (
                <span className="ml-2 text-stone/60">
                  {seatsLeft} seat{seatsLeft === 1 ? "" : "s"} left
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-stone/55">
              Basic: 2 · Medium: 10 · Enterprise: 50 (besides the owner)
            </p>
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-2xl bg-coral/15 px-4 py-3 text-sm text-coral">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-2xl bg-teal/15 px-4 py-3 text-sm text-teal">
          {message}
        </p>
      ) : null}

      {createdCred ? (
        <section className="rounded-3xl border border-gold/40 bg-gold/10 p-5">
          <div className="flex items-center gap-2 text-ink">
            <KeyRound className="h-4 w-4" />
            <h3 className="font-display text-lg">Credentials to share</h3>
          </div>
          <p className="mt-1 text-sm text-ink/60">
            {createdCred.fullName} signs in at{" "}
            <span className="font-medium">/staff-login</span> (or /login).
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2 rounded-xl bg-white/80 px-3 py-2">
              <div>
                <dt className="text-xs text-ink/50">Email</dt>
                <dd className="font-medium">{createdCred.email}</dd>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-ink/50 hover:bg-ink/5"
                onClick={() => void copyText(createdCred.email)}
                aria-label="Copy email"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl bg-white/80 px-3 py-2">
              <div>
                <dt className="text-xs text-ink/50">Password</dt>
                <dd className="font-mono font-medium">{createdCred.password}</dd>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-ink/50 hover:bg-ink/5"
                onClick={() => void copyText(createdCred.password)}
                aria-label="Copy password"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="rounded-3xl border border-ink/8 bg-white/90 p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-teal" />
          <h3 className="font-display text-xl text-ink">Add staff login</h3>
        </div>
        <form className="space-y-3" onSubmit={(e) => void onCreate(e)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Full name</span>
              <input
                name="fullName"
                required
                className="w-full rounded-xl border border-ink/10 bg-stone/40 px-3 py-2.5 outline-none ring-teal/30 focus:ring-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Phone (optional)</span>
              <input
                name="phone"
                className="w-full rounded-xl border border-ink/10 bg-stone/40 px-3 py-2.5 outline-none ring-teal/30 focus:ring-2"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Login email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="off"
                className="w-full rounded-xl border border-ink/10 bg-stone/40 px-3 py-2.5 outline-none ring-teal/30 focus:ring-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Password you set</span>
              <input
                name="password"
                type="text"
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full rounded-xl border border-ink/10 bg-stone/40 px-3 py-2.5 outline-none ring-teal/30 focus:ring-2"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              className="w-full rounded-xl border border-ink/10 bg-stone/40 px-3 py-2.5 outline-none ring-teal/30 focus:ring-2 sm:max-w-xs"
            >
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {STAFF_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            {role === "waiter" ? (
              <p className="mt-1.5 text-xs text-ink/50">
                Waiters place orders and mark them complete — no printing or
                cancel requests.
              </p>
            ) : null}
          </label>

          <fieldset className="rounded-2xl border border-ink/8 bg-stone/30 p-4">
            <legend className="px-1 text-sm font-medium text-ink">
              Features this person can use
            </legend>
            <p className="mb-3 text-xs text-ink/50">
              Toggle each area. They will only see what you enable.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PERM_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={perms[key]}
                    onChange={(e) =>
                      setPerms((p) => ({ ...p, [key]: e.target.checked }))
                    }
                    className="accent-teal"
                  />
                  {STAFF_FEATURE_LABELS[PERM_TO_FEATURE[key]]}
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={busy || seatsLeft === 0}
            className="rounded-xl bg-teal px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-teal/20 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create staff login"}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-xl text-ink">Team</h3>
        {staff.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-ink/50">
            No accounts yet — add your first cashier, waiter, or manager above.
          </p>
        ) : (
          staff.map((row) => (
            <StaffCard
              key={row.membershipId}
              row={row}
              busy={busy}
              onToggleActive={() => void toggleActive(row)}
              onResetPassword={() => void resetPassword(row)}
              onSavePerms={(next, nextRole) =>
                void savePerms(row, next, nextRole)
              }
            />
          ))
        )}
      </section>
    </div>
  );
}

function StaffCard({
  row,
  busy,
  onToggleActive,
  onResetPassword,
  onSavePerms,
}: {
  row: StaffMemberRow;
  busy: boolean;
  onToggleActive: () => void;
  onResetPassword: () => void;
  onSavePerms: (p: StaffPermissions, role?: StaffRole) => void;
}) {
  const [local, setLocal] = useState(row.permissions);
  const [localRole, setLocalRole] = useState<StaffRole>(
    row.role === "owner" ? "cashier" : (row.role as StaffRole),
  );
  const isOwner = row.role === "owner";

  useEffect(() => {
    setLocal(row.permissions);
    if (row.role !== "owner") setLocalRole(row.role as StaffRole);
  }, [row.permissions, row.role]);

  return (
    <article
      className={cn(
        "rounded-3xl border bg-white/90 p-4 shadow-sm sm:p-5",
        row.active ? "border-ink/8" : "border-coral/30 opacity-80",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-lg text-ink">{row.fullName}</h4>
          <p className="text-sm text-ink/55">
            {row.email || "—"} ·{" "}
            {row.role === "owner"
              ? "owner"
              : STAFF_ROLE_LABELS[row.role as StaffRole] || row.role}
            {!row.active ? " · inactive" : ""}
          </p>
        </div>
        {!isOwner ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onResetPassword}
              className="rounded-xl border border-ink/10 px-3 py-1.5 text-xs font-medium hover:bg-stone/50"
            >
              Reset password
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onToggleActive}
              className={cn(
                "rounded-xl px-3 py-1.5 text-xs font-medium",
                row.active
                  ? "border border-coral/30 text-coral hover:bg-coral/5"
                  : "bg-teal text-white",
              )}
            >
              {row.active ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        ) : (
          <span className="rounded-full bg-gold/20 px-3 py-1 text-xs font-medium text-ink">
            Owner
          </span>
        )}
      </div>

      {!isOwner ? (
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Role</span>
            <select
              value={localRole}
              disabled={busy || !row.active}
              onChange={(e) => {
                const next = e.target.value as StaffRole;
                setLocalRole(next);
                setLocal(defaultPermissionsForRole(next));
              }}
              className="w-full max-w-xs rounded-xl border border-ink/10 bg-stone/40 px-3 py-2 text-sm outline-none ring-teal/30 focus:ring-2"
            >
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {STAFF_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            {localRole === "waiter" ? (
              <p className="mt-1 text-xs text-ink/50">
                Place &amp; complete orders only — no print or cancel.
              </p>
            ) : null}
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {PERM_KEYS.map((key) => (
              <label
                key={key}
                className="flex items-center gap-2 rounded-xl bg-stone/40 px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={local[key]}
                  disabled={busy || !row.active}
                  onChange={(e) =>
                    setLocal((p) => ({ ...p, [key]: e.target.checked }))
                  }
                  className="accent-teal"
                />
                {STAFF_FEATURE_LABELS[PERM_TO_FEATURE[key]]}
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || !row.active}
            onClick={() => onSavePerms(local, localRole)}
            className="rounded-xl bg-ink px-4 py-2 text-xs font-semibold text-stone disabled:opacity-50"
          >
            Save role &amp; permissions
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-ink/50">
          Owner has full access to every feature.
        </p>
      )}
    </article>
  );
}
