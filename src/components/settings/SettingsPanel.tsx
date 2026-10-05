"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  CreditCard,
  Moon,
  Monitor,
  Sun,
  UserRound,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BillingPanel } from "@/components/billing/BillingPanel";
import { useTheme } from "@/components/theme/ThemeProvider";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import {
  updateMyPassword,
  updateMyProfile,
  updateOrganizationProfile,
} from "@/lib/cloud-auth";
import {
  DEFAULT_PAYMENT_METHODS,
  PAYMENT_KIND_LABELS,
  getOrgPaymentMethods,
  saveOrgPaymentMethods,
  slugPaymentId,
  type OrgPaymentMethod,
  type PaymentKind,
} from "@/lib/org-payment-methods";
import { isOwner } from "@/lib/permissions";
import type { ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

type SettingsTab =
  | "appearance"
  | "profile"
  | "payments"
  | "business"
  | "billing";

export function SettingsPanel() {
  const { tenant } = useAuth();
  const owner = tenant ? isOwner(tenant.membership) : false;
  const search = useSearchParams();

  const tabs = useMemo(() => {
    const list: {
      id: SettingsTab;
      label: string;
      icon: typeof Sun;
    }[] = [
      { id: "appearance", label: "Appearance", icon: Sun },
      { id: "profile", label: "Profile", icon: UserRound },
    ];
    if (owner) {
      list.push(
        { id: "payments", label: "Payments", icon: Wallet },
        { id: "business", label: "Business", icon: Building2 },
        { id: "billing", label: "Billing", icon: CreditCard },
      );
    }
    return list;
  }, [owner]);

  const initial = (search.get("tab") as SettingsTab) || "appearance";
  const [tab, setTab] = useState<SettingsTab>(
    tabs.some((t) => t.id === initial) ? initial : "appearance",
  );

  useEffect(() => {
    const q = search.get("tab") as SettingsTab | null;
    if (q && tabs.some((t) => t.id === q)) setTab(q);
    else if (!tabs.some((t) => t.id === tab)) setTab("appearance");
  }, [search, tabs, tab]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/60">
        {owner
          ? "Theme, profile, payment methods, business details, and subscription."
          : "Your profile and password — ask your owner for payment or billing changes."}
      </p>

      <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "appearance" ? <AppearanceSettings /> : null}
      {tab === "profile" ? <ProfileSettings /> : null}
      {tab === "payments" && owner ? <PaymentMethodsSettings /> : null}
      {tab === "business" && owner ? <BusinessSettings /> : null}
      {tab === "billing" && owner ? <BillingPanel /> : null}
    </div>
  );
}

function AppearanceSettings() {
  const { mode, resolved, setMode } = useTheme();
  const options: {
    id: ThemeMode;
    label: string;
    hint: string;
    icon: typeof Sun;
  }[] = [
    {
      id: "light",
      label: "Light",
      hint: "Bright surfaces for daytime counters",
      icon: Sun,
    },
    {
      id: "dark",
      label: "Dark",
      hint: "Low glare for evening service",
      icon: Moon,
    },
    {
      id: "system",
      label: "System",
      hint: "Follow this device’s theme",
      icon: Monitor,
    },
  ];

  return (
    <section className="rounded-3xl border border-ink/8 bg-paper/90 p-4 sm:p-5">
      <h3 className="font-display text-xl">Website theme</h3>
      <p className="mt-1 text-sm text-ink/55">
        Applies across Aramis on this device. Current:{" "}
        <span className="font-medium text-ink">{resolved}</span>.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {options.map((opt) => {
          const Icon = opt.icon;
          const active = mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMode(opt.id)}
              className={cn(
                "rounded-2xl border px-4 py-4 text-left transition",
                active
                  ? "border-teal bg-teal/10 ring-2 ring-teal/30"
                  : "border-ink/10 bg-stone/40 hover:border-ink/20",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5",
                  active ? "text-teal" : "text-ink/50",
                )}
              />
              <p className="mt-2 font-semibold">{opt.label}</p>
              <p className="mt-1 text-xs text-ink/55">{opt.hint}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ProfileSettings() {
  const { tenant, refresh } = useAuth();
  const profile = tenant!.profile;
  const [fullName, setFullName] = useState(profile.full_name || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFullName(profile.full_name || "");
    setPhone(profile.phone || "");
  }, [profile.full_name, profile.phone]);

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await updateMyProfile({ fullName, phone });
    setBusy(false);
    if ("error" in res && res.error) {
      setError(res.error);
      return;
    }
    await refresh();
    setMessage("Profile saved.");
  }

  async function onSavePassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    if (password !== confirm) {
      setBusy(false);
      setError("Passwords do not match.");
      return;
    }
    const res = await updateMyPassword({ password });
    setBusy(false);
    if ("error" in res && res.error) {
      setError(res.error);
      return;
    }
    setPassword("");
    setConfirm("");
    setMessage("Password updated.");
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-ink/8 bg-paper/90 p-4 sm:p-5">
        <h3 className="font-display text-xl">Your profile</h3>
        <p className="mt-1 text-sm text-ink/55">
          Signed in as {profile.email || tenant!.membership.user_id}
        </p>
        <form className="mt-4 space-y-3" onSubmit={(e) => void onSaveProfile(e)}>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Full name</span>
            <input
              className="field"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Phone</span>
            <input
              className="field"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save profile
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-ink/8 bg-paper/90 p-4 sm:p-5">
        <h3 className="font-display text-xl">Change password</h3>
        <p className="mt-1 text-sm text-ink/55">
          You can update your own login password here anytime.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => void onSavePassword(e)}
        >
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">New password</span>
            <input
              type="password"
              className="field"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Confirm password</span>
            <input
              type="password"
              className="field"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-stone disabled:opacity-50"
          >
            Update password
          </button>
        </form>
      </section>

      {message ? (
        <p className="rounded-xl bg-teal/15 px-3 py-2 text-sm text-teal">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-coral/15 px-3 py-2 text-sm text-coral">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const ADD_KIND_OPTIONS: { id: PaymentKind; label: string }[] = [
  { id: "bank", label: "Bank" },
  { id: "telebirr", label: "Telebirr" },
  { id: "cash", label: "Cash" },
  { id: "other", label: "Other" },
];

function PaymentMethodsSettings() {
  const { tenant } = useAuth();
  const orgId = tenant!.organization.id;
  const [methods, setMethods] = useState<OrgPaymentMethod[]>(
    DEFAULT_PAYMENT_METHODS.methods.map((m) => ({ ...m })),
  );
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState<PaymentKind>("bank");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getOrgPaymentMethods(orgId)
      .then((m) => setMethods(m.methods.map((x) => ({ ...x }))))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Could not load methods"),
      );
  }, [orgId]);

  function toggle(id: string) {
    if (id === "cash") return;
    setMethods((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)),
    );
  }

  function removeMethod(id: string) {
    if (id === "cash") return;
    setMethods((prev) => prev.filter((m) => m.id !== id));
  }

  function addMethod() {
    const label = newLabel.trim();
    if (!label) {
      setError("Enter a name for the payment option.");
      return;
    }
    let id = slugPaymentId(label);
    const used = new Set(methods.map((m) => m.id));
    if (used.has(id)) id = `${id}-${Date.now().toString(36).slice(-4)}`;
    setMethods((prev) => [
      ...prev,
      { id, label, kind: newKind, enabled: true },
    ]);
    setNewLabel("");
    setError(null);
    setMessage(null);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await saveOrgPaymentMethods(orgId, { methods });
      setMethods(saved.methods.map((x) => ({ ...x })));
      setMessage("Payment methods saved — used when marking orders paid.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-ink/8 bg-paper/90 p-4 sm:p-5">
      <h3 className="font-display text-xl">Payment methods</h3>
      <p className="mt-1 text-sm text-ink/55">
        Enable built-in tenders or add your own (Awash, CBE Birr, etc.). Assign
        each to Cash, Banks, Telebirr, or Other so Finance can filter paid
        orders. Screenshots still show in Finance.
      </p>
      <form className="mt-4 space-y-4" onSubmit={(e) => void onSave(e)}>
        <ul className="space-y-2">
          {methods.map((m) => {
            const locked = m.id === "cash";
            const custom = m.id.startsWith("custom-");
            return (
              <li key={m.id}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border px-4 py-3",
                    m.enabled
                      ? "border-teal/40 bg-teal/5"
                      : "border-ink/10 bg-stone/30",
                  )}
                >
                  <label
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-3",
                      locked ? "cursor-default" : "cursor-pointer",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-teal"
                      checked={m.enabled}
                      disabled={locked || busy}
                      onChange={() => toggle(m.id)}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{m.label}</span>
                      <span className="text-xs text-ink/45">
                        {PAYMENT_KIND_LABELS[m.kind]}
                        {custom ? " · custom" : ""}
                      </span>
                    </span>
                  </label>
                  {custom ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removeMethod(m.id)}
                      className="shrink-0 text-xs font-medium text-coral"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="rounded-2xl border border-dashed border-ink/15 bg-stone/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
            Add your own
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Awash Bank"
              disabled={busy}
              className="min-w-0 flex-1 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none"
            />
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as PaymentKind)}
              disabled={busy}
              className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none"
            >
              {ADD_KIND_OPTIONS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={addMethod}
              className="rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Save payment methods
        </button>
      </form>
      {message ? (
        <p className="mt-3 rounded-xl bg-teal/15 px-3 py-2 text-sm text-teal">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-xl bg-coral/15 px-3 py-2 text-sm text-coral">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function BusinessSettings() {
  const { tenant, refresh } = useAuth();
  const org = tenant!.organization;
  const [name, setName] = useState(org.name);
  const [phone, setPhone] = useState(org.phone || "");
  const [email, setEmail] = useState(org.email || "");
  const [address, setAddress] = useState(org.address || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(org.name);
    setPhone(org.phone || "");
    setEmail(org.email || "");
    setAddress(org.address || "");
  }, [org.name, org.phone, org.email, org.address]);

  const orgTypeLabel = useMemo(() => {
    if (org.org_type === "cafe") return "Café";
    if (org.org_type === "restaurant") return "Restaurant";
    return "Other";
  }, [org.org_type]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await updateOrganizationProfile({
      orgId: org.id,
      name,
      phone,
      email,
      address,
    });
    setBusy(false);
    if ("error" in res && res.error) {
      setError(res.error);
      return;
    }
    await refresh();
    setMessage("Business details saved.");
  }

  return (
    <section className="rounded-3xl border border-ink/8 bg-paper/90 p-4 sm:p-5">
      <h3 className="font-display text-xl">Business details</h3>
      <p className="mt-1 text-sm text-ink/55">
        Shown on receipts and account screens · {orgTypeLabel}
      </p>
      <form className="mt-4 space-y-3" onSubmit={(e) => void onSave(e)}>
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Business name</span>
          <input
            className="field"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Phone</span>
            <input
              className="field"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Email</span>
            <input
              type="email"
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Address</span>
          <textarea
            className="field min-h-20"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Save business
        </button>
      </form>
      {message ? (
        <p className="mt-3 rounded-xl bg-teal/15 px-3 py-2 text-sm text-teal">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-xl bg-coral/15 px-3 py-2 text-sm text-coral">
          {error}
        </p>
      ) : null}
    </section>
  );
}
