"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

export function LoginScreen({
  variant = "default",
}: {
  /** Staff-focused copy; same auth underneath */
  variant?: "default" | "staff";
}) {
  const { ready, login } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const justApproved = search.get("approved") === "1";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isStaff = variant === "staff";

  const subtitle = useMemo(() => {
    if (isStaff) {
      return "Use the email and password your restaurant owner created for you.";
    }
    if (justApproved) {
      return "Your account was approved. Sign in with the password you chose when you signed up.";
    }
    return "Owners and staff sign in here with the email and password from signup (or staff invite).";
  }, [justApproved, isStaff]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const err = await login(
      String(fd.get("email") ?? ""),
      String(fd.get("password") ?? ""),
    );
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    router.replace("/");
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink text-stone">
        <p className="text-sm text-stone/70">Loading…</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink text-stone">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#2A9D8F40,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_#E9C46A28,_transparent_45%)]" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal">
            Aramis Product
          </p>
          <h1 className="mt-3 font-display text-4xl tracking-tight text-white sm:text-5xl">
            {isStaff ? "Staff sign in" : "Sign in"}
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm text-stone/70">{subtitle}</p>
        </div>

        {justApproved && !isStaff ? (
          <div className="mb-4 rounded-2xl border border-teal/40 bg-teal/15 px-4 py-3 text-center text-sm text-teal">
            Access granted — sign in with the password you created at signup.
          </div>
        ) : null}

        {isStaff ? (
          <div className="mb-4 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-center text-sm text-gold">
            You’ll only see the restaurant and features your owner enabled for
            you.
          </div>
        ) : null}

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-md sm:p-8">
          <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
            <label className="block text-sm">
              <span className="mb-1.5 block text-stone/70">Email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-white/15 bg-ink/40 px-3 py-3 text-stone outline-none ring-teal/40 focus:ring-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-stone/70">Password</span>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-white/15 bg-ink/40 px-3 py-3 pr-11 text-stone outline-none ring-teal/40 focus:ring-2"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-stone/55 hover:text-stone"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full rounded-xl bg-teal px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal/25 transition hover:bg-teal/90 disabled:opacity-60"
            >
              {busy ? "Please wait…" : "Sign in"}
            </button>
          </form>

          {error ? (
            <p className="mt-4 rounded-xl bg-coral/20 px-3 py-2 text-sm text-coral">
              {error}
            </p>
          ) : null}

          <p className="mt-6 text-center text-sm text-stone/65">
            {isStaff ? (
              <>
                Business owner?{" "}
                <Link href="/login" className="font-medium text-gold underline">
                  Owner sign in
                </Link>
              </>
            ) : (
              <>
                Team member?{" "}
                <Link
                  href="/staff-login"
                  className="font-medium text-gold underline"
                >
                  Staff sign in
                </Link>
                <span className="mx-2 text-stone/40">·</span>
                New here?{" "}
                <Link href="/signup" className="font-medium text-gold underline">
                  Create account
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
