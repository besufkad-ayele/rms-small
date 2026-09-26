"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import {
  getUser,
  loadProfile,
  loadTenantDetailed,
  onboardOrganization,
  signIn,
  signOut,
  signUp,
  submitPaymentProof,
  updateModules,
  type ModuleFlags,
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
  /** Confirmed membership exists (even if tenant payload failed to load). */
  hasMembership: boolean;
  /** Load failure — never treat as needs-onboarding. */
  tenantError: string | null;
  isPlatformAdmin: boolean;
  /** Only true when logged in, not admin, and confirmed NO membership. */
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
    tin?: string;
    vatNumber?: string;
    website?: string;
    inventoryEnabled: boolean;
    financeEnabled: boolean;
    menuEnabled?: boolean;
    orderingEnabled?: boolean;
    hrEnabled?: boolean;
    licenseFile?: File | null;
    idFile?: File | null;
  }) => Promise<string | null>;
  setModules: (flags: ModuleFlags) => Promise<string | null>;
  uploadProof: (input: {
    amount: number;
    method: "cash" | "cbe" | "telebirr" | "other";
    reference?: string;
    file: File;
    monthsRequested?: number;
    modules?: Partial<ModuleFlags>;
    packageCode?: string | null;
    expectedAmountEtb?: number | null;
    amountBreakdown?: Record<string, unknown> | null;
  }) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Map staff features → subscription module gates. */
function featureModule(feature: StaffFeature): AppModule | null {
  switch (feature) {
    case "menu":
      return "menu";
    case "order":
      return "ordering";
    case "inventory":
      return "inventory";
    case "finance":
      return "finance";
    case "staff":
      return "hr";
    case "billing":
      return null;
    default:
      return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<TenantContext | null>(null);
  const [hasMembership, setHasMembership] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);
  /** Serialize refreshes — every caller must run AFTER prior work (never skip). */
  const refreshChain = useRef(Promise.resolve());
  const lastRefreshAt = useRef(0);

  const refresh = useCallback(async () => {
    // Previous buggy coalesce awaited in-flight then returned without reloading.
    // That left stale hasMembership=false after onboard/login and sent users
    // back to /onboarding forever.
    const run = async () => {
      try {
        const u = await getUser();
        setUser(u);
        if (!u) {
          setProfile(null);
          setTenant(null);
          setHasMembership(false);
          setTenantError(null);
          return;
        }
        const [p, tenantResult] = await Promise.all([
          loadProfile(),
          loadTenantDetailed(),
        ]);
        setProfile(p);

        if (tenantResult.error && tenantResult.hasMembership) {
          // Membership exists — keep prior tenant if we have one; never clear to onboarding
          setHasMembership(true);
          setTenantError(tenantResult.error);
          if (tenantResult.tenant) setTenant(tenantResult.tenant);
        } else if (tenantResult.error && !tenantResult.hasMembership) {
          // Ambiguous failure (network) — do NOT assume needs onboarding
          setTenantError(tenantResult.error);
          // Leave hasMembership/tenant as-is if we already knew them
        } else {
          setTenantError(null);
          setHasMembership(tenantResult.hasMembership);
          setTenant(tenantResult.tenant);
        }
      } catch (err) {
        console.error("Auth refresh failed", err);
        setTenantError(
          err instanceof Error ? err.message : "Could not load your account",
        );
        // Do NOT clear tenant/hasMembership on transient errors
      } finally {
        setReady(true);
        lastRefreshAt.current = Date.now();
      }
    };

    const next = refreshChain.current.then(run, run);
    refreshChain.current = next.then(
      () => undefined,
      () => undefined,
    );
    await next;
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
      } = supabase.auth.onAuthStateChange((event) => {
        // Skip noisy token refreshes when we refreshed recently
        if (
          event === "TOKEN_REFRESHED" &&
          Date.now() - lastRefreshAt.current < 15_000
        ) {
          return;
        }
        if (event === "INITIAL_SESSION") {
          // Initial mount already calls refresh()
          return;
        }
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
      tin?: string;
      vatNumber?: string;
      website?: string;
      inventoryEnabled: boolean;
      financeEnabled: boolean;
      menuEnabled?: boolean;
      orderingEnabled?: boolean;
      hrEnabled?: boolean;
      licenseFile?: File | null;
      idFile?: File | null;
    }) => {
      const result = await onboardOrganization(input);
      if ("error" in result && result.error) return result.error;
      // Optimistic: membership row exists after successful RPC — never flash
      // back to the onboarding form while refresh catches up.
      setHasMembership(true);
      setTenantError(null);
      await refresh();
      return null;
    },
    [refresh],
  );

  const setModules = useCallback(
    async (flags: ModuleFlags) => {
      if (!tenant) return "No business loaded.";
      const result = await updateModules({
        organizationId: tenant.organization.id,
        ...flags,
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
      modules?: Partial<ModuleFlags>;
      packageCode?: string | null;
      expectedAmountEtb?: number | null;
      amountBreakdown?: Record<string, unknown> | null;
    }) => {
      if (!tenant) return "No business loaded.";
      const result = await submitPaymentProof({
        organizationId: tenant.organization.id,
        amount: input.amount,
        method: input.method,
        reference: input.reference,
        file: input.file,
        monthsRequested: input.monthsRequested,
        modules: input.modules,
        packageCode: input.packageCode,
        expectedAmountEtb: input.expectedAmountEtb,
        amountBreakdown: input.amountBreakdown,
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
    setHasMembership(false);
    setTenantError(null);
  }, []);

  const isPlatformAdmin = Boolean(profile?.is_platform_admin);
  const awaitingVerification = Boolean(
    tenant && !isOrgVerified(tenant.organization),
  );
  const accessBlocked = Boolean(tenant && !tenantCanUseApp(tenant));
  // ONLY when we know there is no membership — never on load errors
  const needsOnboarding = Boolean(
    user &&
      !isPlatformAdmin &&
      !hasMembership &&
      !tenant &&
      !tenantError,
  );
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
        return checkFeature(tenant.membership, "inventory");
      }
      if (module === "menu") {
        return checkFeature(tenant.membership, "menu");
      }
      if (module === "ordering") {
        return checkFeature(tenant.membership, "order");
      }
      if (module === "finance") {
        return checkFeature(tenant.membership, "finance");
      }
      if (module === "hr") {
        return checkFeature(tenant.membership, "staff");
      }
      return false;
    },
    [tenant],
  );

  const hasFeature = useCallback(
    (feature: StaffFeature) => {
      if (!tenant) return false;
      if (!checkFeature(tenant.membership, feature)) return false;
      const mod = featureModule(feature);
      if (!mod) return true; // billing: permission only
      return moduleEnabled(tenant.subscription, mod, tenant.organization);
    },
    [tenant],
  );

  const value = useMemo(
    () => ({
      ready,
      user,
      profile,
      tenant,
      hasMembership,
      tenantError,
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
      hasMembership,
      tenantError,
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
