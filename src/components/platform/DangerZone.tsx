"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteOrganizationAction,
  discardOrgDataBackupAction,
  getOrgDataBackupPreviewAction,
  getOrgDataCountsAction,
  listOrgDataBackupsAction,
  resetOrgDataAction,
  restoreOrgDataBackupAction,
  type BackupPreviewItem,
  type OrgDataBackupSummary,
} from "@/app/platform/manage-actions";
import {
  BACKUP_TTL_DAYS,
  expandResetSelection,
  RESET_CATEGORIES,
  RESET_GROUP_LABELS,
  RESET_PRESETS,
  requiredBy,
  type ResetCategory,
  type ResetGroup,
} from "@/lib/org-data-reset";
import { cn, formatDateTime } from "@/lib/utils";
import { ActionButton, throwIfError } from "./feedback";

const LABEL = new Map(RESET_CATEGORIES.map((c) => [c.id, c.label]));

const GROUPS = Array.from(
  new Set(RESET_CATEGORIES.map((c) => c.group)),
) as ResetGroup[];

export function DangerZone({
  organizationId,
  organizationName,
  busy,
  setBusy,
  setError,
  flashOk,
  onReload,
  onDeleted,
}: {
  organizationId: string;
  organizationName: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setError: (v: string | null) => void;
  flashOk: (msg: string) => Promise<void>;
  onReload: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [panel, setPanel] = useState<"none" | "reset" | "delete">("none");

  return (
    <section className="rounded-3xl border border-coral/30 bg-white p-4 sm:p-5">
      <h3 className="font-display text-lg text-coral">Danger zone</h3>
      <p className="text-xs text-ink/55">
        Choose what to delete. A backup is kept for {BACKUP_TTL_DAYS} days so you
        can restore it.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPanel(panel === "reset" ? "none" : "reset")}
          className={cn(
            "rounded-xl border px-3 py-2 text-xs font-semibold",
            panel === "reset"
              ? "border-coral bg-coral text-white"
              : "border-coral/30 text-coral",
          )}
        >
          Reset restaurant data…
        </button>
        <button
          type="button"
          onClick={() => setPanel(panel === "delete" ? "none" : "delete")}
          className={cn(
            "rounded-xl border px-3 py-2 text-xs font-semibold",
            panel === "delete"
              ? "border-coral bg-coral text-white"
              : "border-coral/30 text-coral",
          )}
        >
          Delete restaurant…
        </button>
      </div>

      {panel === "reset" ? (
        <ResetPanel
          organizationId={organizationId}
          organizationName={organizationName}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          flashOk={flashOk}
          onReload={onReload}
        />
      ) : null}
      {panel === "delete" ? (
        <DeletePanel
          organizationId={organizationId}
          organizationName={organizationName}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          flashOk={flashOk}
          onDeleted={onDeleted}
        />
      ) : null}
    </section>
  );
}

function ResetPanel({
  organizationId,
  organizationName,
  setError,
  flashOk,
  onReload,
}: {
  organizationId: string;
  organizationName: string;
  busy?: boolean;
  setBusy?: (v: boolean) => void;
  setError: (v: string | null) => void;
  flashOk: (msg: string) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [counts, setCounts] = useState<Record<ResetCategory, number> | null>(
    null,
  );
  const [backups, setBackups] = useState<OrgDataBackupSummary[] | null>(null);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<Set<ResetCategory>>(new Set());
  const [typed, setTyped] = useState("");
  const [keepBackup, setKeepBackup] = useState(true);

  useEffect(() => {
    let alive = true;
    void getOrgDataCountsAction(organizationId).then((res) => {
      if (!alive) return;
      if ("error" in res) setError(res.error);
      else setCounts(res.counts);
    });
    void listOrgDataBackupsAction(organizationId).then((res) => {
      if (!alive) return;
      if ("error" in res) setError(res.error);
      else setBackups(res.backups);
    });
    return () => {
      alive = false;
    };
  }, [organizationId, version, setError]);

  const effective = useMemo(() => expandResetSelection(selected), [selected]);
  const ordered = RESET_CATEGORIES.filter((c) => effective.has(c.id));
  const totalRows = ordered.reduce(
    (sum, c) => sum + (c.id === "receipt_counter" ? 0 : counts?.[c.id] ?? 0),
    0,
  );
  const nameOk =
    typed.trim().toLowerCase() === organizationName.trim().toLowerCase();

  function toggle(id: ResetCategory) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run() {
    if (!keepBackup) {
      if (
        !window.confirm(
          "No backup will be kept. This cannot be restored. Continue?",
        )
      )
        return;
    }
    const res = await resetOrgDataAction({
      organizationId,
      categories: [...selected],
      confirmName: typed,
      keepBackup,
    });
    throwIfError(res, "Reset failed");
    const labels = (("done" in res ? res.done : []) ?? [])
      .map((d) => LABEL.get(d))
      .filter(Boolean)
      .join(", ");
    await flashOk(
      keepBackup
        ? `Deleted ${labels}. Backup kept for ${BACKUP_TTL_DAYS} days — restore below if needed.`
        : `Permanently deleted: ${labels}`,
    );
    setSelected(new Set());
    setTyped("");
    setVersion((v) => v + 1);
    await onReload();
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-coral/20 bg-coral/5 p-3">
      {backups && backups.length > 0 ? (
        <BackupList
          backups={backups}
          organizationId={organizationId}
          flashOk={flashOk}
          onChanged={async () => {
            setVersion((v) => v + 1);
            await onReload();
          }}
        />
      ) : null}

      <div>
        <p className="text-xs font-semibold text-ink/60">What to delete</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {RESET_PRESETS.map((p) => {
            const active =
              p.ids.length === selected.size &&
              p.ids.every((id) => selected.has(id));
            return (
              <button
                key={p.id}
                type="button"
                title={p.hint}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-xs",
                  active
                    ? "border-coral bg-coral text-white"
                    : "border-ink/15 bg-white",
                )}
                onClick={() => setSelected(new Set(p.ids))}
              >
                {p.label}
              </button>
            );
          })}
          <button
            type="button"
            className="rounded-lg px-2.5 py-1 text-xs text-ink/50 underline"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      </div>

      {GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink/45">
            {RESET_GROUP_LABELS[group]}
          </p>
          <ul className="grid gap-1.5 md:grid-cols-2">
            {RESET_CATEGORIES.filter((c) => c.group === group).map((c) => {
              const forcedBy = selected.has(c.id)
                ? []
                : requiredBy(c.id, selected);
              const on = effective.has(c.id);
              const count = counts?.[c.id];
              return (
                <li key={c.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-xl border bg-white p-2.5 text-sm",
                      on ? "border-coral/50" : "border-ink/8",
                      forcedBy.length > 0 && "cursor-not-allowed opacity-80",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={on}
                      disabled={forcedBy.length > 0}
                      onChange={() => toggle(c.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{c.label}</span>
                        <span className="text-xs tabular-nums text-ink/50">
                          {count === undefined
                            ? "…"
                            : c.id === "receipt_counter"
                              ? `at #${count}`
                              : `${count.toLocaleString()} rows`}
                        </span>
                      </span>
                      <span className="block text-xs text-ink/50">
                        {c.detail}
                      </span>
                      {c.requires.length ? (
                        <span className="block text-[11px] text-ink/40">
                          Also removes:{" "}
                          {c.requires.map((r) => LABEL.get(r)).join(", ")}
                        </span>
                      ) : null}
                      {forcedBy.length ? (
                        <span className="block text-[11px] font-medium text-coral">
                          Included because of{" "}
                          {forcedBy.map((r) => LABEL.get(r)).join(", ")}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {ordered.length ? (
        <div className="rounded-xl bg-white p-3 text-xs">
          <p className="font-semibold text-ink/70">
            Will delete ({totalRows.toLocaleString()} rows):
          </p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-ink/60">
            {ordered.map((c) => (
              <li key={c.id}>
                {c.label}
                {counts && c.id !== "receipt_counter"
                  ? ` — ${(counts[c.id] ?? 0).toLocaleString()}`
                  : ""}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-ink/45">
            Kept: the restaurant, owner login, subscription and access dates,
            settings.
          </p>
        </div>
      ) : null}

      <label className="flex items-start gap-2 rounded-xl bg-white p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={keepBackup}
          onChange={(e) => setKeepBackup(e.target.checked)}
        />
        <span>
          <span className="font-medium">Keep a backup for {BACKUP_TTL_DAYS} days</span>
          <span className="block text-xs text-ink/55">
            Restore anytime in that window. After {BACKUP_TTL_DAYS} days the
            backup is permanently removed. Staff logins are kept so members can
            be reattached.
          </span>
        </span>
      </label>

      <label className="block text-xs text-ink/60">
        Type <strong>{organizationName}</strong> to confirm
        <input
          className="field mt-1"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={organizationName}
        />
      </label>
      <ActionButton
        disabled={!ordered.length || !nameOk}
        pendingLabel={keepBackup ? "Backing up & deleting…" : "Deleting…"}
        onAction={run}
        className="rounded-xl bg-coral px-4 py-2 text-xs font-semibold text-white"
      >
        {keepBackup
          ? `Delete selected & keep ${BACKUP_TTL_DAYS}-day backup`
          : `Delete selected data permanently (${ordered.length})`}
      </ActionButton>
    </div>
  );
}

function BackupList({
  backups,
  organizationId,
  flashOk,
  onChanged,
}: {
  backups: OrgDataBackupSummary[];
  organizationId: string;
  flashOk: (msg: string) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<BackupPreviewItem[] | null>(null);
  const [picked, setPicked] = useState<Set<ResetCategory>>(new Set());

  return (
    <div className="space-y-2 rounded-xl border border-teal/30 bg-white p-3">
      <p className="text-xs font-semibold text-teal">
        Restorable backups ({backups.length})
      </p>
      <ul className="space-y-2">
        {backups.map((b) => {
          const labels = b.categories
            .map((c) => LABEL.get(c) || c)
            .join(", ");
          const left =
            b.hoursLeft >= 24
              ? `${Math.ceil(b.hoursLeft / 24)}d left`
              : `${b.hoursLeft}h left`;
          const open = openId === b.id;
          return (
            <li
              key={b.id}
              className="rounded-xl border border-ink/8 bg-stone/40 p-2.5"
            >
              <p className="text-sm font-medium">{labels}</p>
              <p className="text-[11px] text-ink/50">
                Deleted {formatDateTime(b.createdAt)} · restore until{" "}
                {formatDateTime(b.purgeAt)} ({left})
                {b.restoredAt
                  ? ` · last restored ${formatDateTime(b.restoredAt)}`
                  : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <ActionButton
                  pendingLabel="Opening…"
                  className="rounded-lg border border-ink/15 bg-white px-2.5 py-1 text-xs font-semibold"
                  onAction={async () => {
                    if (open) {
                      setOpenId(null);
                      setItems(null);
                      return;
                    }
                    const res = await getOrgDataBackupPreviewAction({
                      backupId: b.id,
                      organizationId,
                    });
                    throwIfError(res, "Could not open backup");
                    if ("items" in res) {
                      setItems(res.items);
                      setPicked(
                        new Set(
                          res.items
                            .filter((i) => i.count > 0 || i.category === "receipt_counter")
                            .map((i) => i.category),
                        ),
                      );
                      setOpenId(b.id);
                    }
                  }}
                >
                  {open ? "Hide contents" : "View contents"}
                </ActionButton>
                <ActionButton
                  pendingLabel="Removing…"
                  className="rounded-lg border border-coral/30 px-2.5 py-1 text-xs font-medium text-coral"
                  onAction={async () => {
                    if (
                      !window.confirm(
                        "Permanently remove this backup now? You will not be able to restore it.",
                      )
                    )
                      return;
                    const res = await discardOrgDataBackupAction({
                      backupId: b.id,
                      organizationId,
                    });
                    throwIfError(res, "Could not remove backup");
                    await flashOk("Backup permanently removed");
                    await onChanged();
                  }}
                >
                  Discard now
                </ActionButton>
              </div>
              {open && items ? (
                <div className="mt-3 space-y-2 rounded-xl bg-white p-2">
                  <p className="text-[11px] font-semibold text-ink/55">
                    Choose what to put back
                  </p>
                  <ul className="space-y-1.5">
                    {items.map((item) => (
                      <li key={item.category}>
                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={picked.has(item.category)}
                            onChange={() => {
                              setPicked((prev) => {
                                const next = new Set(prev);
                                if (next.has(item.category)) next.delete(item.category);
                                else next.add(item.category);
                                return next;
                              });
                            }}
                          />
                          <span>
                            <span className="font-medium">
                              {LABEL.get(item.category) || item.category}
                            </span>
                            <span className="ml-2 text-xs text-ink/45">
                              {item.count.toLocaleString()} row
                              {item.count === 1 ? "" : "s"}
                            </span>
                            {item.samples.length ? (
                              <span className="block text-[11px] text-ink/45">
                                {item.samples.slice(0, 6).join(" · ")}
                                {item.samples.length > 6 ? "…" : ""}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <ActionButton
                    disabled={!picked.size}
                    pendingLabel="Restoring…"
                    className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white"
                    onAction={async () => {
                      if (
                        !window.confirm(
                          `Restore ${picked.size} selected part(s)? Existing rows with the same ids are replaced.`,
                        )
                      )
                        return;
                      const res = await restoreOrgDataBackupAction({
                        backupId: b.id,
                        organizationId,
                        categories: [...picked],
                      });
                      throwIfError(res, "Restore failed");
                      await flashOk(
                        "note" in res && res.note
                          ? `Restored. ${res.note}`
                          : "Selected backup data restored",
                      );
                      setOpenId(null);
                      await onChanged();
                    }}
                  >
                    {`Restore selected (${picked.size})`}
                  </ActionButton>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DeletePanel({
  organizationId,
  organizationName,
  flashOk,
  onDeleted,
}: {
  organizationId: string;
  organizationName: string;
  busy?: boolean;
  setBusy?: (v: boolean) => void;
  setError?: (v: string | null) => void;
  flashOk: (msg: string) => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [deleteLogins, setDeleteLogins] = useState(true);
  const nameOk =
    typed.trim().toLowerCase() === organizationName.trim().toLowerCase();

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-coral/20 bg-coral/5 p-3 text-sm">
      <p className="text-ink/70">
        Removes the restaurant and <strong>everything</strong> in it: subscription,
        payments, sales, menu, inventory, finance, staff memberships and uploaded
        files. This is immediate and has no 3-day restore.
      </p>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={deleteLogins}
          onChange={(e) => setDeleteLogins(e.target.checked)}
        />
        Also delete owner and staff login accounts (skipped for people in other restaurants)
      </label>
      <label className="block text-xs text-ink/60">
        Type <strong>{organizationName}</strong> to confirm
        <input
          className="field mt-1"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={organizationName}
        />
      </label>
      <ActionButton
        disabled={!nameOk}
        pendingLabel="Deleting…"
        className="rounded-xl bg-coral px-4 py-2 text-xs font-semibold text-white"
        onAction={async () => {
          const res = await deleteOrganizationAction({
            organizationId,
            confirmName: typed,
            deleteLogins,
          });
          throwIfError(res, "Delete failed");
          await flashOk(
            `${organizationName} deleted${
              "loginsDeleted" in res && res.loginsDeleted
                ? ` · ${res.loginsDeleted} login(s) removed`
                : ""
            }`,
          );
          await onDeleted();
        }}
      >
        Delete restaurant permanently
      </ActionButton>
    </div>
  );
}
