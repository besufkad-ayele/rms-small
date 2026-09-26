"use client";

import { computeBill } from "@/lib/money";
import type { ReceiptProfile, ReceiptWidthMm } from "@/lib/org-tax";
import { formatMoney } from "@/lib/utils";

const SAMPLE_LINES = [
  { name: "Macchiato", quantity: 2, unit_price: 80, line_total: 160 },
  { name: "Club sandwich", quantity: 1, unit_price: 220, line_total: 220 },
];

export function ReceiptPaperPreview({
  profile,
  vatPercent,
  servicePercent,
  sample = true,
  order,
}: {
  profile: ReceiptProfile;
  vatPercent: number;
  servicePercent: number;
  sample?: boolean;
  order?: {
    receipt_number: string;
    created_at: string;
    cashier_name: string;
    payment_method: string;
    payment_reference?: string | null;
    place_label?: string | null;
    lines: {
      name: string;
      quantity: number;
      unit_price?: number;
      line_total: number;
    }[];
    subtotal: number;
    service_charge: number;
    vat: number;
    total: number;
    vat_percent?: number | null;
    service_percent?: number | null;
  };
}) {
  const width = profile.widthMm === 58 ? "58mm" : "80mm";
  const lines = order?.lines?.length ? order.lines : SAMPLE_LINES;
  const subtotal =
    order?.subtotal ??
    lines.reduce((s, l) => s + Number(l.line_total), 0);
  const bill =
    order != null
      ? {
          serviceCharge: Number(order.service_charge),
          vat: Number(order.vat),
          total: Number(order.total),
          servicePercent: Number(order.service_percent ?? servicePercent),
          vatPercent: Number(order.vat_percent ?? vatPercent),
        }
      : computeBill(subtotal, {
          servicePercent,
          vatPercent,
        });

  const receiptNo = order?.receipt_number ?? "AR-PREVIEW-0001";
  const when = order?.created_at
    ? new Date(order.created_at).toLocaleString("en-ET")
    : new Date().toLocaleString("en-ET");
  const cashier = order?.cashier_name ?? "Cashier";
  const tender = (order?.payment_method ?? "cash").toUpperCase();

  return (
    <div
      className="thermal-receipt mx-auto max-w-full rounded-sm border border-ink/15 bg-white p-3 text-black shadow-sm sm:p-4"
      style={{ width }}
    >
      {sample ? (
        <p className="mb-2 text-center text-[9px] font-medium uppercase tracking-wide text-neutral-400">
          Live preview · {profile.widthMm}mm
        </p>
      ) : null}
      <div className="space-y-1 border-b border-dashed border-neutral-400 pb-3 text-center">
        <p className="text-base font-bold leading-tight">
          {profile.businessName || "Business name"}
        </p>
        {profile.address ? (
          <p className="text-[11px] leading-snug">{profile.address}</p>
        ) : null}
        {profile.phone ? (
          <p className="text-[11px]">{profile.phone}</p>
        ) : null}
        {profile.headerNote ? (
          <p className="text-[10px] text-neutral-600">{profile.headerNote}</p>
        ) : null}
        <p className="pt-1 text-[10px] font-bold uppercase tracking-wider">
          {profile.title || "Sales receipt"}
        </p>
      </div>

      <div className="space-y-0.5 border-b border-dashed border-neutral-400 py-2 text-[11px]">
        <PreviewRow label="Receipt" value={receiptNo} mono />
        <PreviewRow label="Date" value={when} />
        <PreviewRow label="Cashier" value={cashier} />
        {order?.place_label ? (
          <PreviewRow label="Place" value={order.place_label} />
        ) : null}
        <PreviewRow label="Tender" value={tender} />
        {order?.payment_reference ? (
          <PreviewRow label="Ref" value={order.payment_reference} mono />
        ) : null}
      </div>

      <table className="my-2 w-full text-[11px]">
        <thead>
          <tr className="border-b border-neutral-300">
            <th className="py-1 text-left font-semibold">Item</th>
            <th className="text-right font-semibold">Qty</th>
            <th className="text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((item, index) => (
            <tr key={`${item.name}-${index}`}>
              <td className="py-0.5 pr-1">{item.name}</td>
              <td className="text-right">{item.quantity}</td>
              <td className="text-right">
                {formatMoney(Number(item.line_total))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-0.5 border-t border-dashed border-neutral-400 pt-2 text-[11px]">
        <PreviewRow label="Subtotal" value={formatMoney(subtotal)} />
        {profile.showService ? (
          <PreviewRow
            label={`${profile.serviceLabel} ${bill.servicePercent}%`}
            value={formatMoney(bill.serviceCharge)}
          />
        ) : null}
        {profile.showVat ? (
          <PreviewRow
            label={`${profile.vatLabel} ${bill.vatPercent}%`}
            value={formatMoney(bill.vat)}
          />
        ) : null}
        <div className="flex justify-between pt-1 text-sm font-bold">
          <span>TOTAL</span>
          <span>{formatMoney(bill.total)}</span>
        </div>
      </div>

      {profile.extraLines ? (
        <p className="mt-2 whitespace-pre-wrap text-center text-[10px] text-neutral-700">
          {profile.extraLines}
        </p>
      ) : null}

      {profile.footer ? (
        <p className="mt-3 whitespace-pre-wrap text-center text-[10px] text-neutral-600">
          {profile.footer}
        </p>
      ) : null}
    </div>
  );
}

function PreviewRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className={mono ? "font-mono font-bold" : undefined}>{value}</span>
    </div>
  );
}

export const RECEIPT_WIDTH_OPTIONS: {
  id: ReceiptWidthMm;
  label: string;
}[] = [
  { id: 58, label: "58mm (narrow)" },
  { id: 80, label: "80mm (standard)" },
];
