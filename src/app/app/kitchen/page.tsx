"use client";

import { RequireAccess } from "@/components/auth/RequireAuth";
import { KitchenBoard } from "@/components/kitchen/KitchenBoard";

export default function KitchenPage() {
  return (
    <RequireAccess module="kitchen" feature="kitchen">
      <KitchenBoard />
    </RequireAccess>
  );
}
