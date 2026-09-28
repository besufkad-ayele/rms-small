"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";

/**
 * Shared shell for all /app/* routes.
 * Keeps AppShell mounted across soft navigations so sidebar/header don't flash
 * and only the page content remounts.
 */
export default function AppSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireAuth>{children}</RequireAuth>;
}
