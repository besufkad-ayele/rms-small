"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { adminLoginAction } from "@/app/apply/actions";
import { useAuth } from "@/components/auth/AuthProvider";

export default function AdminLoginPage() {
  const { ready, isPlatformAdmin, refresh } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (ready && isPlatformAdmin) router.replace("/platform");
  }, [ready, isPlatformAdmin, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await adminLoginAction(
      String(fd.get("email") ?? ""),
      String(fd.get("password") ?? ""),
    );
    if ("error" in res && res.error) {
      setBusy(false);
      setError(res.error);
      return;
    }
    await refresh();
    setBusy(false);
    router.replace("/platform");
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink text-stone">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#E9C46A33,_transparent_50%),radial-gradient(ellipse_at_bottom,_#2A9D8F22,_transparent_45%)]" />
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl text-white">Admin</h1>
          <p className="mt-2 text-sm text-stone/65">Platform access only</p>
        </div>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur"
        >
          <label className="block text-sm">
            <span className="mb-1 block text-stone/70">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              className="w-full rounded-xl border border-white/15 bg-ink/40 px-3 py-3 outline-none focus:ring-2 focus:ring-gold/40"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-stone/70">Password</span>
            <div className="relative">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-white/15 bg-ink/40 px-3 py-3 pr-11 outline-none focus:ring-2 focus:ring-gold/40"
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
            className="w-full rounded-xl bg-gold px-4 py-3.5 text-sm font-semibold text-ink disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {error ? (
            <p className="rounded-xl bg-coral/20 px-3 py-2 text-sm text-coral">
              {error}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
