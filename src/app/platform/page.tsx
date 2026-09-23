"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { loadProfile } from "@/lib/cloud-auth";
import { PlatformDashboard } from "@/components/platform/PlatformDashboard";

export default function PlatformPage() {
  const { ready, user, logout } = useAuth();
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    void (async () => {
      const profile = await loadProfile();
      if (!profile?.is_platform_admin) {
        setAllowed(false);
        setChecking(false);
        return;
      }
      setAllowed(true);
      setChecking(false);
    })();
  }, [ready, user, router]);

  if (!ready || checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-stone">
        <p className="text-sm text-ink/60">Loading platform…</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-stone px-4">
        <p className="text-sm text-ink/70">Not authorized for Aramis platform admin.</p>
        <button
          type="button"
          className="rounded-xl bg-ink px-4 py-2 text-sm text-stone"
          onClick={() => void logout().then(() => router.replace("/login"))}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-stone">
      <header className="sticky top-0 z-20 border-b border-ink/8 bg-stone/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal">
              Aramis Product
            </p>
            <h1 className="font-display text-xl">Owner console</h1>
          </div>
          <button
            type="button"
            onClick={() => void logout().then(() => router.replace("/login"))}
            className="rounded-xl border border-ink/15 px-3 py-2 text-sm"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-6">
        <PlatformDashboard />
      </main>
    </div>
  );
}
