"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { MenuManager } from "@/components/menu/MenuManager";

export default function MenuPage() {
  return (
    <RequireAuth title="Menu" module="menu" feature="menu">
      <MenuManager />
    </RequireAuth>
  );
}
