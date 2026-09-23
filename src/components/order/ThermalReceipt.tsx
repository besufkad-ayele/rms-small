"use client";

import { Printer } from "lucide-react";
import type { CloudSaleOrder } from "@/lib/cloud-sales";
import { formatMoney } from "@/lib/utils";

export function ThermalReceipt({
  order,
  businessName,
  phone,
  address,
  onDone,
}: {
  order: CloudSaleOrder;
  businessName: string;
  phone?: string | null;
  address?: string | null;
  onDone: () => void;
}) {
  const lines = order.lines || [];

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="thermal-receipt mx-auto w-[80mm] max-w-full rounded-sm border border-ink/15 bg-white p-4 text-black shadow-sm">
        <div className="space-y-1 border-b border-dashed border-neutral-400 pb-3 text-center">
          <p className="text-base font-bold leading-tight">{businessName}</p>
          {address ? <p className="text-[11px] leading-snug">{address}</p> : null}
          {phone ? <p className="text-[11px]">{phone}</p> : null}
          <p className="pt-1 text-[10px] font-bold uppercase tracking-wider">
            Aramis sales receipt
          </p>
        </div>

        <div className="space-y-0.5 border-b border-dashed border-neutral-400 py-2 text-[11px]">
          <Row label="Receipt" value={order.receipt_number} mono />
          <Row
            label="Date"
            value={new Date(order.created_at).toLocaleString("en-ET")}
          />
          <Row label="Cashier" value={order.cashier_name} />
          <Row label="Tender" value={order.payment_method.toUpperCase()} />
          {order.payment_reference ? (
            <Row label="Ref" value={order.payment_reference} mono />
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
                <td className="text-right">{formatMoney(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="space-y-0.5 border-t border-dashed border-neutral-400 pt-2 text-[11px]">
          <Row label="Subtotal" value={formatMoney(Number(order.subtotal))} />
          <Row label="Service 10%" value={formatMoney(Number(order.service_charge))} />
          <Row label="VAT 15%" value={formatMoney(Number(order.vat))} />
          <div className="flex justify-between pt-1 text-sm font-bold">
            <span>TOTAL</span>
            <span>{formatMoney(Number(order.total))}</span>
          </div>
        </div>
        <p className="mt-3 text-center text-[10px] text-neutral-600">
          Thank you — powered by Aramis
        </p>
      </div>

      <div className="no-print flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal px-4 py-3 text-sm font-semibold text-white"
        >
          <Printer className="h-4 w-4" />
          Print again
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-xl border border-ink/15 bg-white px-4 py-3 text-sm font-semibold"
        >
          Next order
        </button>
      </div>
    </div>
  );
}

function Row({
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
