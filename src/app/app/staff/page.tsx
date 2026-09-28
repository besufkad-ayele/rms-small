"use client";

import { RequireAccess } from "@/components/auth/RequireAuth";
import { StaffPanel } from "@/components/staff/StaffPanel";

export default function StaffPage() {
  return (
    <RequireAccess module="hr" feature="staff">
      <StaffPanel />
    </RequireAccess>
  );
}
