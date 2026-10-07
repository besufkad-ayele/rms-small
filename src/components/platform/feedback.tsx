"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FormHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

// ─── Spinner ────────────────────────────────────────────

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent",
        className,
      )}
    />
  );
}

// ─── Toasts ─────────────────────────────────────────────

type ToastKind = "success" | "error" | "info";

type Toast = {
  id: number;
  kind: ToastKind;
  title: string;
  message: string;
  detail?: string;
};

type ToastApi = {
  success: (message: string) => void;
  error: (raw: unknown, context?: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      success: () => {},
      error: () => {},
      info: () => {},
    } satisfies ToastApi;
  }
  return ctx;
}

/** Fail the current ActionButton / AsyncForm so a toast is shown. */
export function throwIfError(
  res: unknown,
  fallback = "Request failed",
): void {
  if (res && typeof res === "object" && "error" in res) {
    const err = (res as { error?: unknown }).error;
    if (err) throw new Error(String(err) || fallback);
  }
}

type LockApi = {
  busy: boolean;
  begin: () => void;
  end: () => void;
};

const LockContext = createContext<LockApi>({
  busy: false,
  begin: () => {},
  end: () => {},
});

export function useActionLock() {
  return useContext(LockContext);
}

function rawMessage(raw: unknown): string {
  if (raw instanceof Error) return raw.message;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "message" in raw) {
    return String((raw as { message: unknown }).message);
  }
  return "Unknown error";
}

/** Turn database / network errors into something an operator can act on. */
export function explainError(raw: unknown): { title: string; message: string; detail?: string } {
  const text = rawMessage(raw).trim();
  const rules: Array<[RegExp, string, string]> = [
    [/failed to fetch|networkerror|fetch failed|load failed|network request failed/i,
      "Connection problem", "Could not reach the server. Check your internet connection and try again."],
    [/not signed in|jwt|session.*(expired|missing)|invalid refresh token/i,
      "Signed out", "Your session has expired. Sign in again to continue."],
    [/not a platform admin|unauthorized/i,
      "Not allowed", "This account is not a platform admin."],
    [/column .* does not exist|could not find the .* column|schema cache/i,
      "Database needs an update", "A database migration has not been applied yet. Apply the pending migrations in Supabase and retry."],
    [/relation .* does not exist/i,
      "Database needs an update", "A table this feature needs is missing. Apply the pending migrations in Supabase."],
    [/duplicate key|already exists|unique constraint/i,
      "Already exists", "A record with the same value already exists. Use a different value."],
    [/violates foreign key/i,
      "Still in use", "Other records still depend on this. Remove or move those first."],
    [/row-level security|permission denied/i,
      "Permission denied", "The database refused this change."],
    [/invalid input syntax|invalid input value/i,
      "Invalid value", "One of the values is not in the expected format."],
    [/timeout|timed out|statement timeout/i,
      "Took too long", "The server took too long to respond. Try again in a moment."],
  ];
  for (const [re, title, message] of rules) {
    if (re.test(text)) return { title, message, detail: text };
  }
  return { title: "Action failed", message: text || "Unknown error" };
}

export function ToastProvider({
  children,
  onError,
}: {
  children: ReactNode;
  /** Called on every error, e.g. to release a global busy lock. */
  onError?: () => void;
}) {
  const [lockCount, setLockCount] = useState(0);
  const lock = useMemo<LockApi>(
    () => ({
      busy: lockCount > 0,
      begin: () => setLockCount((n) => n + 1),
      end: () => setLockCount((n) => Math.max(0, n - 1)),
    }),
    [lockCount],
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      seq.current += 1;
      const id = seq.current;
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      if (t.kind !== "error") setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push({ kind: "success", title: "Done", message }),
      info: (message) => push({ kind: "info", title: "Note", message }),
      error: (raw, context) => {
        const e = explainError(raw);
        push({
          kind: "error",
          title: context ? `${context} — ${e.title}` : e.title,
          message: e.message,
          detail: e.detail,
        });
        onErrorRef.current?.();
      },
    }),
    [push],
  );

  const errors = toasts.filter((t) => t.kind === "error");
  const others = toasts.filter((t) => t.kind !== "error");

  return (
    <LockContext.Provider value={lock}>
      <ToastContext.Provider value={api}>
        {children}
        {errors.length > 0 ? (
          <div
            aria-live="assertive"
            className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col"
          >
            {errors.map((t) => (
              <ErrorBanner key={t.id} toast={t} onClose={() => dismiss(t.id)} />
            ))}
          </div>
        ) : null}
        <div
          aria-live="polite"
          className={cn(
            "pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-3 sm:px-4",
            errors.length
              ? "top-24"
              : "bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-auto lg:top-3",
          )}
        >
          {others.map((t) => (
            <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />
          ))}
        </div>
      </ToastContext.Provider>
    </LockContext.Provider>
  );
}

function ErrorBanner({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [showDetail, setShowDetail] = useState(Boolean(toast.detail));
  const copyText = [toast.title, toast.message, toast.detail]
    .filter(Boolean)
    .join("\n");
  return (
    <div
      role="alert"
      className="pointer-events-auto border-b-2 border-[#c4452d] bg-[#8c2f1c] px-4 py-3 text-[#fff4f0] shadow-[0_12px_40px_-8px_rgba(0,0,0,0.55)] sm:px-5"
    >
      <div className="mx-auto flex max-w-5xl items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-sm font-black text-[#8c2f1c]"
        >
          !
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold sm:text-base">{toast.title}</p>
          <p className="mt-0.5 text-sm leading-snug text-white/95">{toast.message}</p>
          {toast.detail ? (
            <>
              <button
                type="button"
                className="mt-1 text-xs font-semibold underline decoration-white/40"
                onClick={() => setShowDetail((v) => !v)}
              >
                {showDetail ? "Hide technical details" : "Show technical details"}
              </button>
              {showDetail ? (
                <pre className="mt-1.5 max-h-36 overflow-auto whitespace-pre-wrap rounded-lg bg-black/25 p-2 text-[11px] leading-snug">
                  {toast.detail}
                </pre>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="rounded-lg bg-white/15 px-2 py-1 text-[11px] font-semibold hover:bg-white/25"
            onClick={() => void navigator.clipboard.writeText(copyText)}
          >
            Copy
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss error"
            className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-[#8c2f1c] hover:bg-white/90"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const tone =
    toast.kind === "success"
      ? "border-[#2a9d8f] bg-[#0d2724] text-[#d4f3ee]"
      : "border-white/20 bg-[#0b1d1a] text-[#eef2f0]";
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto w-full max-w-md rounded-2xl border-2 p-3 text-sm shadow-[0_16px_50px_-8px_rgba(0,0,0,0.55)]",
        tone,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
            toast.kind === "success" ? "bg-[#2a9d8f] text-white" : "bg-white/20",
          )}
        >
          {toast.kind === "success" ? "✓" : "i"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{toast.title}</p>
          <p className="mt-0.5 break-words opacity-90">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 rounded-lg px-1.5 text-base leading-none opacity-60 hover:opacity-100"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ─── Buttons ────────────────────────────────────────────

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  pendingLabel?: ReactNode;
};

function ButtonInner({
  pending,
  pendingLabel,
  children,
}: {
  pending: boolean;
  pendingLabel?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {pending ? <Spinner /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </>
  );
}

const BASE = "inline-flex items-center justify-center gap-1.5 transition disabled:cursor-not-allowed disabled:opacity-50";

/** Button that runs an async action: spinner + disabled while it runs, errors go to a toast. */
export function ActionButton({
  onAction,
  disabled,
  className,
  children,
  pendingLabel,
  type = "button",
  ...rest
}: ButtonProps & { onAction: () => unknown }) {
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const lock = useActionLock();
  const blocked = disabled || pending || (lock.busy && !pending);

  async function run() {
    if (pending || lock.busy) return;
    setPending(true);
    lock.begin();
    try {
      await onAction();
    } catch (e) {
      toast.error(
        e,
        typeof pendingLabel === "string"
          ? pendingLabel.replace(/[.…]+$/, "")
          : undefined,
      );
    } finally {
      lock.end();
      setPending(false);
    }
  }

  return (
    <button
      {...rest}
      type={type}
      disabled={blocked}
      aria-busy={pending || undefined}
      onClick={() => void run()}
      className={cn(BASE, className)}
    >
      <ButtonInner pending={pending} pendingLabel={pendingLabel}>
        {children}
      </ButtonInner>
    </button>
  );
}

const FormPendingContext = createContext(false);

/** Form whose async submit drives its SubmitButton's spinner. */
export function AsyncForm({
  onSubmitAsync,
  children,
  ...rest
}: Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  onSubmitAsync: (fd: FormData, form: HTMLFormElement) => unknown;
}) {
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const lock = useActionLock();
  return (
    <FormPendingContext.Provider value={pending}>
      <form
        {...rest}
        aria-busy={pending || undefined}
        onSubmit={(e) => {
          e.preventDefault();
          if (pending || lock.busy) return;
          const form = e.currentTarget;
          const fd = new FormData(form);
          setPending(true);
          lock.begin();
          void (async () => {
            try {
              await onSubmitAsync(fd, form);
            } catch (err) {
              toast.error(err);
            } finally {
              lock.end();
              setPending(false);
            }
          })();
        }}
      >
        {children}
      </form>
    </FormPendingContext.Provider>
  );
}

export function SubmitButton({
  disabled,
  className,
  children,
  pendingLabel,
  ...rest
}: ButtonProps) {
  const pending = useContext(FormPendingContext);
  const lock = useActionLock();
  return (
    <button
      {...rest}
      type="submit"
      disabled={disabled || pending || (lock.busy && !pending)}
      aria-busy={pending || undefined}
      className={cn(BASE, className)}
    >
      <ButtonInner pending={pending} pendingLabel={pendingLabel}>
        {children}
      </ButtonInner>
    </button>
  );
}
