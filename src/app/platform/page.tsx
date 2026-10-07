"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PlatformDashboard } from "@/components/platform/PlatformDashboard";
import { PlatformPageShimmer } from "@/components/ui/Shimmer";

export default function PlatformPage() {
  const { ready, sessionResolved, user, isPlatformAdmin, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready || !sessionResolved) return;
    if (!user) {
      router.replace("/login");
    }
  }, [ready, sessionResolved, user, router]);

  if (!ready || !sessionResolved || !user) {
    return <PlatformPageShimmer />;
  }

  if (!isPlatformAdmin) {
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
