"use client";

import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

export default function SettingsPage() {
  return (
    <RequireAuth>
      <Suspense
        fallback={
          <div className="h-40 animate-pulse rounded-3xl bg-ink/5" />
        }
      >
        <SettingsPanel />
      </Suspense>
    </RequireAuth>
  );
}
