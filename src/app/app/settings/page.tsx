"use client";

import { Suspense } from "react";
import { RequireAccess } from "@/components/auth/RequireAuth";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

export default function SettingsPage() {
  return (
    <RequireAccess feature="billing" ownerOnly allowWhenBlocked>
      <Suspense
        fallback={
          <div className="h-40 animate-pulse rounded-3xl bg-ink/5" />
        }
      >
        <SettingsPanel />
      </Suspense>
    </RequireAccess>
  );
}
