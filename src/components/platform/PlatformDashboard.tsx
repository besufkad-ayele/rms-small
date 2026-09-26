"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  approveOrganizationAction,
  approvePaymentProofAction,
  getKycSignedUrlAction,
  getPlatformOverviewAction,
  listPaymentProofsAction,
  listPlatformTenantsAction,
  listPricingCatalogAction,
  rejectOrganizationAction,
  rejectPaymentProofAction,
  type PaymentProofRow,
  type PlatformOverviewStats,
  type PlatformTenantRow,
} from "@/app/platform/actions";
import type { ModulePriceRow, PackageRow } from "@/lib/pricing";
import { cn, formatDateTime } from "@/lib/utils";
import { OnboardingSection } from "./OnboardingSection";
import { OverviewSection } from "./OverviewSection";
import { PackagesSection } from "./PackagesSection";
import { PaymentsSection } from "./PaymentsSection";
import { RestaurantDetail } from "./RestaurantDetail";
import { SubscribersSection } from "./SubscribersSection";
import {
  flagsFromProof,
  flagsFromSub,
  fromDatetimeLocalValue,
  SkeletonCards,
  type ModuleState,
  type PlatformSection,
} from "./platform-ui";

const NAV: Array<{
  id: PlatformSection;
  label: string;
  badge?: "kyc" | "payments";
}> = [
  { id: "overview", label: "Overview" },
  { id: "packages", label: "Packages & pricing" },
  { id: "onboarding", label: "Onboarding / KYC", badge: "kyc" },
  { id: "payments", label: "Payments", badge: "payments" },
  { id: "subscribers", label: "Subscribers" },
];

export function PlatformDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [section, setSection] = useState<PlatformSection>("overview");
  const [tenants, setTenants] = useState<PlatformTenantRow[]>([]);
  const [proofs, setProofs] = useState<PaymentProofRow[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [modulePrices, setModulePrices] = useState<ModulePriceRow[]>([]);
  const [stats, setStats] = useState<PlatformOverviewStats | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);

  const [filter, setFilter] = useState<
    "pending" | "approved" | "rejected" | "all"
  >("pending");
  const [subscriberQuery, setSubscriberQuery] = useState("");
  const [subStatusFilter, setSubStatusFilter] = useState("all");
  const [verifyFilter, setVerifyFilter] = useState("all");
  const [expiringOnly, setExpiringOnly] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastCreds, setLastCreds] = useState<{
    email: string;
    password: string;
  } | null>(null);

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
      setError(t.error ?? "Failed to load tenants");
      return;
    }
    setTenants(t.tenants);
    const nextApprove: Record<string, ModuleState> = {};
    for (const row of t.tenants) {
      nextApprove[String(row.organization.id)] = flagsFromSub(row.subscription);
    }
    setApproveMods(nextApprove);
  }, []);

  const loadProofs = useCallback(async () => {
    const p = await listPaymentProofsAction();
    if ("error" in p) {
      setError(p.error ?? "Failed to load payments");
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
  }, []);

  const loadCatalog = useCallback(async () => {
    const c = await listPricingCatalogAction();
    if ("error" in c) {
      setError(c.error ?? "Failed to load packages");
      return;
    }
    setPackages(c.packages);
    setModulePrices(c.modulePrices);
  }, []);

  const loadOverview = useCallback(async () => {
    const o = await getPlatformOverviewAction();
    if ("error" in o) {
      setError(o.error ?? "Failed to load overview");
      return;
    }
    setStats(o.stats);
  }, []);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      loadTenants(),
      loadProofs(),
      loadCatalog(),
      loadOverview(),
    ]);
    setLoading(false);
  }, [loadCatalog, loadOverview, loadProofs, loadTenants]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  function go(sectionId: PlatformSection) {
    setSection(sectionId);
    setMobileNav(false);
    if (sectionId !== "detail") setSelectedOrgId(null);
  }

  function openDetail(orgId: string) {
    setSelectedOrgId(orgId);
    setSection("detail");
    setMobileNav(false);
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

  async function flashOk(msg: string) {
    setMessage(msg);
    setError(null);
  }

  async function approveOrg(row: PlatformTenantRow) {
    const orgId = String(row.organization.id);
    const mods = approveMods[orgId] ?? flagsFromSub(row.subscription);
    setBusy(true);
    setLastCreds(null);
    const res = await approveOrganizationAction({
      organizationId: orgId,
      trialDays: trialDaysByOrg[orgId] ?? 14,
      trialMonths: trialMonthsByOrg[orgId] || undefined,
      trialEndsAt: fromDatetimeLocalValue(trialEndsByOrg[orgId] || ""),
      menuEnabled: mods.menu,
      orderingEnabled: mods.ordering,
      inventoryEnabled: mods.inventory,
      financeEnabled: mods.finance,
      hrEnabled: mods.hr,
      followUpAt: fromDatetimeLocalValue(followUpByOrg[orgId] || ""),
      followUpNote: followUpNoteByOrg[orgId] || undefined,
    });
    setBusy(false);
    if ("error" in res) {
      setError(String(res.error ?? "Approve failed"));
      return;
    }
    if (res.email && res.password) {
      setLastCreds({ email: res.email, password: res.password });
    }
    await flashOk(
      `Approved ${row.organization.name}. Send password — they sign in at /login.`,
    );
    await Promise.all([loadTenants(), loadOverview()]);
  }

  async function rejectOrg(row: PlatformTenantRow) {
    const notes = window.prompt("Rejection note (optional)") || undefined;
    setBusy(true);
    const res = await rejectOrganizationAction({
      organizationId: String(row.organization.id),
      adminNotes: notes,
    });
    setBusy(false);
    if ("error" in res) {
      setError(String(res.error ?? "Reject failed"));
      return;
    }
    await flashOk(`Rejected ${row.organization.name}`);
    await Promise.all([loadTenants(), loadOverview()]);
  }

  async function approveProof(proof: PaymentProofRow) {
    const mods = proofMods[proof.id] ?? flagsFromProof(proof);
    const months = proofMonths[proof.id] ?? Number(proof.months_requested || 1);
    const notes = window.prompt("Verification notes (optional)") || undefined;
    setBusy(true);
    const res = await approvePaymentProofAction({
      proofId: proof.id,
      months,
      notes,
      menuEnabled: mods.menu,
      orderingEnabled: mods.ordering,
      inventoryEnabled: mods.inventory,
      financeEnabled: mods.finance,
      hrEnabled: mods.hr,
      packageCode: proofPkg[proof.id] || null,
    });
    setBusy(false);
    if ("error" in res) {
      setError(String(res.error ?? "Approve failed"));
      return;
    }
    await flashOk(
      `Payment approved · +${res.months} month(s) · ends ${formatDateTime(res.periodEnd)}`,
    );
    await Promise.all([loadProofs(), loadTenants(), loadOverview()]);
  }

  async function rejectProof(proof: PaymentProofRow) {
    const notes = window.prompt("Rejection note (optional)") || undefined;
    setBusy(true);
    const res = await rejectPaymentProofAction({
      proofId: proof.id,
      notes,
    });
    setBusy(false);
    if ("error" in res) {
      setError(String(res.error ?? "Reject failed"));
      return;
    }
    await flashOk("Payment proof rejected");
    await Promise.all([loadProofs(), loadOverview()]);
  }

  async function openDoc(path: string | null | undefined) {
    if (!path) return;
    const res = await getKycSignedUrlAction(path);
    if ("error" in res) {
      setError(String(res.error ?? "Could not open file"));
      return;
    }
    window.open(res.url, "_blank");
  }

  const filteredOnboarding = useMemo(() => {
    if (filter === "all") return tenants;
    return tenants.filter(
      (row) =>
        String(row.organization.verification_status || "pending") === filter,
    );
  }, [tenants, filter]);

  const filteredSubscribers = useMemo(() => {
    const q = subscriberQuery.trim().toLowerCase();
    const now = Date.now();
    const tenDays = 10 * 24 * 60 * 60 * 1000;
    return tenants.filter((row) => {
      const org = row.organization;
      const sub = row.subscription;
      if (
        verifyFilter !== "all" &&
        String(org.verification_status || "pending") !== verifyFilter
      ) {
        return false;
      }
      if (
        subStatusFilter !== "all" &&
        String(sub?.status || "") !== subStatusFilter
      ) {
        return false;
      }
      if (expiringOnly && sub) {
        const end =
          sub.status === "trialing"
            ? sub.trial_ends_at
            : sub.current_period_end;
        if (!end) return false;
        const ms = new Date(String(end)).getTime();
        if (!(ms > now && ms - now <= tenDays)) return false;
      }
      if (!q) return true;
      const hay = [
        org.name,
        org.email,
        org.phone,
        org.city,
        org.tin,
        row.owner?.full_name,
        row.owner?.email,
        row.ownerAuthEmail,
        row.subscription?.status,
        row.subscription?.plan_code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [
    tenants,
    subscriberQuery,
    subStatusFilter,
    verifyFilter,
    expiringOnly,
  ]);

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
    <div className="flex min-h-dvh bg-stone">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-ink/8 bg-white/80 px-3 py-4 backdrop-blur lg:flex">
        <div className="px-2 pb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal">
            Aramis Product
          </p>
          <p className="font-display text-lg text-ink">Owner</p>
        </div>
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
                    ? "bg-teal text-white"
                    : "text-ink/75 hover:bg-stone",
                )}
              >
                <span>{item.label}</span>
                {badge > 0 ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] font-bold",
                      active ? "bg-white/25" : "bg-coral/15 text-coral",
                    )}
                  >
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-3 rounded-xl border border-ink/10 px-3 py-2 text-xs font-medium text-ink/70"
        >
          Sign out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-ink/8 bg-stone/90 px-3 py-3 backdrop-blur sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 lg:hidden">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal">
                Aramis Product · Owner
              </p>
              <button
                type="button"
                onClick={() => setMobileNav((v) => !v)}
                className="mt-1 flex items-center gap-2 font-display text-lg"
              >
                {NAV.find((n) => n.id === section)?.label ||
                  (section === "detail" ? "Restaurant" : "Menu")}
                <span className="text-xs text-ink/40">▾</span>
              </button>
            </div>
            <div className="hidden lg:block">
              <h1 className="font-display text-xl text-ink">
                {section === "detail"
                  ? String(selectedTenant?.organization.name || "Restaurant")
                  : NAV.find((n) => n.id === section)?.label}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy || loading}
                onClick={() => void reloadAll()}
                className="rounded-xl border border-ink/12 px-3 py-1.5 text-xs font-medium"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={onSignOut}
                className="rounded-xl border border-ink/12 px-3 py-1.5 text-xs font-medium lg:hidden"
              >
                Sign out
              </button>
            </div>
          </div>
          {mobileNav ? (
            <div className="mt-2 grid gap-1 rounded-2xl border border-ink/8 bg-white p-2 lg:hidden">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id)}
                  className={cn(
                    "rounded-xl px-3 py-2 text-left text-sm",
                    section === item.id ? "bg-teal text-white" : "hover:bg-stone",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        <main className="flex-1 px-3 py-4 sm:px-5">
          {lastCreds ? (
            <div className="mb-4 rounded-3xl border border-gold/40 bg-gold/15 p-4 text-sm">
              <p className="font-semibold text-ink">
                Send these login details by email or SMS
              </p>
              <p className="mt-2 font-mono text-xs sm:text-sm">
                Email: <strong>{lastCreds.email}</strong>
                <br />
                Password: <strong>{lastCreds.password}</strong>
                <br />
                Login: /login
              </p>
              <button
                type="button"
                className="mt-3 rounded-lg bg-ink px-3 py-1.5 text-xs text-stone"
                onClick={() =>
                  void navigator.clipboard.writeText(
                    `Aramis Product login\nEmail: ${lastCreds.email}\nPassword: ${lastCreds.password}\nURL: ${window.location.origin}/login`,
                  )
                }
              >
                Copy for email / SMS
              </button>
            </div>
          ) : null}
          {message ? (
            <p className="mb-3 rounded-xl bg-teal/10 px-3 py-2 text-sm text-teal">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="mb-3 rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">
              {error}
            </p>
          ) : null}

          {loading && !stats && section === "overview" ? (
            <SkeletonCards count={4} />
          ) : null}

          {section === "overview" && stats ? (
            <OverviewSection
              stats={stats}
              onOpenKyc={() => go("onboarding")}
              onOpenPayments={() => go("payments")}
              onOpenOrg={openDetail}
            />
          ) : null}

          {section === "packages" ? (
            <PackagesSection
              packages={packages}
              modulePrices={modulePrices}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              onSaved={async () => {
                await flashOk("Pricing saved");
                await loadCatalog();
              }}
            />
          ) : null}

          {section === "onboarding" ? (
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
              onApprove={(r) => void approveOrg(r)}
              onReject={(r) => void rejectOrg(r)}
              onOpenDoc={(p) => void openDoc(p)}
              onOpenDetail={openDetail}
            />
          ) : null}

          {section === "payments" ? (
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
              onApprove={(p) => void approveProof(p)}
              onReject={(p) => void rejectProof(p)}
              onOpenOrg={openDetail}
            />
          ) : null}

          {section === "subscribers" ? (
            <SubscribersSection
              rows={filteredSubscribers}
              query={subscriberQuery}
              setQuery={setSubscriberQuery}
              verifyFilter={verifyFilter}
              setVerifyFilter={setVerifyFilter}
              subStatusFilter={subStatusFilter}
              setSubStatusFilter={setSubStatusFilter}
              expiringOnly={expiringOnly}
              setExpiringOnly={setExpiringOnly}
              onOpen={openDetail}
            />
          ) : null}

          {section === "detail" && selectedTenant ? (
            <RestaurantDetail
              row={selectedTenant}
              proofs={orgProofs}
              packages={packages}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              flashOk={flashOk}
              onBack={() => go("subscribers")}
              onOpenDoc={(p) => void openDoc(p)}
              onReload={async () => {
                await Promise.all([
                  loadTenants(),
                  loadProofs(),
                  loadOverview(),
                ]);
              }}
            />
          ) : null}

          {section === "detail" && !selectedTenant && !loading ? (
            <p className="text-sm text-ink/50">Restaurant not found.</p>
          ) : null}
        </main>
      </div>
    </div>
  );
}
