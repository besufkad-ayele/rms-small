"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";

/** Legacy billing URL → Settings & Billing. */
export default function BillingRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app/settings?tab=billing");
  }, [router]);
  return <AuthLoadingScreen message="Opening settings…" />;
}
