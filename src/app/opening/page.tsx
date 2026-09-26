"use client";

import { PostAuthRouter } from "@/components/auth/PostAuthRouter";

/** Post-login holding page: load session, then route once. */
export default function OpeningPage() {
  return <PostAuthRouter message="Signing you in…" />;
}
