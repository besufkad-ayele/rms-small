"use client";

import { Suspense } from "react";
import { RequireAccess } from "@/components/auth/RequireAuth";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

export default function SettingsPage() {
  return (
    <RequireAccess>
      <Suspense
        fallback={
          <div className="space-y-3">
            <div className="shimmer h-10 w-56 rounded-2xl" />
            <div className="shimmer h-40 rounded-3xl" />
            <div className="shimmer h-24 rounded-3xl" />
          </div>
        }
      >
        <SettingsPanel />
      </Suspense>
    </RequireAccess>
  );
}
