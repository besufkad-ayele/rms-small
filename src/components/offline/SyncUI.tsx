"use client";

import { useEffect } from "react";
import { CloudOff, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { useOfflineSync } from "./OfflineSyncProvider";
import { localeIntlTag } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function SyncSuccessDialog() {
  const { syncDialog, closeSyncDialog } = useOfflineSync();
  const { t } = useI18n();

  useEffect(() => {
    if (!syncDialog.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSyncDialog();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [syncDialog.open, closeSyncDialog]);

  if (!syncDialog.open || !syncDialog.result) return null;

  const { result, source } = syncDialog;
  const ok = result.failed === 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4"
      role="presentation"
      onClick={closeSyncDialog}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-ink/10 bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-dialog-title"
        aria-describedby="sync-dialog-body"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            "mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl",
            ok ? "bg-teal/15 text-teal" : "bg-coral/15 text-coral",
          )}
        >
          <RefreshCw className="h-7 w-7" aria-hidden />
        </div>
        <h2
          id="sync-dialog-title"
          className="text-center font-display text-2xl text-ink"
        >
          {ok ? t("sync.okTitle") : t("sync.failTitle")}
        </h2>
        <p
          id="sync-dialog-body"
          className="mt-2 text-center text-sm text-ink/65"
        >
          {source === "auto" ? t("sync.autoBody") : t("sync.manualBody")}
        </p>
        <ul className="mt-4 space-y-1 rounded-2xl bg-stone/80 px-4 py-3 text-sm text-ink/80">
          <li>{t("sync.processed", { n: result.totalProcessed })}</li>
          <li>{t("sync.synced", { n: result.succeeded })}</li>
          {result.failed > 0 ? (
            <li>{t("sync.failed", { n: result.failed })}</li>
          ) : null}
        </ul>
        {result.errors.length > 0 ? (
          <div className="mt-3 max-h-32 space-y-1 overflow-auto rounded-xl bg-coral/10 px-3 py-2 text-xs text-coral">
            {result.errors.slice(0, 5).map((err) => (
              <p key={err}>{err}</p>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          autoFocus
          onClick={closeSyncDialog}
          className="mt-5 w-full rounded-xl bg-teal px-4 py-3 text-sm font-semibold text-white"
        >
          {t("sync.ok")}
        </button>
      </div>
    </div>
  );
}

export function SyncControls({
  compact = false,
  tone = "light",
}: {
  compact?: boolean;
  tone?: "light" | "dark";
}) {
  const { connection, pendingCount, isSyncing, syncNow, lastSyncedAt } =
    useOfflineSync();
  const { t, locale } = useI18n();

  const statusLabel =
    connection.status === "live"
      ? t("sync.live")
      : connection.status === "slow"
        ? t("sync.slow")
        : t("sync.offline");

  const StatusIcon =
    connection.status === "down"
      ? WifiOff
      : connection.status === "slow"
        ? CloudOff
        : Wifi;

  const dark = tone === "dark";

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        compact ? "flex-wrap" : "flex-col items-stretch gap-2",
      )}
    >
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
          connection.status === "live" &&
            (dark ? "bg-teal/25 text-teal" : "bg-teal/15 text-teal"),
          connection.status === "slow" &&
            (dark ? "bg-gold/25 text-gold" : "bg-gold/30 text-ink"),
          connection.status === "down" &&
            (dark ? "bg-coral/25 text-coral" : "bg-coral/15 text-coral"),
        )}
        title={
          connection.latencyMs != null
            ? `${connection.latencyMs} ms · ${connection.checkedAt}`
            : connection.checkedAt
        }
      >
        <StatusIcon className="h-3.5 w-3.5" aria-hidden />
        {statusLabel}
        {connection.latencyMs != null ? (
          <span className="opacity-70">{connection.latencyMs}ms</span>
        ) : null}
        {pendingCount > 0 ? (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px]",
              dark ? "bg-white/15" : "bg-ink/10",
            )}
          >
            {t("sync.pending", { n: pendingCount })}
          </span>
        ) : null}
      </div>

      <button
        type="button"
        disabled={isSyncing || connection.status === "down"}
        onClick={() => void syncNow("manual")}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50",
          dark
            ? "border border-white/15 bg-white/10 text-stone hover:bg-white/15"
            : "border border-ink/10 bg-white text-ink hover:border-teal/40",
          compact ? "" : "w-full",
        )}
      >
        <RefreshCw
          className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")}
          aria-hidden
        />
        {isSyncing ? t("sync.syncing") : t("sync.now")}
      </button>

      {!compact && lastSyncedAt ? (
        <p className={cn("text-[10px]", dark ? "text-stone/45" : "text-ink/45")}>
          {t("sync.last", {
            time: new Date(lastSyncedAt).toLocaleTimeString(
              localeIntlTag(locale),
            ),
          })}
        </p>
      ) : null}
    </div>
  );
}
