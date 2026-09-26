"use client";

export function ConfirmDeleteDialog({
  open,
  title = "Delete permanently?",
  message = "This will be permanently deleted. Are you sure?",
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl"
      >
        <h3 className="font-display text-lg text-ink">{title}</h3>
        <p className="mt-2 text-sm text-ink/65">{message}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 rounded-xl border border-ink/15 px-4 py-2.5 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-coral px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
