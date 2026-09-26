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
        <p className="text-sm text-ink/70">
          Not authorized for Aramis platform admin.
        </p>
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
    <PlatformDashboard
      onSignOut={() => void logout().then(() => router.replace("/login"))}
    />
  );
}
