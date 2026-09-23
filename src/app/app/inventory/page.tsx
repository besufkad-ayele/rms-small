"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { InventoryManager } from "@/components/inventory/InventoryManager";

export default function InventoryPage() {
  return (
    <RequireAuth title="Inventory" module="inventory">
      <InventoryManager />
    </RequireAuth>
  );
}
