"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

export function OnboardingScreen() {
  const { ready, user, tenant, onboard, isPlatformAdmin } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inventory, setInventory] = useState(true);
  const [finance, setFinance] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login");
    else if (isPlatformAdmin && !tenant) router.replace("/platform");
    else if (tenant?.organization.verification_status === "pending")
      router.replace("/pending");
    else if (tenant) router.replace("/app");
  }, [ready, user, tenant, isPlatformAdmin, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const err = await onboard({
      businessName: String(fd.get("businessName") ?? ""),
      orgType: String(fd.get("orgType") ?? "cafe") as
        | "cafe"
        | "restaurant"
        | "other",
      phone: String(fd.get("phone") ?? ""),
      email: String(fd.get("email") ?? ""),
      address: String(fd.get("address") ?? ""),
      city: String(fd.get("city") ?? ""),
      region: String(fd.get("region") ?? ""),
      country: String(fd.get("country") ?? "Ethiopia"),
      inventoryEnabled: inventory,
      financeEnabled: finance,
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

  if (!ready || !user || tenant) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-stone text-ink">
        <p className="text-sm text-ink/60">Preparing onboarding…</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-stone px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">
          Aramis Product · Step 2
        </p>
        <h1 className="mt-2 font-display text-3xl text-ink sm:text-4xl">
          Business onboarding
        </h1>
        <p className="mt-2 text-sm text-ink/60">
          Tell us about your café or restaurant and pick modules. After Aramis
          approves, they send your login password — then you sign in and your
          14-day trial starts.
        </p>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="mt-6 space-y-4 rounded-3xl border border-ink/8 bg-white/90 p-5 shadow-sm sm:p-7"
        >
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Business name</span>
            <input name="businessName" required className="field" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Business type</span>
            <select name="orgType" className="field" defaultValue="cafe">
              <option value="cafe">Café</option>
              <option value="restaurant">Restaurant</option>
              <option value="other">Other</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Business email</span>
              <input
                name="email"
                type="email"
                className="field"
                defaultValue={user.email || ""}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Phone</span>
              <input name="phone" className="field" required />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Address</span>
            <input name="address" className="field" />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">City</span>
              <input name="city" className="field" required />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Region</span>
              <input name="region" className="field" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Country</span>
              <input name="country" className="field" defaultValue="Ethiopia" />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">
                Business license (optional)
              </span>
              <input name="license" type="file" accept="image/*,.pdf" className="block w-full text-sm" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Owner ID (optional)</span>
              <input name="idDoc" type="file" accept="image/*,.pdf" className="block w-full text-sm" />
            </label>
          </div>

          <div className="space-y-2 rounded-2xl bg-stone/70 p-4">
            <p className="text-sm font-semibold text-ink">Modules you want</p>
            <label className="flex items-start gap-3 rounded-xl bg-white p-3 text-sm">
              <input
                type="checkbox"
                checked={inventory}
                onChange={(e) => setInventory(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Inventory</span>
                <span className="mt-0.5 block text-xs text-ink/55">
                  Menu, stock, cashier / orders
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl bg-white p-3 text-sm">
              <input
                type="checkbox"
                checked={finance}
                onChange={(e) => setFinance(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Finance</span>
                <span className="mt-0.5 block text-xs text-ink/55">
                  Sales dashboard, COGS, Excel export, day close
                </span>
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={busy}
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
