"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { StaffPanel } from "@/components/staff/StaffPanel";

export default function StaffPage() {
  return (
    <RequireAuth title="Staff & HR" feature="staff">
      <StaffPanel />
    </RequireAuth>
  );
}
