"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { KitchenBoard } from "@/components/kitchen/KitchenBoard";

export default function KitchenPage() {
  return (
    <RequireAuth title="Kitchen" module="kitchen" feature="kitchen">
      <KitchenBoard />
    </RequireAuth>
  );
}
