"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SignupScreen } from "@/components/auth/SignupScreen";
import { useAuth } from "@/components/auth/AuthProvider";

export default function SignupPage() {
  const { ready, user, tenant, isPlatformAdmin, awaitingVerification } =
    useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready || !user) return;
    if (isPlatformAdmin) {
      router.replace("/platform");
      return;
    }
    if (!tenant) {
      router.replace("/onboarding");
      return;
    }
    if (awaitingVerification) {
      router.replace("/pending");
      return;
    }
    router.replace("/app");
  }, [ready, user, tenant, isPlatformAdmin, awaitingVerification, router]);

  return <SignupScreen />;
}
