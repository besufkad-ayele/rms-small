"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import {
  getUser,
  loadProfile,
  loadTenant,
  onboardOrganization,
  signIn,
  signOut,
  signUp,
  submitPaymentProof,
  updateModules,
} from "@/lib/cloud-auth";
import { createClient } from "@/lib/supabase/client";
import {
  accessWarningLevel,
  daysLeftOnAccess,
  daysLeftOnTrial,
  isOrgVerified,
  moduleEnabled,
  tenantCanUseApp,
  type AccessWarningLevel,
  type AppModule,
  type Profile,
  type TenantContext,
} from "@/lib/tenant";
import { hasFeature as checkFeature, type StaffFeature } from "@/lib/permissions";

interface AuthState {
  ready: boolean;
  user: User | null;
  profile: Profile | null;
  tenant: TenantContext | null;
  isPlatformAdmin: boolean;
  needsOnboarding: boolean;
  awaitingVerification: boolean;
  accessBlocked: boolean;
  trialDaysLeft: number;
  daysLeft: number;
  warningLevel: AccessWarningLevel;
  hasModule: (module: AppModule) => boolean;
  hasFeature: (feature: StaffFeature) => boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<string | null>;
  register: (input: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
  }) => Promise<string | null>;
  onboard: (input: {
    businessName: string;
    orgType: "cafe" | "restaurant" | "other";
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    region?: string;
    country?: string;
    inventoryEnabled: boolean;
    financeEnabled: boolean;
    licenseFile?: File | null;
    idFile?: File | null;
  }) => Promise<string | null>;
  setModules: (inventory: boolean, finance: boolean) => Promise<string | null>;
  uploadProof: (input: {
    amount: number;
    method: "cash" | "cbe" | "telebirr" | "other";
    reference?: string;
    file: File;
    monthsRequested?: number;
  }) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<TenantContext | null>(null);

  const refresh = useCallback(async () => {
    try {
      const u = await getUser();
      setUser(u);
      if (!u) {
        setProfile(null);
        setTenant(null);
        setReady(true);
        return;
      }
      const [p, t] = await Promise.all([loadProfile(), loadTenant()]);
      setProfile(p);
      setTenant(t);
    } catch (err) {
      console.error("Auth refresh failed", err);
      setProfile(null);
      setTenant(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refresh();
      } catch (err) {
        console.error(err);
        if (!cancelled) setReady(true);
      }
    })();

    let unsubscribe = () => {};
    try {
      const supabase = createClient();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(() => {
        void refresh();
      });
      unsubscribe = () => subscription.unsubscribe();
    } catch (err) {
      console.error("Supabase client init failed", err);
      setReady(true);
    }

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await signIn(email, password);
      if ("error" in result && result.error) return result.error;
      await refresh();
      return null;
    },
    [refresh],
  );

  const register = useCallback(
    async (input: {
      email: string;
      password: string;
      fullName: string;
      phone?: string;
    }) => {
      const result = await signUp(input);
      if ("error" in result && result.error) return result.error;
      await refresh();
      return null;
    },
    [refresh],
  );

  const onboard = useCallback(
    async (input: {
      businessName: string;
      orgType: "cafe" | "restaurant" | "other";
      phone?: string;
      email?: string;
      address?: string;
      city?: string;
      region?: string;
      country?: string;
      inventoryEnabled: boolean;
      financeEnabled: boolean;
      licenseFile?: File | null;
      idFile?: File | null;
    }) => {
      const result = await onboardOrganization(input);
      if ("error" in result && result.error) return result.error;
      await refresh();
      return null;
    },
    [refresh],
  );

  const setModules = useCallback(
    async (inventory: boolean, finance: boolean) => {
      if (!tenant) return "No business loaded.";
      const result = await updateModules({
        organizationId: tenant.organization.id,
        inventoryEnabled: inventory,
        financeEnabled: finance,
      });
      if ("error" in result && result.error) return result.error;
      await refresh();
      return null;
    },
    [tenant, refresh],
  );

  const uploadProof = useCallback(
    async (input: {
      amount: number;
      method: "cash" | "cbe" | "telebirr" | "other";
      reference?: string;
      file: File;
      monthsRequested?: number;
    }) => {
      if (!tenant) return "No business loaded.";
      const result = await submitPaymentProof({
        organizationId: tenant.organization.id,
        amount: input.amount,
        method: input.method,
        reference: input.reference,
        file: input.file,
        monthsRequested: input.monthsRequested,
      });
      if ("error" in result && result.error) return result.error;
      await refresh();
      return null;
    },
    [tenant, refresh],
  );

  const logout = useCallback(async () => {
    await signOut();
    setUser(null);
    setProfile(null);
    setTenant(null);
  }, []);

  const isPlatformAdmin = Boolean(profile?.is_platform_admin);
  const awaitingVerification = Boolean(
    tenant && !isOrgVerified(tenant.organization),
  );
  const accessBlocked = Boolean(tenant && !tenantCanUseApp(tenant));
  const needsOnboarding = Boolean(user && !tenant && !isPlatformAdmin);
  const trialDaysLeft = tenant ? daysLeftOnTrial(tenant.subscription) : 0;
  const daysLeft = tenant ? daysLeftOnAccess(tenant.subscription) : 0;
  const warningLevel: AccessWarningLevel = tenant
    ? accessWarningLevel(tenant.subscription)
    : "none";

  const hasModule = useCallback(
    (module: AppModule) => {
      if (!tenant) return false;
      if (!moduleEnabled(tenant.subscription, module, tenant.organization)) {
        return false;
      }
      // Module on + staff permission for related features
      if (module === "inventory") {
        return (
          checkFeature(tenant.membership, "order") ||
          checkFeature(tenant.membership, "menu") ||
          checkFeature(tenant.membership, "inventory")
        );
      }
      return checkFeature(tenant.membership, "finance");
    },
    [tenant],
  );

  const hasFeature = useCallback(
    (feature: StaffFeature) => {
      if (!tenant) return false;
      if (!checkFeature(tenant.membership, feature)) return false;
      if (feature === "order" || feature === "menu" || feature === "inventory") {
        return moduleEnabled(
          tenant.subscription,
          "inventory",
          tenant.organization,
        );
      }
      if (feature === "finance") {
        return moduleEnabled(
          tenant.subscription,
          "finance",
          tenant.organization,
        );
      }
      // billing + staff: always available to permitted roles (billing even when blocked)
      return true;
    },
    [tenant],
  );

  const value = useMemo(
    () => ({
      ready,
      user,
      profile,
      tenant,
      isPlatformAdmin,
      needsOnboarding,
      awaitingVerification,
      accessBlocked,
      trialDaysLeft,
      daysLeft,
      warningLevel,
      hasModule,
      hasFeature,
      refresh,
      login,
      register,
      onboard,
      setModules,
      uploadProof,
      logout,
    }),
    [
      ready,
      user,
      profile,
      tenant,
      isPlatformAdmin,
      needsOnboarding,
      awaitingVerification,
      accessBlocked,
      trialDaysLeft,
      daysLeft,
      warningLevel,
      hasModule,
      hasFeature,
      refresh,
      login,
      register,
      onboard,
      setModules,
      uploadProof,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
