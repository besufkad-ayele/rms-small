"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import type { CloudSaleOrder } from "@/lib/cloud-sales";
import { ReceiptPaperPreview } from "@/components/finance/ReceiptPaperPreview";
import {
  DEFAULT_RECEIPT_PROFILE,
  getOrgReceiptSettings,
  type ReceiptProfile,
} from "@/lib/org-tax";

export function ThermalReceipt({
  order,
  businessName,
  phone,
  address,
  orgId,
  onDone,
}: {
  order: CloudSaleOrder;
  businessName: string;
  phone?: string | null;
  address?: string | null;
  orgId?: string;
  onDone: () => void;
}) {
  const [profile, setProfile] = useState<ReceiptProfile>({
    ...DEFAULT_RECEIPT_PROFILE,
    businessName,
    phone: phone || "",
    address: address || "",
  });
  const [vatPercent, setVatPercent] = useState(
    Number(order.vat_percent ?? 15),
  );
  const [servicePercent, setServicePercent] = useState(
    Number(order.service_percent ?? 10),
  );

  useEffect(() => {
    if (!orgId) return;
    void getOrgReceiptSettings(orgId)
      .then((s) => {
        setProfile({
          ...s.profile,
          businessName: s.profile.businessName || businessName,
          phone: s.profile.phone || phone || "",
          address: s.profile.address || address || "",
        });
        if (order.vat_percent == null) setVatPercent(s.vat_percent);
        if (order.service_percent == null) setServicePercent(s.service_percent);
      })
      .catch(() => undefined);
  }, [orgId, businessName, phone, address, order.vat_percent, order.service_percent]);

  const lines = order.lines || order.sale_order_lines || [];

  return (
    <div className="mx-auto max-w-md space-y-4">
      <ReceiptPaperPreview
        sample={false}
        profile={profile}
        vatPercent={vatPercent}
        servicePercent={servicePercent}
        order={{
          receipt_number: order.receipt_number,
          created_at: order.created_at,
          cashier_name: order.cashier_name,
          payment_method: order.payment_method,
          payment_reference: order.payment_reference,
          place_label: order.place_label,
          lines,
          subtotal: Number(order.subtotal),
          service_charge: Number(order.service_charge),
          vat: Number(order.vat),
          total: Number(order.total),
          vat_percent: order.vat_percent,
          service_percent: order.service_percent,
        }}
      />

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
