"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  completeInterestApplicationAction,
  listPublicPackagesAction,
  startInterestApplicationAction,
  type InterestUploadSlot,
} from "@/app/apply/actions";
import { AramisLogo } from "@/components/brand/AramisLogo";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { PhoneField } from "@/components/ui/PhoneField";
import { fileToWebpBlob, formatBytes } from "@/lib/menu-image";
import type { PackageRow } from "@/lib/pricing";
import type { PhoneAssessment } from "@/lib/phone";
import { APP_MODULE_LABELS, type AppModule } from "@/lib/tenant";
import { cn, formatMoney } from "@/lib/utils";

const MODULES: AppModule[] = [
  "menu",
  "ordering",
  "kitchen",
  "inventory",
  "finance",
  "hr",
  "online",
];

/** Max original file before we refuse (phone cameras). */
const MAX_DOC_BYTES = 12 * 1024 * 1024;
/** Target size after WebP compression for license/ID photos. */
const DOC_IMAGE_TARGET_BYTES = 400 * 1024;
/** Target size after WebP compression for business logo. */
const LOGO_TARGET_BYTES = 150 * 1024;

const DOC_ACCEPT =
  "image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const PASSTHROUGH_DOCS: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const IMAGE_EXTS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "heic",
  "heif",
  "tif",
  "tiff",
  "avif",
]);

function fileExt(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop()!.replace(/[^a-z0-9]/g, "") : "";
}

async function putSignedUpload(
  slot: InterestUploadSlot,
  body: Blob,
  contentType: string,
) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(slot.bucket)
    .uploadToSignedUrl(slot.path, slot.token, body, {
      contentType,
    });
  if (error) {
    throw new Error(error.message || "Upload failed. Try a smaller file.");
  }
}

type PreparedUpload = {
  blob: Blob;
  ext: string;
  contentType: string;
  originalBytes: number;
  compressedBytes: number;
};

async function compressLogo(file: File): Promise<PreparedUpload> {
  if (file.size > MAX_DOC_BYTES) {
    throw new Error(
      `Logo is too large (${formatBytes(file.size)}). Max ${formatBytes(MAX_DOC_BYTES)}.`,
    );
  }
  const webp = await fileToWebpBlob(file, 512, 0.85, LOGO_TARGET_BYTES);
  if (!webp) {
    throw new Error("Could not read this logo. Try another image.");
  }
  return {
    blob: webp,
    ext: "webp",
    contentType: "image/webp",
    originalBytes: file.size,
    compressedBytes: webp.size,
  };
}

async function prepareDocBlob(
  file: File | null,
): Promise<PreparedUpload | null> {
  if (!file || file.size === 0) return null;
  if (file.size > MAX_DOC_BYTES) {
    throw new Error(
      `Document is too large (${formatBytes(file.size)}). Max ${formatBytes(MAX_DOC_BYTES)}.`,
    );
  }

  const ext = fileExt(file.name);
  const mime = (file.type || "").toLowerCase();

  // PDF / Word — upload as-is (cannot compress in the browser)
  if (ext in PASSTHROUGH_DOCS) {
    return {
      blob: file,
      ext,
      contentType: mime || PASSTHROUGH_DOCS[ext],
      originalBytes: file.size,
      compressedBytes: file.size,
    };
  }
  if (mime === "application/pdf") {
    return {
      blob: file,
      ext: "pdf",
      contentType: "application/pdf",
      originalBytes: file.size,
      compressedBytes: file.size,
    };
  }
  if (
    mime === "application/msword" ||
    mime.includes("wordprocessingml") ||
    mime.includes("msword")
  ) {
    return {
      blob: file,
      ext: ext === "doc" ? "doc" : "docx",
      contentType: mime,
      originalBytes: file.size,
      compressedBytes: file.size,
    };
  }

  const looksLikeImage =
    mime.startsWith("image/") || (ext ? IMAGE_EXTS.has(ext) : false);

  if (looksLikeImage) {
    try {
      const webp = await fileToWebpBlob(
        file,
        1400,
        0.8,
        DOC_IMAGE_TARGET_BYTES,
      );
      if (webp) {
        return {
          blob: webp,
          ext: "webp",
          contentType: "image/webp",
          originalBytes: file.size,
          compressedBytes: webp.size,
        };
      }
    } catch (err) {
      throw err instanceof Error
        ? err
        : new Error("Could not compress this photo.");
    }
    throw new Error(
      "Could not read this photo. Try JPG/PNG, or upload a PDF / Word file.",
    );
  }

  if (!ext) {
    throw new Error(
      "Unsupported document. Use an image, PDF, or Word file (.doc / .docx).",
    );
  }

  return {
    blob: file,
    ext,
    contentType: mime || "application/octet-stream",
    originalBytes: file.size,
    compressedBytes: file.size,
  };
}

function sizeHint(prepared: PreparedUpload | null, label: string) {
  if (!prepared) return null;
  if (prepared.compressedBytes < prepared.originalBytes) {
    return `${label}: ${formatBytes(prepared.originalBytes)} → ${formatBytes(prepared.compressedBytes)} (compressed)`;
  }
  return `${label}: ${formatBytes(prepared.compressedBytes)}`;
}

function packageModules(pkg: PackageRow): string {
  const flags: Record<AppModule, boolean> = {
    menu: pkg.menu_enabled,
    ordering: pkg.ordering_enabled,
    kitchen: pkg.kitchen_enabled ?? pkg.ordering_enabled,
    inventory: pkg.inventory_enabled,
    finance: pkg.finance_enabled,
    hr: pkg.hr_enabled,
    online: Boolean(pkg.online_enabled),
  };
  return MODULES.filter((m) => flags[m])
    .map((m) => APP_MODULE_LABELS[m])
    .join(" · ");
}

export function InterestForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [packageCode, setPackageCode] = useState("");
  const [phone, setPhone] = useState<PhoneAssessment | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoPrepared, setLogoPrepared] = useState<PreparedUpload | null>(null);
  const [licensePrepared, setLicensePrepared] =
    useState<PreparedUpload | null>(null);
  const [idPrepared, setIdPrepared] = useState<PreparedUpload | null>(null);
  const [compressing, setCompressing] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await listPublicPackagesAction();
      if ("packages" in res && res.packages) {
        setPackages(res.packages);
        if (res.packages[0]) setPackageCode(res.packages[0].code);
      }
    })();
  }, []);

  useEffect(() => {
    if (!logoPrepared) {
      setLogoPreview(null);
      return;
    }
    const url = URL.createObjectURL(logoPrepared.blob);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoPrepared]);

  async function onLogoPicked(file: File | null) {
    setError(null);
    setLogoPrepared(null);
    if (!file) return;
    setCompressing("logo");
    try {
      setLogoPrepared(await compressLogo(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo compress failed");
    } finally {
      setCompressing(null);
    }
  }

  async function onDocPicked(
    kind: "license" | "id",
    file: File | null,
  ) {
    setError(null);
    if (kind === "license") setLicensePrepared(null);
    else setIdPrepared(null);
    if (!file) return;
    setCompressing(kind);
    try {
      const prepared = await prepareDocBlob(file);
      if (kind === "license") setLicensePrepared(prepared);
      else setIdPrepared(prepared);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document compress failed");
    } finally {
      setCompressing(null);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);

    if (phone?.error || !phone?.e164) {
      setBusy(false);
      setError(phone?.error || "Phone is required.");
      return;
    }
    if (!logoPrepared) {
      setBusy(false);
      setError("Business logo is required.");
      return;
    }
    if (!packageCode) {
      setBusy(false);
      setError("Select a package.");
      return;
    }

    const selected = packages.find((p) => p.code === packageCode);

    try {
      const licenseDoc = licensePrepared;
      const idDocPrepared = idPrepared;

      const start = await startInterestApplicationAction({
        fullName: String(fd.get("fullName") ?? ""),
        email: String(fd.get("email") ?? ""),
        phone: phone.e164,
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
        tin: String(fd.get("tin") ?? ""),
        vatNumber: String(fd.get("vat") ?? ""),
        notes: String(fd.get("notes") ?? ""),
        packageCode,
        menuWanted: selected?.menu_enabled,
        orderingWanted: selected?.ordering_enabled,
        kitchenWanted: selected?.kitchen_enabled ?? selected?.ordering_enabled,
        inventoryWanted: selected?.inventory_enabled,
        financeWanted: selected?.finance_enabled,
        hrWanted: selected?.hr_enabled,
        onlineWanted: selected?.online_enabled,
        licenseExt: licenseDoc?.ext ?? null,
        idExt: idDocPrepared?.ext ?? null,
      });
      if ("error" in start && start.error) {
        setBusy(false);
        setError(start.error);
        return;
      }
      if (!("ok" in start) || !start.ok) {
        setBusy(false);
        setError("Could not start application.");
        return;
      }

      await putSignedUpload(
        start.logo,
        logoPrepared.blob,
        logoPrepared.contentType,
      );
      if (start.license && licenseDoc) {
        await putSignedUpload(
          start.license,
          licenseDoc.blob,
          licenseDoc.contentType,
        );
      }
      if (start.idDoc && idDocPrepared) {
        await putSignedUpload(
          start.idDoc,
          idDocPrepared.blob,
          idDocPrepared.contentType,
        );
      }

      const doneRes = await completeInterestApplicationAction({
        applicationId: start.applicationId,
        licensePath: start.license?.path ?? null,
        idPath: start.idDoc?.path ?? null,
      });
      setBusy(false);
      if ("error" in doneRes && doneRes.error) {
        setError(doneRes.error);
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
      <div className="mx-auto w-full max-w-xl px-4 py-12">
        <div className="rounded-3xl border border-teal/30 bg-white p-6 text-center sm:p-8">
          <AramisLogo variant="mark" className="mx-auto h-12 w-12" />
          <h2 className="mt-4 font-display text-2xl text-ink">
            Interest received
          </h2>
          <p className="mt-3 text-sm text-ink/60">
            Aramis will review your details, start your trial on the package you
            chose, and send you login credentials. You do not set a password —
            we create it for you.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-xl bg-teal px-5 py-2.5 text-sm font-semibold text-white"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-stone px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-xl">
        <div className="flex items-center gap-3">
          <AramisLogo variant="mark" className="h-10 w-10" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">
              Request access
            </p>
            <h1 className="font-display text-3xl text-ink sm:text-4xl">
              Tell us about your business
            </h1>
          </div>
        </div>
        <p className="mt-3 text-sm text-ink/60">
          No password on this form. After Aramis approves, we send login details
          for your selected package and trial.
        </p>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="mt-6 space-y-4 rounded-3xl border border-ink/8 bg-white/90 p-5 shadow-sm sm:p-7"
        >
          <label className="block text-sm">
            <FieldLabel required>Your full name</FieldLabel>
            <input name="fullName" required className="field" autoComplete="name" />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <FieldLabel required>Email</FieldLabel>
              <input
                name="email"
                type="email"
                required
                className="field"
                autoComplete="email"
              />
            </label>
            <div className="block text-sm">
              <FieldLabel required>Phone</FieldLabel>
              <PhoneField required onChange={setPhone} />
            </div>
          </div>

          <label className="block text-sm">
            <FieldLabel required>Business name</FieldLabel>
            <input name="companyName" required className="field" />
          </label>

          <label className="block text-sm">
            <FieldLabel required>Business type</FieldLabel>
            <select name="orgType" className="field" defaultValue="cafe">
              <option value="cafe">Café</option>
              <option value="restaurant">Restaurant</option>
              <option value="other">Other</option>
            </select>
          </label>

          <div className="rounded-2xl border border-ink/10 bg-stone/40 p-3">
            <FieldLabel required>Business logo</FieldLabel>
            <p className="mt-1 text-xs text-ink/50">
              Shown in your app header. Photos are compressed to about{" "}
              {formatBytes(LOGO_TARGET_BYTES)} before upload.
            </p>
            <div className="mt-3 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-ink/10 bg-white">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] text-ink/40">Logo</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <label className="inline-block cursor-pointer rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm font-medium">
                  {compressing === "logo"
                    ? "Compressing…"
                    : logoPrepared
                      ? "Change logo"
                      : "Upload logo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={compressing !== null || busy}
                    onChange={(e) =>
                      void onLogoPicked(e.target.files?.[0] || null)
                    }
                  />
                </label>
                {sizeHint(logoPrepared, "Logo") ? (
                  <p className="mt-1.5 text-xs text-teal">
                    {sizeHint(logoPrepared, "Logo")}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <label className="block text-sm">
            <FieldLabel>Address</FieldLabel>
            <input name="address" className="field" />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <FieldLabel required>City</FieldLabel>
              <input name="city" required className="field" />
            </label>
            <label className="block text-sm">
              <FieldLabel>Region</FieldLabel>
              <input name="region" className="field" />
            </label>
            <label className="block text-sm">
              <FieldLabel required>Country</FieldLabel>
              <input
                name="country"
                className="field"
                defaultValue="Ethiopia"
                required
              />
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
              <input
                name="website"
                className="field"
                placeholder="cafe.example"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <FieldLabel>Business license</FieldLabel>
              <input
                type="file"
                accept={DOC_ACCEPT}
                className="block w-full text-sm"
                disabled={compressing !== null || busy}
                onChange={(e) =>
                  void onDocPicked("license", e.target.files?.[0] || null)
                }
              />
              <p className="mt-1 text-xs text-ink/45">
                Image (compressed to ~{formatBytes(DOC_IMAGE_TARGET_BYTES)}),
                PDF, or Word — up to {formatBytes(MAX_DOC_BYTES)}.
              </p>
              {compressing === "license" ? (
                <p className="mt-1 text-xs text-ink/55">Compressing…</p>
              ) : sizeHint(licensePrepared, "License") ? (
                <p className="mt-1 text-xs text-teal">
                  {sizeHint(licensePrepared, "License")}
                </p>
              ) : null}
            </label>
            <label className="block text-sm">
              <FieldLabel>Owner ID</FieldLabel>
              <input
                type="file"
                accept={DOC_ACCEPT}
                className="block w-full text-sm"
                disabled={compressing !== null || busy}
                onChange={(e) =>
                  void onDocPicked("id", e.target.files?.[0] || null)
                }
              />
              <p className="mt-1 text-xs text-ink/45">
                Image (compressed to ~{formatBytes(DOC_IMAGE_TARGET_BYTES)}),
                PDF, or Word — up to {formatBytes(MAX_DOC_BYTES)}.
              </p>
              {compressing === "id" ? (
                <p className="mt-1 text-xs text-ink/55">Compressing…</p>
              ) : sizeHint(idPrepared, "ID") ? (
                <p className="mt-1 text-xs text-teal">
                  {sizeHint(idPrepared, "ID")}
                </p>
              ) : null}
            </label>
          </div>

          <div className="space-y-2">
            <FieldLabel required>Package</FieldLabel>
            <p className="text-xs text-ink/50">
              Trial modules follow this package when Aramis approves.
            </p>
            {packages.length === 0 ? (
              <p className="rounded-xl bg-stone/60 px-3 py-2 text-sm text-ink/55">
                Loading packages…
              </p>
            ) : (
              <div className="space-y-2">
                {packages.map((pkg) => {
                  const selected = packageCode === pkg.code;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setPackageCode(pkg.code)}
                      className={cn(
                        "w-full rounded-2xl border px-4 py-3 text-left transition",
                        selected
                          ? "border-teal bg-teal/10 ring-2 ring-teal/25"
                          : "border-ink/10 bg-white hover:border-ink/20",
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-semibold text-ink">{pkg.name}</p>
                        <p className="text-sm font-medium text-teal">
                          {formatMoney(Number(pkg.monthly_price_etb) || 0)}
                          /mo
                        </p>
                      </div>
                      {pkg.description ? (
                        <p className="mt-1 text-xs text-ink/55">
                          {pkg.description}
                        </p>
                      ) : null}
                      <p className="mt-1.5 text-xs text-ink/45">
                        {packageModules(pkg) || "Custom modules"}
                        {" · "}
                        {pkg.max_staff_seats} staff seats
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <label className="block text-sm">
            <FieldLabel>Notes</FieldLabel>
            <textarea
              name="notes"
              className="field min-h-24"
              placeholder="Anything else we should know (optional)"
            />
          </label>

          <button
            type="submit"
            disabled={
              busy ||
              packages.length === 0 ||
              compressing !== null ||
              !logoPrepared
            }
            className="w-full rounded-xl bg-teal py-3.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy
              ? "Submitting…"
              : compressing
                ? "Compressing files…"
                : "Submit interest"}
          </button>
          {error ? (
            <p className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">
              {error}
            </p>
          ) : null}

          <p className="text-center text-sm text-ink/55">
            Already have credentials?{" "}
            <Link href="/login" className="font-semibold text-teal underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
