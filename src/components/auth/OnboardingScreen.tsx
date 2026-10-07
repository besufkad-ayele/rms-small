"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";
import { AramisLogo } from "@/components/brand/AramisLogo";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { PhoneField } from "@/components/ui/PhoneField";
import { isOwner } from "@/lib/permissions";
import type { PhoneAssessment } from "@/lib/phone";

export function OnboardingScreen() {
  const {
    ready,
    sessionResolved,
    user,
    tenant,
    hasMembership,
    tenantError,
    awaitingVerification,
    needsOnboarding,
    accessBlocked,
    onboard,
    isPlatformAdmin,
    refresh,
    logout,
  } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [menu, setMenu] = useState(true);
  const [ordering, setOrdering] = useState(true);
  const [kitchen, setKitchen] = useState(true);
  const [inventory, setInventory] = useState(true);
  const [finance, setFinance] = useState(true);
  const [hr, setHr] = useState(true);
  const [online, setOnline] = useState(false);
  const [phone, setPhone] = useState<PhoneAssessment | null>(null);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } finally {
      router.replace("/login");
    }
  }

  useEffect(() => {
    if (!ready || !sessionResolved || signingOut) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (isPlatformAdmin && !hasMembership) {
      router.replace("/platform");
      return;
    }
    // New user (no business yet) stays on this form. Every other state leaves.
    if (needsOnboarding) return;
    if (awaitingVerification) {
      router.replace("/pending");
      return;
    }
    if (tenant) {
      router.replace(
        accessBlocked && isOwner(tenant.membership)
          ? "/app/settings?tab=billing"
          : "/app",
      );
      return;
    }
    if (hasMembership) {
      router.replace("/opening");
    }
  }, [
    ready,
    sessionResolved,
    user,
    tenant,
    hasMembership,
    awaitingVerification,
    needsOnboarding,
    accessBlocked,
    isPlatformAdmin,
    signingOut,
    router,
  ]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (phone?.error || !phone?.e164) {
      setBusy(false);
      setError(phone?.error || "Phone is required.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const err = await onboard({
      businessName: String(fd.get("businessName") ?? ""),
      orgType: String(fd.get("orgType") ?? "cafe") as
        | "cafe"
        | "restaurant"
        | "other",
      phone: phone.e164,
      email: String(fd.get("email") ?? ""),
      address: String(fd.get("address") ?? ""),
      city: String(fd.get("city") ?? ""),
      region: String(fd.get("region") ?? ""),
      country: String(fd.get("country") ?? "Ethiopia"),
      tin: String(fd.get("tin") ?? ""),
      vatNumber: String(fd.get("vat") ?? ""),
      website: String(fd.get("website") ?? ""),
      inventoryEnabled: inventory,
      financeEnabled: finance,
      menuEnabled: menu,
      orderingEnabled: ordering,
      kitchenEnabled: kitchen,
      hrEnabled: hr,
      onlineEnabled: online,
      licenseFile: (fd.get("license") as File) || null,
      idFile: (fd.get("idDoc") as File) || null,
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    router.replace("/pending");
  }

  if (tenantError && hasMembership && !tenant) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-stone px-4 text-center">
        <p className="font-display text-xl">Couldn’t load your business</p>
        <p className="max-w-sm text-sm text-ink/60">{tenantError}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl bg-teal px-5 py-2.5 text-sm font-semibold text-white"
        >
          Retry
        </button>
        <button
          type="button"
          disabled={signingOut}
          onClick={() => void handleSignOut()}
          className="text-sm text-ink/55 underline"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    );
  }

  if (!ready || !sessionResolved || !user || !needsOnboarding) {
    return (
      <div className="relative">
        <AuthLoadingScreen message="Checking your account…" />
        {user ? (
          <button
            type="button"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 text-sm text-white/55 underline"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-stone px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <AramisLogo variant="mark" className="h-10 w-10" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">
                Step 2
              </p>
              <h1 className="font-display text-3xl text-ink sm:text-4xl">
                Business onboarding
              </h1>
            </div>
          </div>
          <button
            type="button"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
            className="shrink-0 rounded-xl border border-ink/15 px-3 py-2 text-sm text-ink/70 hover:bg-white"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
        <p className="mt-3 text-sm text-ink/60">
          Tell us about your café or restaurant and pick modules. After Aramis
          approves, sign in with the email and password you already created —
          your 14-day trial starts then.
        </p>
        {user.email ? (
          <p className="mt-1 text-xs text-ink/45">Signed in as {user.email}</p>
        ) : null}

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="mt-6 space-y-4 rounded-3xl border border-ink/8 bg-white/90 p-5 shadow-sm sm:p-7"
        >
          <label className="block text-sm">
            <FieldLabel required>Business name</FieldLabel>
            <input name="businessName" required className="field" />
          </label>
          <label className="block text-sm">
            <FieldLabel required>Business type</FieldLabel>
            <select name="orgType" className="field" defaultValue="cafe">
              <option value="cafe">Café</option>
              <option value="restaurant">Restaurant</option>
              <option value="other">Other</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <FieldLabel required>Business email</FieldLabel>
              <input
                name="email"
                type="email"
                className="field"
                defaultValue={user.email || ""}
                required
              />
            </label>
            <div className="block text-sm">
              <FieldLabel required>Phone</FieldLabel>
              <PhoneField required onChange={setPhone} />
            </div>
          </div>
          <label className="block text-sm">
            <FieldLabel>Address</FieldLabel>
            <input name="address" className="field" />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <FieldLabel required>City</FieldLabel>
              <input name="city" className="field" required />
            </label>
            <label className="block text-sm">
              <FieldLabel>Region</FieldLabel>
              <input name="region" className="field" />
            </label>
            <label className="block text-sm">
              <FieldLabel required>Country</FieldLabel>
              <input name="country" className="field" defaultValue="Ethiopia" required />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <FieldLabel>TIN</FieldLabel>
              <input name="tin" className="field" />
            </label>
            <label className="block text-sm">
              <FieldLabel>VAT number</FieldLabel>
              <input name="vat" className="field" />
            </label>
            <label className="block text-sm">
              <FieldLabel>Website</FieldLabel>
              <input name="website" className="field" placeholder="cafe.example" />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <FieldLabel>Business license</FieldLabel>
              <input
                name="license"
                type="file"
                accept="image/*,.pdf"
                className="block w-full text-sm"
              />
            </label>
            <label className="block text-sm">
              <FieldLabel>Owner ID</FieldLabel>
              <input
                name="idDoc"
                type="file"
                accept="image/*,.pdf"
                className="block w-full text-sm"
              />
            </label>
          </div>

          <div className="space-y-2 rounded-2xl bg-stone/70 p-4">
            <p className="text-sm font-semibold text-ink">Modules you want</p>
            {(
              [
                ["menu", menu, setMenu, "Menu", "Item catalog & recipes"],
                ["ordering", ordering, setOrdering, "Ordering", "Cashier POS"],
                ["kitchen", kitchen, setKitchen, "Kitchen", "Barista and kitchen displays"],
                ["inventory", inventory, setInventory, "Inventory", "Stock & costs"],
                ["finance", finance, setFinance, "Finance", "Reports & day close"],
                ["hr", hr, setHr, "HR / Staff", "Team seats & permissions"],
                [
                  "online",
                  online,
                  setOnline,
                  "Website & public ordering",
                  "Guest menu page with name and phone",
                ],
              ] as const
            ).map(([key, checked, set, label, blurb]) => (
              <label
                key={key}
                className="flex items-start gap-3 rounded-xl bg-white p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => set(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{label}</span>
                  <span className="mt-0.5 block text-xs text-ink/55">
                    {blurb}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={busy || signingOut}
            className="w-full rounded-xl bg-teal px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Submitting…" : "Submit for Aramis review"}
          </button>
          {error ? (
            <p className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">
              {error}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
