"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  approveOrganizationAction,
  approvePaymentProofAction,
  getKycSignedUrlAction,
  getPlatformOverviewAction,
  getTenantUsageAction,
  listPaymentProofsAction,
  listPlatformTenantsAction,
  listPricingCatalogAction,
  rejectOrganizationAction,
  rejectPaymentProofAction,
  type PaymentProofRow,
  type PlatformOverviewStats,
  type PlatformTenantRow,
} from "@/app/platform/actions";
import type { TenantUsage } from "@/lib/platform-metrics";
import type { AddonRow, ModulePriceRow, PackageRow } from "@/lib/pricing";
import { cn, formatDateTime } from "@/lib/utils";
import { AramisLogo } from "@/components/brand/AramisLogo";
import { InstallAppButton } from "@/components/offline/InstallAppButton";
import {
  ClipboardCheck,
  CreditCard,
  LayoutGrid,
  Tags,
  Users,
} from "lucide-react";
import {
  ActionButton,
  throwIfError,
  ToastProvider,
  useToast,
} from "./feedback";
import { OnboardingSection } from "./OnboardingSection";
import { OverviewSection } from "./OverviewSection";
import { PackagesSection } from "./PackagesSection";
import { PaymentsSection } from "./PaymentsSection";
import { RestaurantDetail } from "./RestaurantDetail";
import {
  DEFAULT_SUBSCRIBER_VIEW,
  SubscribersSection,
  type SubscriberView,
} from "./SubscribersSection";
import {
  flagsFromProof,
  flagsFromSub,
  fromDatetimeLocalValue,
  type ModuleState,
  type PlatformSection,
} from "./platform-ui";
import { SectionShimmer } from "@/components/ui/Shimmer";
import { useAuth } from "@/components/auth/AuthProvider";
import { OwnerAlertsCard, usePlatformAlerts } from "./PlatformAlerts";
import { PlatformProfile, profileInitials } from "./PlatformProfile";

const NAV: Array<{
  id: PlatformSection;
  label: string;
  short: string;
  badge?: "kyc" | "payments";
  icon: typeof LayoutGrid;
}> = [
  { id: "overview", label: "Overview", short: "Home", icon: LayoutGrid },
  { id: "packages", label: "Packages & pricing", short: "Prices", icon: Tags },
  {
    id: "onboarding",
    label: "Onboarding / KYC",
    short: "KYC",
    badge: "kyc",
    icon: ClipboardCheck,
  },
  {
    id: "payments",
    label: "Payments",
    short: "Pay",
    badge: "payments",
    icon: CreditCard,
  },
  { id: "subscribers", label: "Subscribers", short: "Cafés", icon: Users },
];

export function PlatformDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <ToastProvider onError={() => setBusy(false)}>
      <DashboardInner onSignOut={onSignOut} busy={busy} setBusy={setBusy} />
    </ToastProvider>
  );
}

function DashboardInner({
  onSignOut,
  busy,
  setBusy,
}: {
  onSignOut: () => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
}) {
  const toast = useToast();
  const { profile, user } = useAuth();
  const adminName = profile?.full_name?.trim() || "Platform admin";
  const adminEmail = profile?.email || user?.email || "";
  const initials = profileInitials(adminName);
  const setError = useCallback(
    (v: string | null) => {
      if (v) toast.error(v);
    },
    [toast],
  );
  const reportLoad = useCallback(
    (what: string, err: string | undefined) =>
      toast.error(err || "Unknown error", `Loading ${what}`),
    [toast],
  );
  const [section, setSection] = useState<PlatformSection>("overview");
  const [tenants, setTenants] = useState<PlatformTenantRow[]>([]);
  const [proofs, setProofs] = useState<PaymentProofRow[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [modulePrices, setModulePrices] = useState<ModulePriceRow[]>([]);
  const [addons, setAddons] = useState<AddonRow[]>([]);
  const [stats, setStats] = useState<PlatformOverviewStats | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const [filter, setFilter] = useState<
    "pending" | "approved" | "rejected" | "all"
  >("pending");
  const [subscriberView, setSubscriberView] = useState<SubscriberView>(
    DEFAULT_SUBSCRIBER_VIEW,
  );
  const [usage, setUsage] = useState<Record<string, TenantUsage> | null>(null);
  const [usageDayKeys, setUsageDayKeys] = useState<string[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [lastCreds, setLastCreds] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [showLastCreds, setShowLastCreds] = useState(false);

  const [approveMods, setApproveMods] = useState<Record<string, ModuleState>>(
    {},
  );
  const [trialDaysByOrg, setTrialDaysByOrg] = useState<Record<string, number>>(
    {},
  );
  const [trialMonthsByOrg, setTrialMonthsByOrg] = useState<
    Record<string, number>
  >({});
  const [trialEndsByOrg, setTrialEndsByOrg] = useState<Record<string, string>>(
    {},
  );
  const [followUpByOrg, setFollowUpByOrg] = useState<Record<string, string>>(
    {},
  );
  const [followUpNoteByOrg, setFollowUpNoteByOrg] = useState<
    Record<string, string>
  >({});
  const [proofMods, setProofMods] = useState<Record<string, ModuleState>>({});
  const [proofMonths, setProofMonths] = useState<Record<string, number>>({});
  const [proofPkg, setProofPkg] = useState<Record<string, string>>({});

  const pendingKyc = useMemo(
    () =>
      tenants.filter((t) => t.organization.verification_status === "pending")
        .length,
    [tenants],
  );
  const pendingPayments = useMemo(
    () => proofs.filter((p) => p.status === "pending").length,
    [proofs],
  );

  const loadTenants = useCallback(async () => {
    const t = await listPlatformTenantsAction();
    if ("error" in t) {
      reportLoad("restaurants", t.error);
      return;
    }
    setTenants(t.tenants);
    const nextApprove: Record<string, ModuleState> = {};
    for (const row of t.tenants) {
      nextApprove[String(row.organization.id)] = flagsFromSub(row.subscription);
    }
  }, [reportLoad]);

  const loadProofs = useCallback(async () => {
    const p = await listPaymentProofsAction();
    if ("error" in p) {
      reportLoad("payments", p.error);
      return;
    }
    setProofs(p.proofs);
    const nextProofMods: Record<string, ModuleState> = {};
    const nextMonths: Record<string, number> = {};
    const nextPkg: Record<string, string> = {};
    for (const proof of p.proofs) {
      nextProofMods[proof.id] = flagsFromProof(proof);
      nextMonths[proof.id] = Number(proof.months_requested || 1);
      nextPkg[proof.id] = String(proof.package_code || "");
    }
    setProofMods(nextProofMods);
    setProofMonths(nextMonths);
    setProofPkg(nextPkg);
  }, [reportLoad]);

  const loadCatalog = useCallback(async () => {
    const c = await listPricingCatalogAction();
    if ("error" in c) {
      reportLoad("packages", c.error);
      return;
    }
    setPackages(c.packages);
    setModulePrices(c.modulePrices);
    setAddons(c.addons || []);
  }, [reportLoad]);

  const loadOverview = useCallback(async () => {
    const o = await getPlatformOverviewAction();
    if ("error" in o) {
      reportLoad("overview", o.error);
      return;
    }
    setStats(o.stats);
  }, [reportLoad]);

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    const u = await getTenantUsageAction();
    setUsageLoading(false);
    if ("error" in u) {
      reportLoad("usage", u.error);
      return;
    }
    setUsage(u.usage);
    setUsageDayKeys(u.dayKeys);
  }, [reportLoad]);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    void loadUsage();
    await Promise.all([
      loadTenants(),
      loadProofs(),
      loadCatalog(),
      loadOverview(),
    ]);
    setLoading(false);
  }, [loadCatalog, loadOverview, loadProofs, loadTenants, loadUsage]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "profile" || NAV.some((n) => n.id === tab)) {
      setSection(tab as PlatformSection);
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void Promise.all([loadOverview(), loadProofs(), loadTenants()]);
    }, 45_000);
    return () => window.clearInterval(id);
  }, [loadOverview, loadProofs, loadTenants]);

  const go = useCallback((sectionId: PlatformSection) => {
    setSection(sectionId);
    if (sectionId !== "detail") setSelectedOrgId(null);
    const url = new URL(window.location.href);
    if (sectionId === "overview" || sectionId === "detail") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", sectionId);
    }
    window.history.replaceState(null, "", url);
  }, []);

  const alerts = usePlatformAlerts({
    proofs,
    tenants,
    ready: !loading || tenants.length > 0 || proofs.length > 0,
    onOpen: go,
  });

  function openDetail(orgId: string) {
    setSelectedOrgId(orgId);
    setSection("detail");
  }

  const selectedTenant = useMemo(
    () =>
      selectedOrgId
        ? tenants.find((t) => String(t.organization.id) === selectedOrgId) ||
          null
        : null,
    [selectedOrgId, tenants],
  );

  const orgProofs = useMemo(() => {
    if (!selectedOrgId) return [];
    return proofs.filter((p) => p.organization_id === selectedOrgId);
  }, [proofs, selectedOrgId]);

  const flashOk = useCallback(async (msg: string) => {
    toast.success(msg);
  }, [toast]);

  async function approveOrg(row: PlatformTenantRow) {
    const orgId = String(row.organization.id);
    const mods = approveMods[orgId] ?? flagsFromSub(row.subscription);
    setLastCreds(null);
    setShowLastCreds(false);
    const res = await approveOrganizationAction({
      organizationId: orgId,
      trialDays: trialDaysByOrg[orgId] ?? 14,
      trialMonths: trialMonthsByOrg[orgId] || undefined,
      trialEndsAt: fromDatetimeLocalValue(trialEndsByOrg[orgId] || ""),
      menuEnabled: mods.menu,
      orderingEnabled: mods.ordering,
      kitchenEnabled: mods.kitchen,
      inventoryEnabled: mods.inventory,
      financeEnabled: mods.finance,
      hrEnabled: mods.hr,
      onlineEnabled: mods.online,
      followUpAt: fromDatetimeLocalValue(followUpByOrg[orgId] || ""),
      followUpNote: followUpNoteByOrg[orgId] || undefined,
    });
    throwIfError(res, "Approve failed");
    if ("email" in res && res.email && res.password) {
      setLastCreds({ email: res.email, password: res.password });
    }
    toast.success(
      `Approved ${row.organization.name}. They sign in at /login.`,
    );
    await Promise.all([loadTenants(), loadOverview()]);
  }

  async function rejectOrg(row: PlatformTenantRow) {
    const notes = window.prompt("Rejection note (optional)") || undefined;
    const res = await rejectOrganizationAction({
      organizationId: String(row.organization.id),
      adminNotes: notes,
    });
    throwIfError(res, "Reject failed");
    toast.success(`Rejected ${row.organization.name}`);
    await Promise.all([loadTenants(), loadOverview()]);
  }

  async function approveProof(proof: PaymentProofRow) {
    const mods = proofMods[proof.id] ?? flagsFromProof(proof);
    const months = proofMonths[proof.id] ?? Number(proof.months_requested || 1);
    const notes = window.prompt("Verification notes (optional)") || undefined;
    const res = await approvePaymentProofAction({
      proofId: proof.id,
      months,
      notes,
      menuEnabled: mods.menu,
      orderingEnabled: mods.ordering,
      kitchenEnabled: mods.kitchen,
      inventoryEnabled: mods.inventory,
      financeEnabled: mods.finance,
      hrEnabled: mods.hr,
      onlineEnabled: mods.online,
      extraStaffSeats: Number(proof.extra_staff_seats || 0),
      packageCode: proofPkg[proof.id] || null,
    });
    throwIfError(res, "Approve failed");
    if ("months" in res) {
      toast.success(
        `Payment approved · +${res.months} month(s) · ends ${formatDateTime(String(res.periodEnd))}`,
      );
    }
    await Promise.all([loadProofs(), loadTenants(), loadOverview()]);
  }

  async function rejectProof(proof: PaymentProofRow) {
    const notes = window.prompt("Rejection note (optional)") || undefined;
    const res = await rejectPaymentProofAction({
      proofId: proof.id,
      notes,
    });
    throwIfError(res, "Reject failed");
    toast.success("Payment proof rejected");
    await Promise.all([loadProofs(), loadOverview()]);
  }

  async function openDoc(path: string | null | undefined) {
    if (!path) return;
    const res = await getKycSignedUrlAction(path);
    throwIfError(res, "Could not open file");
    if ("url" in res) window.open(String(res.url), "_blank");
  }

  const filteredOnboarding = useMemo(() => {
    if (filter === "all") return tenants;
    return tenants.filter(
      (row) =>
        String(row.organization.verification_status || "pending") === filter,
    );
  }, [tenants, filter]);

  const sectionLabel =
    section === "detail"
      ? String(selectedTenant?.organization.name || "Restaurant")
      : section === "profile"
        ? "Profile"
        : NAV.find((n) => n.id === section)?.label;

  function openSubscribers(view: Partial<SubscriberView>) {
    setSubscriberView({ ...DEFAULT_SUBSCRIBER_VIEW, ...view });
    go("subscribers");
  }

  const sortedProofs = useMemo(() => {
    return [...proofs].sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (b.status === "pending" && a.status !== "pending") return 1;
      return (
        new Date(String(b.created_at || 0)).getTime() -
        new Date(String(a.created_at || 0)).getTime()
      );
    });
  }, [proofs]);

  return (
    <div className="flex min-h-dvh overflow-x-hidden bg-stone">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-white/8 bg-gradient-to-b from-[#0f2a26] via-[#0b1d1a] to-[#071412] px-3 py-4 text-[#eef2f0] lg:flex">
        <button
          type="button"
          onClick={() => go("overview")}
          className="mb-4 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/5"
          aria-label="Go to overview"
        >
          <AramisLogo tone="onDark" className="h-8 w-auto max-w-full" priority />
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Platform owner
          </p>
        </button>
        <button
          type="button"
          onClick={() => go("profile")}
          className={cn(
            "mb-3 flex items-center gap-2.5 rounded-xl px-2 py-2 text-left transition",
            section === "profile"
              ? "bg-[#2a9d8f] text-white"
              : "text-white/80 hover:bg-white/8 hover:text-white",
          )}
        >
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold",
              section === "profile"
                ? "bg-white/20 text-white"
                : "bg-white/10 text-white",
            )}
          >
            {initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {adminName}
            </span>
            <span
              className={cn(
                "block truncate text-[11px]",
                section === "profile" ? "text-white/80" : "text-white/45",
              )}
            >
              {adminEmail || "Manage profile"}
            </span>
          </span>
        </button>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const badge =
              item.badge === "kyc"
                ? pendingKyc
                : item.badge === "payments"
                  ? pendingPayments
                  : 0;
            const active =
              section === item.id ||
              (item.id === "subscribers" && section === "detail");
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={cn(
                  "flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition",
                  active
                    ? "bg-[#2a9d8f] text-white"
                    : "text-white/70 hover:bg-white/8 hover:text-white",
                )}
              >
                <span>{item.label}</span>
                {badge > 0 ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] font-bold",
                      active ? "bg-white/25" : "bg-[#e76f51]/25 text-[#ffb59f]",
                    )}
                  >
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto hidden pt-3 lg:block">
          <OwnerAlertsCard
            prefs={alerts.prefs}
            permission={alerts.permission}
            onEnable={alerts.enable}
            onToggle={alerts.setEnabled}
            onSound={alerts.setSound}
          />
        </div>
        <InstallAppButton className="mt-3" />
        <button
          type="button"
          onClick={onSignOut}
          className="mt-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white"
        >
          Sign out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-ink/8 bg-stone/90 px-3 py-2.5 backdrop-blur safe-pt sm:px-5 lg:py-3">
          <button
            type="button"
            onClick={() => go("profile")}
            className={cn(
              "mb-2 flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left lg:hidden",
              section === "profile"
                ? "bg-teal text-white"
                : "border border-ink/10 bg-white text-ink",
            )}
            aria-label="Your profile"
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold",
                section === "profile"
                  ? "bg-white/20 text-white"
                  : "bg-teal/15 text-teal",
              )}
            >
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {adminName}
              </span>
              <span
                className={cn(
                  "block truncate text-[11px]",
                  section === "profile" ? "text-white/80" : "text-ink/50",
                )}
              >
                {adminEmail || "Manage profile"}
              </span>
            </span>
          </button>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 lg:hidden">
              <button
                type="button"
                onClick={() => go("overview")}
                className="flex items-center gap-2"
                aria-label="Go to overview"
              >
                <AramisLogo variant="mark" className="h-7 w-7" />
                <div className="min-w-0 text-left">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal">
                    Owner
                  </p>
                  <p className="truncate font-display text-base leading-tight">
                    {sectionLabel}
                  </p>
                </div>
              </button>
            </div>
            <div className="hidden lg:block">
              <h1 className="font-display text-xl text-ink">{sectionLabel}</h1>
            </div>
            <div className="flex items-center gap-2">
              <ActionButton
                disabled={loading}
                pendingLabel="Refreshing…"
                onAction={reloadAll}
                className="min-h-10 rounded-xl border border-ink/12 px-3 py-2 text-xs font-medium"
              >
                Refresh
              </ActionButton>
              <button
                type="button"
                onClick={onSignOut}
                className="hidden min-h-10 rounded-xl border border-ink/12 px-3 py-2 text-xs font-medium sm:inline-flex lg:hidden"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-3 py-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] sm:px-5 lg:pb-5">
          <div className="mb-3 space-y-2 lg:hidden">
            <InstallAppButton tone="light" label="Add Owner to home screen" />
            <OwnerAlertsCard
              prefs={alerts.prefs}
              permission={alerts.permission}
              onEnable={alerts.enable}
              onToggle={alerts.setEnabled}
              onSound={alerts.setSound}
            />
          </div>
          {lastCreds ? (
            <div className="mb-4 rounded-3xl border border-gold/40 bg-gold/15 p-4 text-sm">
              <p className="font-semibold text-ink">
                Send these login details by email or SMS
              </p>
              <p className="mt-2 font-mono text-xs sm:text-sm">
                Email: <strong>{lastCreds.email}</strong>
                <br />
                Password:{" "}
                <strong>
                  {showLastCreds ? lastCreds.password : "••••••••••••"}
                </strong>
                <br />
                Login: /login
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-ink/20 bg-white px-3 py-1.5 text-xs font-semibold"
                  onClick={() => setShowLastCreds((v) => !v)}
                >
                  {showLastCreds ? "Hide password" : "Show password"}
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-ink px-3 py-1.5 text-xs text-stone"
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      `Aramis Product login\nEmail: ${lastCreds.email}\nPassword: ${lastCreds.password}\nURL: ${window.location.origin}/login`,
                    )
                  }
                >
                  Copy for email / SMS
                </button>
              </div>
            </div>
          ) : null}

          {section === "profile" ? (
            <PlatformProfile onSignOut={onSignOut} />
          ) : null}

          {section === "overview" && loading && !stats ? (
            <SectionShimmer />
          ) : null}

          {section === "overview" && stats ? (
            <OverviewSection
              stats={stats}
              tenants={tenants}
              usage={usage}
              onOpenKyc={() => go("onboarding")}
              onOpenPayments={() => go("payments")}
              onOpenOrg={openDetail}
              onOpenSubscribers={openSubscribers}
            />
          ) : null}

          {section === "packages" &&
          loading &&
          packages.length === 0 &&
          modulePrices.length === 0 ? (
            <SectionShimmer variant="packages" />
          ) : null}

          {section === "packages" &&
          !(loading && packages.length === 0 && modulePrices.length === 0) ? (
            <PackagesSection
              packages={packages}
              modulePrices={modulePrices}
              addons={addons}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              onSaved={async () => {
                await flashOk("Pricing saved");
                await loadCatalog();
              }}
            />
          ) : null}

          {section === "onboarding" && loading && tenants.length === 0 ? (
            <SectionShimmer variant="list" />
          ) : null}

          {section === "onboarding" && !(loading && tenants.length === 0) ? (
            <OnboardingSection
              rows={filteredOnboarding}
              filter={filter}
              setFilter={setFilter}
              approveMods={approveMods}
              setApproveMods={setApproveMods}
              trialDaysByOrg={trialDaysByOrg}
              setTrialDaysByOrg={setTrialDaysByOrg}
              trialMonthsByOrg={trialMonthsByOrg}
              setTrialMonthsByOrg={setTrialMonthsByOrg}
              trialEndsByOrg={trialEndsByOrg}
              setTrialEndsByOrg={setTrialEndsByOrg}
              followUpByOrg={followUpByOrg}
              setFollowUpByOrg={setFollowUpByOrg}
              followUpNoteByOrg={followUpNoteByOrg}
              setFollowUpNoteByOrg={setFollowUpNoteByOrg}
              busy={busy}
              onApprove={(r) => approveOrg(r)}
              onReject={(r) => rejectOrg(r)}
              onOpenDoc={openDoc}
              onOpenDetail={openDetail}
            />
          ) : null}

          {section === "payments" && loading && proofs.length === 0 ? (
            <SectionShimmer variant="list" />
          ) : null}

          {section === "payments" && !(loading && proofs.length === 0) ? (
            <PaymentsSection
              proofs={sortedProofs}
              packages={packages}
              proofMods={proofMods}
              setProofMods={setProofMods}
              proofMonths={proofMonths}
              setProofMonths={setProofMonths}
              proofPkg={proofPkg}
              setProofPkg={setProofPkg}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              flashOk={flashOk}
              onChanged={async () => {
                await Promise.all([loadProofs(), loadTenants(), loadOverview()]);
              }}
              onApprove={(p) => approveProof(p)}
              onReject={(p) => rejectProof(p)}
              onOpenOrg={openDetail}
            />
          ) : null}

          {section === "subscribers" && loading && tenants.length === 0 ? (
            <SectionShimmer variant="list" />
          ) : null}

          {section === "subscribers" && !(loading && tenants.length === 0) ? (
            <SubscribersSection
              rows={tenants}
              usage={usage}
              usageLoading={usageLoading}
              view={subscriberView}
              setView={setSubscriberView}
              onOpen={openDetail}
            />
          ) : null}

          {section === "detail" && loading && !selectedTenant ? (
            <SectionShimmer variant="detail" />
          ) : null}

          {section === "detail" && selectedTenant ? (
            <RestaurantDetail
              row={selectedTenant}
              usage={usage?.[String(selectedTenant.organization.id)]}
              usageDayKeys={usageDayKeys}
              usageLoading={usageLoading}
              proofs={orgProofs}
              packages={packages}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              flashOk={flashOk}
              onBack={() => go("subscribers")}
              onOpenDoc={openDoc}
              onReload={async () => {
                await Promise.all([
                  loadTenants(),
                  loadProofs(),
                  loadOverview(),
                  loadUsage(),
                ]);
              }}
              onDeleted={async () => {
                go("subscribers");
                await reloadAll();
              }}
            />
          ) : null}

          {section === "detail" && !selectedTenant && !loading ? (
            <p className="text-sm text-ink/50">Restaurant not found.</p>
          ) : null}
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/8 bg-stone/95 px-1 pt-1 backdrop-blur lg:hidden safe-pb"
          aria-label="Owner sections"
        >
          <div className="grid grid-cols-5">
            {NAV.map((item) => {
              const badge =
                item.badge === "kyc"
                  ? pendingKyc
                  : item.badge === "payments"
                    ? pendingPayments
                    : 0;
              const active =
                section === item.id ||
                (item.id === "subscribers" && section === "detail");
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id)}
                  className={cn(
                    "relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-semibold",
                    active ? "text-teal" : "text-ink/50",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.short}</span>
                  {badge > 0 ? (
                    <span className="absolute right-2 top-0.5 min-w-4 rounded-full bg-coral px-1 text-[9px] font-bold leading-4 text-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
