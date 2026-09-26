"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { StaffPanel } from "@/components/staff/StaffPanel";

export default function StaffPage() {
  return (
    <RequireAuth title="Staff & HR" module="hr" feature="staff">
      <StaffPanel />
    </RequireAuth>
  );
}
