"use client";

import { useEffect } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";

export function ConfirmDeleteDialog({
  open,
  title,
  message,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title?: string;
  message?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const heading = title ?? t("dialog.deleteTitle");
  const body = message ?? t("dialog.deleteMessage");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        aria-describedby="confirm-delete-body"
        className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-delete-title" className="font-display text-lg text-ink">
          {heading}
        </h3>
        <p id="confirm-delete-body" className="mt-2 text-sm text-ink/65">
          {body}
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 rounded-xl border border-ink/15 px-4 py-2.5 text-sm font-medium"
          >
            {t("dialog.cancel")}
          </button>
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-coral px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? t("dialog.deleting") : t("dialog.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
