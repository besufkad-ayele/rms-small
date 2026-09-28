"use client";

import { RequireAccess } from "@/components/auth/RequireAuth";
import { MenuManager } from "@/components/menu/MenuManager";

export default function MenuPage() {
  return (
    <RequireAccess module="menu" feature="menu">
      <MenuManager />
    </RequireAccess>
  );
}
