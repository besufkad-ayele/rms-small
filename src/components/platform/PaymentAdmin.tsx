"use client";

import { useState } from "react";
import type { PaymentProofRow } from "@/app/platform/actions";
import {
  createPaymentAction,
  deletePaymentAction,
  reopenPaymentAction,
  updatePaymentAction,
} from "@/app/platform/manage-actions";
import type { PackageRow } from "@/lib/pricing";
import { PAYMENT_METHOD_OPTIONS, type PaymentMethod } from "@/lib/tenant";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { StatusPill } from "./platform-ui";
import { ActionButton, AsyncForm, SubmitButton, throwIfError } from "./feedback";

type Common = {
  busy?: boolean;
  setBusy?: (v: boolean) => void;
  setError?: (v: string | null) => void;
  flashOk: (msg: string) => Promise<void>;
  onChanged: () => Promise<void>;
};

const MONTH_OPTIONS = [1, 2, 3, 6, 12];

/** Edit / reopen / delete controls for one payment proof. */
export function PaymentAdminActions({
  proof,
  flashOk,
  onChanged,
}: Common & { proof: PaymentProofRow }) {
  const [editing, setEditing] = useState(false);

  async function remove() {
    const approvedNote =
      proof.status === "approved"
        ? "\n\nThis payment is approved — deleting it does NOT shorten their access. Change the access end date separately if needed."
        : "";
    if (!window.confirm(`Delete this ${formatMoney(Number(proof.amount))} payment permanently?${approvedNote}`)) return;
    const deleteFile = proof.image_url
      ? window.confirm("Also delete the uploaded proof photo/video? OK = delete file, Cancel = keep file.")
      : false;
    const res = await deletePaymentAction({ proofId: proof.id, deleteFile });
    throwIfError(res, "Delete failed");
    await flashOk("Payment deleted");
    await onChanged();
  }

  async function reopen() {
    const res = await reopenPaymentAction(proof.id);
    throwIfError(res, "Reopen failed");
    await flashOk("Payment moved back to pending");
    await onChanged();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="rounded-lg border border-ink/15 px-2.5 py-1 text-xs font-medium"
        >
          {editing ? "Close edit" : "Edit"}
        </button>
        {proof.status === "rejected" ? (
          <ActionButton
            pendingLabel="Reopening…"
            onAction={reopen}
            className="rounded-lg border border-ink/15 px-2.5 py-1 text-xs font-medium"
          >
            Reopen
          </ActionButton>
        ) : null}
        <ActionButton
          pendingLabel="Deleting…"
          onAction={remove}
          className="rounded-lg border border-coral/30 px-2.5 py-1 text-xs font-medium text-coral"
        >
          Delete
        </ActionButton>
      </div>
      {editing ? (
        <AsyncForm
          className="grid gap-2 rounded-2xl bg-stone/50 p-3 sm:grid-cols-2"
          onSubmitAsync={async (fd) => {
            const res = await updatePaymentAction({
              proofId: proof.id,
              amount: Number(fd.get("amount") || 0),
              months: Number(fd.get("months") || 1),
              method: String(fd.get("method")) as PaymentMethod,
              reference: String(fd.get("reference") || ""),
              notes: String(fd.get("notes") || ""),
            });
            throwIfError(res, "Save failed");
            setEditing(false);
            await flashOk("Payment updated");
            await onChanged();
          }}
        >
          <PaymentFields
            amount={Number(proof.amount)}
            months={Number(proof.months_requested || 1)}
            method={String(proof.method)}
            reference={String(proof.reference || "")}
            notes={String(proof.notes || "")}
          />
          {proof.status === "approved" ? (
            <p className="text-[11px] text-ink/50 sm:col-span-2">
              Editing an approved payment only fixes the record — access dates stay the same.
            </p>
          ) : null}
          <SubmitButton
            pendingLabel="Saving…"
            className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-stone sm:col-span-2"
          >
            Save payment
          </SubmitButton>
        </AsyncForm>
      ) : null}
    </div>
  );
}

function PaymentFields({
  amount,
  months,
  method,
  reference,
  notes,
}: {
  amount?: number;
  months?: number;
  method?: string;
  reference?: string;
  notes?: string;
}) {
  return (
    <>
      <label className="text-xs text-ink/55">
        Amount (ETB)
        <input
          name="amount"
          type="number"
          min={0}
          step="0.01"
          required
          className="field mt-1"
          defaultValue={amount ?? ""}
        />
      </label>
      <label className="text-xs text-ink/55">
        Months
        <select name="months" className="field mt-1" defaultValue={String(months ?? 1)}>
          {MONTH_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} month{n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-ink/55">
        Method
        <select name="method" className="field mt-1" defaultValue={method || "telebirr"}>
          {PAYMENT_METHOD_OPTIONS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-ink/55">
        Reference
        <input name="reference" className="field mt-1" defaultValue={reference ?? ""} />
      </label>
      <label className="text-xs text-ink/55 sm:col-span-2">
        Notes
        <input name="notes" className="field mt-1" defaultValue={notes ?? ""} />
      </label>
    </>
  );
}

/** Restaurant detail: full payment history with create / edit / delete. */
export function PaymentRecords({
  organizationId,
  proofs,
  packages,
  ...common
}: Common & {
  organizationId: string;
  proofs: PaymentProofRow[];
  packages: PackageRow[];
}) {
  const [adding, setAdding] = useState(false);
  const { flashOk, onChanged } = common;

  return (
    <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg">Payments</h3>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-xl bg-teal px-3 py-2 text-xs font-semibold text-white"
        >
          {adding ? "Close" : "Record payment"}
        </button>
      </div>

      {adding ? (
        <AsyncForm
          className="mt-3 grid gap-2 rounded-2xl border border-teal/30 bg-teal/5 p-3 sm:grid-cols-2"
          onSubmitAsync={async (fd) => {
            const res = await createPaymentAction({
              organizationId,
              amount: Number(fd.get("amount") || 0),
              months: Number(fd.get("months") || 1),
              method: String(fd.get("method")) as PaymentMethod,
              reference: String(fd.get("reference") || ""),
              notes: String(fd.get("notes") || ""),
              packageCode: String(fd.get("package") || "") || null,
              approveNow: fd.get("approveNow") === "on",
            });
            throwIfError(res, "Could not record payment");
            setAdding(false);
            await flashOk(
              "periodEnd" in res && res.periodEnd
                ? `Payment recorded · access until ${formatDateTime(res.periodEnd)}`
                : "Payment recorded as pending",
            );
            await onChanged();
          }}
        >
          <PaymentFields />
          <label className="text-xs text-ink/55">
            Package (optional)
            <select name="package" className="field mt-1" defaultValue="">
              <option value="">Keep current modules</option>
              {packages
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-xs">
            <input type="checkbox" name="approveNow" defaultChecked />
            Approve now and extend access
          </label>
          <SubmitButton
            pendingLabel="Saving…"
            className="rounded-xl bg-teal px-3 py-2 text-xs font-semibold text-white sm:col-span-2"
          >
            Save payment
          </SubmitButton>
        </AsyncForm>
      ) : null}

      <ul className="mt-3 space-y-2">
        {proofs.map((p) => (
          <li key={p.id} className="rounded-2xl bg-stone/40 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>{formatMoney(Number(p.amount))}</strong>
                {p.expected_amount_etb != null &&
                Math.abs(Number(p.expected_amount_etb) - Number(p.amount)) > 0.5
                  ? ` (expected ${formatMoney(Number(p.expected_amount_etb))})`
                  : ""}{" "}
                · {String(p.months_requested || 1)} mo · {String(p.method)}
                {p.package_code ? ` · ${String(p.package_code)}` : ""}
                {p.reference ? ` · ref ${String(p.reference)}` : ""}
                <span className="block text-xs text-ink/45">
                  {p.created_at ? formatDateTime(String(p.created_at)) : "—"}
                  {p.notes ? ` · ${String(p.notes)}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {p.image_url ? (
                  <a
                    href={String(p.image_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-teal underline"
                  >
                    Proof
                  </a>
                ) : null}
                <StatusPill status={String(p.status)} />
              </span>
            </div>
            <div className="mt-2">
              <PaymentAdminActions proof={p} {...common} />
            </div>
          </li>
        ))}
        {proofs.length === 0 ? (
          <li className="py-4 text-center text-sm text-ink/45">No payments for this restaurant</li>
        ) : null}
      </ul>
    </section>
  );
}
