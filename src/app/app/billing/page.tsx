"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { BillingPanel } from "@/components/billing/BillingPanel";

export default function BillingPage() {
  return (
    <RequireAuth title="Billing" feature="billing" allowWhenBlocked>
      <BillingPanel />
    </RequireAuth>
  );
}
