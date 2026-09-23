"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { HomeHub } from "@/components/home/HomeHub";

export default function AppHomePage() {
  return (
    <RequireAuth title="Home">
      <HomeHub />
    </RequireAuth>
  );
}
