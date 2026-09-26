"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { FinanceDashboardPanel } from "@/components/finance/FinanceDashboardPanel";

export default function ReportsPage() {
  return (
    <RequireAuth title="Finance" module="finance" feature="finance">
      <FinanceDashboardPanel />
    </RequireAuth>
  );
}
