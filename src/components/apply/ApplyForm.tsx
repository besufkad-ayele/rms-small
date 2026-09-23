"use client";

import { FormEvent, useState } from "react";
import { submitApplicationAction } from "@/app/apply/actions";

function fileToBase64(file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ApplyForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [inventory, setInventory] = useState(true);
  const [finance, setFinance] = useState(true);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const license = fd.get("license") as File | null;
    const idDoc = fd.get("idDoc") as File | null;

    try {
      const [licenseB64, idB64] = await Promise.all([
        fileToBase64(license),
        fileToBase64(idDoc),
      ]);
      const res = await submitApplicationAction(
        {
          fullName: String(fd.get("fullName") ?? ""),
          email: String(fd.get("email") ?? ""),
          phone: String(fd.get("phone") ?? ""),
          companyName: String(fd.get("companyName") ?? ""),
          orgType: String(fd.get("orgType") ?? "cafe") as
            | "cafe"
            | "restaurant"
            | "other",
          website: String(fd.get("website") ?? ""),
          address: String(fd.get("address") ?? ""),
          city: String(fd.get("city") ?? ""),
          region: String(fd.get("region") ?? ""),
          country: String(fd.get("country") ?? "Ethiopia"),
          notes: String(fd.get("notes") ?? ""),
          inventoryWanted: inventory,
          financeWanted: finance,
        },
        licenseB64,
        license?.name,
        idB64,
        idDoc?.name,
      );
      setBusy(false);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setDone(true);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Submit failed");
    }
  }

  if (done) {
    return (
      <div className="rounded-3xl border border-teal/30 bg-white p-6 text-center sm:p-8">
        <h2 className="font-display text-2xl text-ink">Application received</h2>
        <p className="mt-3 text-sm text-ink/60">
          We will review your details and create your login. You will receive
          access by email after approval.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="space-y-4 rounded-3xl border border-ink/8 bg-white/95 p-5 shadow-sm sm:p-7"
    >
      <div>
        <h2 className="font-display text-xl text-ink">Access request</h2>
        <p className="mt-1 text-sm text-ink/55">
          No password on this form. Login is created after review.
        </p>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-ink/60">Your full name *</span>
        <input name="fullName" required className="field" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Email *</span>
          <input name="email" type="email" required className="field" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Phone *</span>
          <input name="phone" required className="field" />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Company name (optional)</span>
          <input name="companyName" className="field" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Business type *</span>
          <select name="orgType" className="field" defaultValue="cafe">
            <option value="cafe">Café</option>
            <option value="restaurant">Restaurant</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-ink/60">Website (optional)</span>
        <input name="website" type="url" placeholder="https://" className="field" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-ink/60">Address (optional)</span>
        <input name="address" className="field" />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">City *</span>
          <input name="city" required className="field" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Region (optional)</span>
          <input name="region" className="field" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Country</span>
          <input name="country" defaultValue="Ethiopia" className="field" />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Business license (optional)</span>
          <input name="license" type="file" accept="image/*,.pdf" className="block w-full text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink/60">Owner ID (optional)</span>
          <input name="idDoc" type="file" accept="image/*,.pdf" className="block w-full text-sm" />
        </label>
      </div>

      <textarea
        name="notes"
        className="field min-h-24"
        placeholder="Anything else we should know (optional)"
      />

      <div className="space-y-2 rounded-2xl bg-stone/60 p-3">
        <p className="text-sm font-semibold">Modules you want</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={inventory}
            onChange={(e) => setInventory(e.target.checked)}
          />
          Inventory (menu, stock, cashier)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={finance}
            onChange={(e) => setFinance(e.target.checked)}
          />
          Finance (dashboard, exports, day close)
        </label>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-teal py-3.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Submitting…" : "Submit application"}
      </button>
      {error ? (
        <p className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>
      ) : null}
    </form>
  );
}
