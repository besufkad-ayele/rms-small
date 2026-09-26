"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getPricingCatalogAction } from "@/app/platform/actions";
import { useAuth } from "@/components/auth/AuthProvider";
import { listOrgPaymentProofs } from "@/lib/cloud-auth";
import {
  calculateAmount,
  packageModuleFlags,
  type ModulePriceRow,
  type PackageRow,
} from "@/lib/pricing";
import {
  APP_MODULE_LABELS,
  subscriptionEndsAt,
  type AppModule,
  type Subscription,
} from "@/lib/tenant";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";

const MODULES: AppModule[] = [
  "menu",
  "ordering",
  "inventory",
  "finance",
  "hr",
];

const MODULE_HINTS: Record<AppModule, string> = {
  menu: "Recipes, categories, availability",
  ordering: "Tables, POS, kitchen tickets",
  inventory: "Stock, purchases, units",
  finance: "Reports & day close",
  hr: "Staff seats & permissions",
};

type ModuleState = Record<AppModule, boolean>;

function flagsFromSub(
  sub: Pick<
    Subscription,
    | "inventory_enabled"
    | "finance_enabled"
    | "menu_enabled"
    | "ordering_enabled"
    | "hr_enabled"
  >,
): ModuleState {
  const inv = sub.inventory_enabled;
  return {
    menu: sub.menu_enabled ?? inv,
    ordering: sub.ordering_enabled ?? inv,
    inventory: inv,
    finance: sub.finance_enabled,
    hr: sub.hr_enabled ?? true,
  };
}

export function BillingPanel() {
  const { tenant, daysLeft, warningLevel, setModules, uploadProof, accessBlocked } =
    useAuth();
  const [mods, setMods] = useState<ModuleState>(() =>
    flagsFromSub(
      tenant?.subscription ?? {
        inventory_enabled: true,
        finance_enabled: true,
      },
    ),
  );
  const [payMods, setPayMods] = useState<ModuleState>(() =>
    flagsFromSub(
      tenant?.subscription ?? {
        inventory_enabled: true,
        finance_enabled: true,
      },
    ),
  );
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [modulePrices, setModulePrices] = useState<ModulePriceRow[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<string>("");
  const [months, setMonths] = useState(1);
  const [amountOverride, setAmountOverride] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [proofs, setProofs] = useState<Record<string, unknown>[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant) return;
    const next = flagsFromSub(tenant.subscription);
    setMods(next);
    setPayMods(next);
  }, [tenant]);

  useEffect(() => {
    void (async () => {
      const res = await getPricingCatalogAction();
      if ("error" in res) {
        setCatalogError(res.error ?? "Could not load prices");
        return;
      }
      setPackages(res.packages);
      setModulePrices(res.modulePrices);
      setCatalogError(null);
    })();
  }, []);

  const breakdown = useMemo(
    () =>
      calculateAmount({
        months,
        packages,
        modulePrices,
        packageCode: selectedPackage || null,
        modules: payMods,
      }),
    [months, packages, modulePrices, selectedPackage, payMods],
  );

  const displayAmount =
    amountOverride !== null ? amountOverride : String(breakdown.total_etb);

  const reloadProofs = useCallback(async () => {
    if (!tenant) return;
    try {
      setProofs(await listOrgPaymentProofs(tenant.organization.id));
    } catch {
      /* ignore */
    }
  }, [tenant]);

  useEffect(() => {
    void reloadProofs();
  }, [reloadProofs]);

  if (!tenant) return null;
  const sub = tenant.subscription;
  const endsAt = subscriptionEndsAt(sub);
  const kind = sub.status === "trialing" ? "Trial" : "Subscription";

  async function saveModules() {
    setBusy(true);
    setError(null);
    const err = await setModules({
      menuEnabled: mods.menu,
      orderingEnabled: mods.ordering,
      inventoryEnabled: mods.inventory,
      financeEnabled: mods.finance,
      hrEnabled: mods.hr,
    });
    setBusy(false);
    if (err) setError(err);
    else setMessage("Modules updated.");
  }

  async function onProof(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("proof") as File | null;
    if (!file || file.size === 0) {
      setBusy(false);
      setError("Attach a payment photo or video.");
      return;
    }
    if (!selectedPackage && !MODULES.some((m) => payMods[m])) {
      setBusy(false);
      setError("Select a package or at least one module.");
      return;
    }
    const amount = Number(displayAmount || 0);
    if (!(amount > 0)) {
      setBusy(false);
      setError("Amount must be greater than zero.");
      return;
    }

    const modulesForSubmit = selectedPackage
      ? (() => {
          const pkg = packages.find((p) => p.code === selectedPackage);
          return pkg ? packageModuleFlags(pkg) : payMods;
        })()
      : payMods;

    const err = await uploadProof({
      amount,
      method: String(fd.get("method") || "telebirr") as
        | "cash"
        | "cbe"
        | "telebirr"
        | "other",
      reference: String(fd.get("reference") || ""),
      file,
      monthsRequested: months,
      modules: {
        menuEnabled: modulesForSubmit.menu,
        orderingEnabled: modulesForSubmit.ordering,
        inventoryEnabled: modulesForSubmit.inventory,
        financeEnabled: modulesForSubmit.finance,
        hrEnabled: modulesForSubmit.hr,
      },
      packageCode: selectedPackage || null,
      expectedAmountEtb: breakdown.total_etb,
      amountBreakdown: breakdown,
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setMessage(
      "Approval request sent. Access stays as-is until Aramis verifies payment and extends your period.",
    );
    (e.target as HTMLFormElement).reset();
    setAmountOverride(null);
    await reloadProofs();
  }

  function enabledLabels(row: Record<string, unknown>) {
    return MODULES.filter((m) => {
      const key = `${m}_enabled` as const;
      const v = row[key];
      if (v === null || v === undefined) return false;
      return Boolean(v);
    })
      .map((m) => APP_MODULE_LABELS[m])
      .join(", ");
  }

  const priceByModule = useMemo(() => {
    const map = new Map<AppModule, number>();
    for (const m of modulePrices) {
      if (m.active) map.set(m.module_code, Number(m.monthly_price_etb) || 0);
    }
    return map;
  }, [modulePrices]);

  return (
    <div className="space-y-4">
      {accessBlocked ? (
        <div className="rounded-3xl border border-coral/30 bg-coral/10 p-4 text-sm text-coral sm:p-5">
          Access paused — {kind.toLowerCase()} ended. Submit payment proof below;
          after verification your period will be extended.
        </div>
      ) : warningLevel !== "none" ? (
        <div
          className={cn(
            "rounded-3xl border p-4 text-sm sm:p-5",
            warningLevel === "urgent"
              ? "border-coral/40 bg-coral/10 text-coral"
              : "border-gold/40 bg-gold/15 text-ink",
          )}
        >
          {kind} ends in {Math.max(0, daysLeft)} day(s)
          {endsAt ? ` · ${formatDateTime(endsAt)}` : ""}. Extend with a payment
          proof below.
        </div>
      ) : null}

      <section className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-6">
        <h2 className="font-display text-xl">Subscription</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-2xl bg-stone/60 px-3 py-3">
            <dt className="text-xs text-ink/50">Status</dt>
            <dd className="mt-1 font-semibold capitalize">{sub.status}</dd>
          </div>
          <div
            className={cn(
              "rounded-2xl px-3 py-3",
              warningLevel === "urgent"
                ? "bg-coral/15"
                : warningLevel === "notice"
                  ? "bg-gold/20"
                  : "bg-stone/60",
            )}
          >
            <dt className="text-xs text-ink/50">Days left</dt>
            <dd
              className={cn(
                "mt-1 font-semibold",
                warningLevel === "urgent" && "text-coral",
              )}
            >
              {daysLeft > 900 ? "—" : `${Math.max(0, daysLeft)} day(s)`}
            </dd>
          </div>
          <div className="rounded-2xl bg-stone/60 px-3 py-3 sm:col-span-2">
            <dt className="text-xs text-ink/50">
              {sub.status === "trialing" ? "Trial ends" : "Period ends"}
            </dt>
            <dd className="mt-1 font-semibold">
              {endsAt ? formatDateTime(endsAt) : "—"}
            </dd>
          </div>
          <div className="rounded-2xl bg-stone/60 px-3 py-3 sm:col-span-2">
            <dt className="text-xs text-ink/50">Plan</dt>
            <dd className="mt-1 font-semibold">{sub.plan_code}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-6">
        <h2 className="font-display text-xl">Modules</h2>
        <p className="mt-1 text-sm text-ink/55">
          Toggle which areas your business uses. Keep at least one enabled.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {MODULES.map((m) => (
            <label
              key={m}
              className="flex items-start gap-3 rounded-2xl bg-stone/50 p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={mods[m]}
                onChange={(e) =>
                  setMods((prev) => ({ ...prev, [m]: e.target.checked }))
                }
                className="mt-1"
              />
              <span>
                <span className="font-medium">{APP_MODULE_LABELS[m]}</span>
                <span className="block text-xs text-ink/50">{MODULE_HINTS[m]}</span>
              </span>
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveModules()}
          className="mt-4 w-full rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-stone sm:w-auto sm:px-6"
        >
          Save modules
        </button>
      </section>

      <section className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-6">
        <h2 className="font-display text-xl">Extend subscription</h2>
        <p className="mt-1 text-sm text-ink/55">
          Pick a package or modules, choose months, pay the calculated amount,
          then upload Telebirr / CBE / bank proof. Access stays as-is until
          Aramis verifies.
        </p>
        {catalogError ? (
          <p className="mt-2 text-sm text-coral">{catalogError}</p>
        ) : null}

        {packages.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-ink/70">Packages</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedPackage("");
                  setAmountOverride(null);
                }}
                className={cn(
                  "rounded-2xl border px-3 py-3 text-left text-sm",
                  !selectedPackage
                    ? "border-teal bg-teal/10"
                    : "border-ink/10 bg-stone/40",
                )}
              >
                <span className="font-semibold">Custom modules</span>
                <span className="mt-1 block text-xs text-ink/50">
                  Build à-la-carte
                </span>
              </button>
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => {
                    setSelectedPackage(pkg.code);
                    setPayMods(packageModuleFlags(pkg));
                    setAmountOverride(null);
                  }}
                  className={cn(
                    "rounded-2xl border px-3 py-3 text-left text-sm",
                    selectedPackage === pkg.code
                      ? "border-teal bg-teal/10"
                      : "border-ink/10 bg-stone/40",
                  )}
                >
                  <span className="font-semibold">{pkg.name}</span>
                  <span className="mt-0.5 block text-xs text-teal">
                    {formatMoney(Number(pkg.monthly_price_etb))}/mo
                  </span>
                  <span className="mt-1 block text-xs text-ink/50">
                    {pkg.description || `${pkg.max_staff_seats} seats`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <form className="mt-4 space-y-3" onSubmit={(e) => void onProof(e)}>
          {!selectedPackage ? (
            <div>
              <p className="mb-2 text-sm text-ink/60">
                Modules for this payment
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {MODULES.map((m) => (
                  <label
                    key={`pay-${m}`}
                    className="flex items-start gap-2 rounded-2xl bg-stone/50 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={payMods[m]}
                      onChange={(e) => {
                        setPayMods((prev) => ({
                          ...prev,
                          [m]: e.target.checked,
                        }));
                        setAmountOverride(null);
                      }}
                    />
                    <span>
                      <span className="font-medium">{APP_MODULE_LABELS[m]}</span>
                      <span className="block text-xs text-ink/50">
                        {formatMoney(priceByModule.get(m) || 0)}/mo
                        {modulePrices.find((p) => p.module_code === m)
                          ?.description
                          ? ` · ${modulePrices.find((p) => p.module_code === m)?.description}`
                          : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-stone/50 px-3 py-3 text-sm">
              <p className="font-medium text-ink/70">What you’re paying for</p>
              <p className="mt-1 text-ink/60">
                {breakdown.package_name} ·{" "}
                {breakdown.line_items
                  .map((l) => `${l.label} (${formatMoney(l.monthly_etb)}/mo)`)
                  .join(" · ") ||
                  MODULES.filter((m) => payMods[m])
                    .map((m) => APP_MODULE_LABELS[m])
                    .join(" · ")}
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Months</span>
              <select
                name="months"
                className="field"
                value={months}
                onChange={(e) => {
                  setMonths(Number(e.target.value));
                  setAmountOverride(null);
                }}
              >
                <option value="1">1 month</option>
                <option value="3">3 months</option>
                <option value="6">6 months</option>
                <option value="12">12 months</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Amount (ETB)</span>
              <input
                name="amount"
                type="number"
                min={0}
                step="0.01"
                required
                className="field"
                value={displayAmount}
                onChange={(e) => setAmountOverride(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Method</span>
              <select name="method" className="field" defaultValue="telebirr">
                <option value="telebirr">Telebirr</option>
                <option value="cbe">CBE</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Reference</span>
              <input name="reference" className="field" placeholder="Txn ID" />
            </label>
          </div>

          <div className="rounded-2xl border border-teal/25 bg-teal/5 px-4 py-3">
            <p className="font-display text-lg text-ink">
              You will pay {formatMoney(breakdown.total_etb)} for {months}{" "}
              month{months > 1 ? "s" : ""}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-ink/60">
              {breakdown.line_items.map((l) => (
                <li key={l.code}>
                  {l.label}: {formatMoney(l.monthly_etb)}/mo × {months} ={" "}
                  {formatMoney(l.monthly_etb * months)}
                </li>
              ))}
              {breakdown.line_items.length === 0 ? (
                <li>Select a package or modules to see the breakdown.</li>
              ) : null}
            </ul>
            {amountOverride !== null &&
            Number(amountOverride) !== breakdown.total_etb ? (
              <p className="mt-2 text-xs text-gold">
                You overrode the amount — catalog expects{" "}
                {formatMoney(breakdown.total_etb)}.
              </p>
            ) : null}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Proof photo or video</span>
            <input
              name="proof"
              type="file"
              accept="image/*,video/*"
              required
              className="block w-full text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={busy || breakdown.total_etb <= 0}
            className="w-full rounded-xl bg-teal px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Uploading…" : "Submit approval request"}
          </button>
        </form>
      </section>

      {proofs.length > 0 ? (
        <section className="rounded-3xl border border-ink/8 bg-white/90 p-4 sm:p-6">
          <h2 className="font-display text-xl">Your requests</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {proofs.map((p) => {
              const modsLabel = enabledLabels(p);
              return (
                <li
                  key={String(p.id)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-stone/50 px-3 py-2"
                >
                  <span>
                    {formatMoney(Number(p.amount))}
                    {p.expected_amount_etb != null
                      ? ` (catalog ${formatMoney(Number(p.expected_amount_etb))})`
                      : ""}{" "}
                    · {String(p.months_requested || 1)} mo · {String(p.method)}
                    {p.package_code ? ` · ${String(p.package_code)}` : ""}
                    {modsLabel ? ` · ${modsLabel}` : ""}
                    {p.media_kind === "video" ? " · video" : ""}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs capitalize",
                      p.status === "pending" && "bg-gold/25",
                      p.status === "approved" && "bg-teal/20 text-teal",
                      p.status === "rejected" && "bg-coral/15 text-coral",
                    )}
                  >
                    {String(p.status)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {message ? (
        <p className="rounded-xl bg-teal/10 px-3 py-2 text-sm text-teal">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">
          {error}
        </p>
      ) : null}
    </div>
  );
}
