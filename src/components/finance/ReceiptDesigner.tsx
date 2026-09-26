"use client";

import { FormEvent, useEffect, useState } from "react";
import { ReceiptPaperPreview, RECEIPT_WIDTH_OPTIONS } from "@/components/finance/ReceiptPaperPreview";
import {
  DEFAULT_RECEIPT_PROFILE,
  DEFAULT_RECEIPT_SETTINGS,
  getOrgReceiptSettings,
  saveOrgReceiptSettings,
  type OrgReceiptSettings,
  type ReceiptWidthMm,
} from "@/lib/org-tax";
import { cn } from "@/lib/utils";

export function ReceiptDesigner({
  orgId,
  defaults,
}: {
  orgId: string;
  defaults?: {
    businessName?: string | null;
    phone?: string | null;
    address?: string | null;
  };
}) {
  const [settings, setSettings] = useState<OrgReceiptSettings>(() => ({
    ...DEFAULT_RECEIPT_SETTINGS,
    profile: {
      ...DEFAULT_RECEIPT_PROFILE,
      businessName: defaults?.businessName || "",
      phone: defaults?.phone || "",
      address: defaults?.address || "",
    },
  }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const s = await getOrgReceiptSettings(orgId);
        setSettings({
          ...s,
          profile: {
            ...s.profile,
            businessName:
              s.profile.businessName || defaults?.businessName || "",
            phone: s.profile.phone || defaults?.phone || "",
            address: s.profile.address || defaults?.address || "",
          },
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load receipt");
      } finally {
        setLoaded(true);
      }
    })();
  }, [orgId, defaults?.businessName, defaults?.phone, defaults?.address]);

  function patchProfile<K extends keyof OrgReceiptSettings["profile"]>(
    key: K,
    value: OrgReceiptSettings["profile"][K],
  ) {
    setSettings((s) => ({
      ...s,
      profile: { ...s.profile, [key]: value },
    }));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await saveOrgReceiptSettings(orgId, settings);
      setMessage("Receipt design saved — used on new orders and prints.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <p className="rounded-3xl border border-ink/8 bg-white/80 p-6 text-sm text-ink/50">
        Loading receipt designer…
      </p>
    );
  }

  const p = settings.profile;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <form
        onSubmit={(e) => void onSave(e)}
        className="space-y-4 rounded-3xl border border-ink/8 bg-white/80 p-4 sm:p-5"
      >
        <div>
          <h2 className="font-display text-xl">Receipt designer</h2>
          <p className="mt-1 text-sm text-ink/55">
            Design what prints on every receipt. Preview updates as you type.
          </p>
        </div>

        <fieldset className="space-y-3 rounded-2xl border border-ink/8 bg-stone/40 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink/50">
            Paper size
          </legend>
          <div className="flex flex-wrap gap-2">
            {RECEIPT_WIDTH_OPTIONS.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => patchProfile("widthMm", w.id as ReceiptWidthMm)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium",
                  p.widthMm === w.id
                    ? "bg-teal text-white"
                    : "bg-white text-ink/70",
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-3 rounded-2xl border border-ink/8 bg-stone/40 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink/50">
            Place identity
          </legend>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Business / place name</span>
            <input
              className="field"
              value={p.businessName}
              onChange={(e) => patchProfile("businessName", e.target.value)}
              placeholder="e.g. Aramis Café"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Phone</span>
            <input
              className="field"
              value={p.phone}
              onChange={(e) => patchProfile("phone", e.target.value)}
              placeholder="+251…"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Address / location</span>
            <textarea
              className="field min-h-16"
              value={p.address}
              onChange={(e) => patchProfile("address", e.target.value)}
              placeholder="Street, city"
            />
          </label>
        </fieldset>

        <fieldset className="space-y-3 rounded-2xl border border-ink/8 bg-stone/40 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink/50">
            Header & format
          </legend>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Receipt title</span>
            <input
              className="field"
              value={p.title}
              onChange={(e) => patchProfile("title", e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Header note</span>
            <input
              className="field"
              value={p.headerNote}
              onChange={(e) => patchProfile("headerNote", e.target.value)}
              placeholder="e.g. Open daily 7am–10pm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">
              Extra lines (anything else to print)
            </span>
            <textarea
              className="field min-h-20"
              value={p.extraLines}
              onChange={(e) => patchProfile("extraLines", e.target.value)}
              placeholder="Wifi password, Instagram, house rules…"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink/60">Footer</span>
            <textarea
              className="field min-h-16"
              value={p.footer}
              onChange={(e) => patchProfile("footer", e.target.value)}
            />
          </label>
        </fieldset>

        <fieldset className="space-y-3 rounded-2xl border border-ink/8 bg-stone/40 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink/50">
            Service charge & VAT
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Service %</span>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                className="field"
                value={settings.service_percent}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    service_percent: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">VAT %</span>
              <select
                className="field"
                value={
                  [0, 10, 15].includes(settings.vat_percent)
                    ? settings.vat_percent
                    : "custom"
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "custom") return;
                  setSettings((s) => ({
                    ...s,
                    vat_percent: Number(v),
                  }));
                }}
              >
                <option value={0}>0%</option>
                <option value={10}>10%</option>
                <option value={15}>15%</option>
                <option value="custom">Custom…</option>
              </select>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                className="field mt-2"
                value={settings.vat_percent}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    vat_percent: Number(e.target.value),
                  }))
                }
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Service label</span>
              <input
                className="field"
                value={p.serviceLabel}
                onChange={(e) => patchProfile("serviceLabel", e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">VAT label</span>
              <input
                className="field"
                value={p.vatLabel}
                onChange={(e) => patchProfile("vatLabel", e.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={p.showService}
                onChange={(e) => patchProfile("showService", e.target.checked)}
              />
              Show service on receipt
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={p.showVat}
                onChange={(e) => patchProfile("showVat", e.target.checked)}
              />
              Show VAT on receipt
            </label>
          </div>
        </fieldset>

        {error ? (
          <p className="rounded-xl bg-coral/15 px-3 py-2 text-sm text-coral">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-xl bg-teal/10 px-3 py-2 text-sm text-teal">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-teal py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save receipt design"}
        </button>
      </form>

      <div className="rounded-3xl border border-ink/8 bg-ink/5 p-4 sm:p-5">
        <h3 className="mb-3 font-display text-lg">How it will look</h3>
        <div className="flex justify-center overflow-x-auto py-2">
          <ReceiptPaperPreview
            profile={p}
            vatPercent={settings.vat_percent}
            servicePercent={settings.service_percent}
          />
        </div>
      </div>
    </div>
  );
}
