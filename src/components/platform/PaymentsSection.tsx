"use client";

import type { Dispatch, SetStateAction } from "react";
import type { PaymentProofRow } from "@/app/platform/actions";
import { packageModuleFlags, type PackageRow } from "@/lib/pricing";
import { formatDateTime, formatMoney } from "@/lib/utils";
import {
  flagsFromProof,
  isVideoProof,
  ModuleCheckboxes,
  moduleLabels,
  StatusPill,
  type ModuleState,
} from "./platform-ui";

export function PaymentsSection({
  proofs,
  packages,
  proofMods,
  setProofMods,
  proofMonths,
  setProofMonths,
  proofPkg,
  setProofPkg,
  busy,
  onApprove,
  onReject,
  onOpenOrg,
}: {
  proofs: PaymentProofRow[];
  packages: PackageRow[];
  proofMods: Record<string, ModuleState>;
  setProofMods: Dispatch<SetStateAction<Record<string, ModuleState>>>;
  proofMonths: Record<string, number>;
  setProofMonths: Dispatch<SetStateAction<Record<string, number>>>;
  proofPkg: Record<string, string>;
  setProofPkg: Dispatch<SetStateAction<Record<string, string>>>;
  busy: boolean;
  onApprove: (p: PaymentProofRow) => void;
  onReject: (p: PaymentProofRow) => void;
  onOpenOrg: (id: string) => void;
}) {
  return (
    <div className="grid gap-3">
      {proofs.map((proof) => {
        const mods = proofMods[proof.id] ?? flagsFromProof(proof);
        const months =
          proofMonths[proof.id] ?? Number(proof.months_requested || 1);
        const video = isVideoProof(proof);
        const expected =
          proof.expected_amount_etb != null
            ? Number(proof.expected_amount_etb)
            : null;
        const submitted = Number(proof.amount);
        const mismatch =
          expected != null && Math.abs(expected - submitted) > 0.5;

        return (
          <article
            key={proof.id}
            className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:justify-between">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onOpenOrg(proof.organization_id)}
                  className="font-display text-xl hover:text-teal"
                >
                  {proof.organizations?.name || "Organization"}
                </button>
                <p className="text-sm text-ink/60">
                  Submitted {formatMoney(submitted)}
                  {expected != null ? (
                    <>
                      {" "}
                      · expected {formatMoney(expected)}
                      {mismatch ? (
                        <span className="ml-1 text-coral">(mismatch)</span>
                      ) : null}
                    </>
                  ) : null}{" "}
                  · {months} mo · {String(proof.method)}
                  {proof.package_code
                    ? ` · pkg ${String(proof.package_code)}`
                    : ""}
                  {proof.reference ? ` · ref ${String(proof.reference)}` : ""}
                </p>
                <p className="mt-1 text-xs text-ink/45">
                  {formatDateTime(String(proof.created_at))} ·{" "}
                  <StatusPill status={String(proof.status)} />
                </p>
                {proof.amount_breakdown &&
                typeof proof.amount_breakdown === "object" ? (
                  <p className="mt-1 text-xs text-ink/50">
                    {(
                      proof.amount_breakdown as {
                        line_items?: Array<{
                          label: string;
                          monthly_etb: number;
                        }>;
                      }
                    ).line_items
                      ?.map(
                        (l) => `${l.label} ${formatMoney(l.monthly_etb)}/mo`,
                      )
                      .join(" · ") || null}
                  </p>
                ) : null}

                {proof.image_url ? (
                  <div className="mt-3 overflow-hidden rounded-2xl border border-ink/8 bg-stone/40">
                    {video ? (
                      <video
                        src={String(proof.image_url)}
                        controls
                        className="max-h-64 w-full bg-ink/90 object-contain"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={String(proof.image_url)}
                        alt="Payment proof"
                        className="max-h-64 w-full object-contain"
                      />
                    )}
                    <a
                      href={String(proof.image_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="block px-3 py-2 text-xs text-teal underline"
                    >
                      Open full {video ? "video" : "image"}
                    </a>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-ink/45">No media attached</p>
                )}
              </div>

              {proof.status === "pending" ? (
                <div className="w-full shrink-0 space-y-3 rounded-2xl bg-stone/50 p-3 lg:w-72">
                  <label className="block text-sm">
                    <span className="mb-1 block text-ink/60">
                      Months to grant
                    </span>
                    <select
                      className="field"
                      value={months}
                      onChange={(e) =>
                        setProofMonths((prev) => ({
                          ...prev,
                          [proof.id]: Number(e.target.value),
                        }))
                      }
                    >
                      {[1, 3, 6, 12].map((n) => (
                        <option key={n} value={n}>
                          {n} month{n > 1 ? "s" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-ink/60">Package</span>
                    <select
                      className="field"
                      value={proofPkg[proof.id] || ""}
                      onChange={(e) => {
                        const code = e.target.value;
                        setProofPkg((prev) => ({ ...prev, [proof.id]: code }));
                        const pkg = packages.find((p) => p.code === code);
                        if (pkg) {
                          setProofMods((prev) => ({
                            ...prev,
                            [proof.id]: packageModuleFlags(pkg),
                          }));
                        }
                      }}
                    >
                      <option value="">Custom modules</option>
                      {packages
                        .filter((p) => p.active)
                        .map((p) => (
                          <option key={p.id} value={p.code}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div>
                    <p className="mb-2 text-xs font-medium text-ink/60">
                      Modules to enable
                    </p>
                    <ModuleCheckboxes
                      value={mods}
                      onChange={(next) =>
                        setProofMods((prev) => ({
                          ...prev,
                          [proof.id]: next,
                        }))
                      }
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onApprove(proof)}
                      className="rounded-xl bg-teal px-3 py-2 text-xs font-semibold text-white"
                    >
                      Verify & extend
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onReject(proof)}
                      className="rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-xs font-semibold text-coral"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-ink/60 lg:w-56">
                  <p className="font-medium capitalize">{proof.status}</p>
                  <p className="mt-1 text-xs">
                    {moduleLabels(flagsFromProof(proof)) ||
                      "Modules unchanged"}
                  </p>
                </div>
              )}
            </div>
            {proof.notes ? (
              <p className="mt-2 text-xs text-ink/55">{String(proof.notes)}</p>
            ) : null}
          </article>
        );
      })}
      {proofs.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-ink/15 py-12 text-center text-sm text-ink/50">
          No payment requests yet
        </p>
      ) : null}
    </div>
  );
}
