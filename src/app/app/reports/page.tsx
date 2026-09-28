"use client";

import { RequireAccess } from "@/components/auth/RequireAuth";
import { FinanceDashboardPanel } from "@/components/finance/FinanceDashboardPanel";

export default function ReportsPage() {
  return (
    <RequireAccess module="finance" feature="finance">
      <FinanceDashboardPanel />
    </RequireAccess>
  );
}
