/** Ethiopian café bill: configurable service + VAT (defaults 10% / 15%). */

export interface BillRates {
  /** Service charge as percent, e.g. 10 for 10% */
  servicePercent: number;
  /** VAT as percent, e.g. 15 for 15%, 0 for none */
  vatPercent: number;
}

export const DEFAULT_BILL_RATES: BillRates = {
  servicePercent: 10,
  vatPercent: 15,
};

export interface BillBreakdown {
  subtotal: number;
  serviceCharge: number;
  vat: number;
  total: number;
  servicePercent: number;
  vatPercent: number;
}

export function computeBill(
  subtotal: number,
  rates: BillRates = DEFAULT_BILL_RATES,
): BillBreakdown {
  const food = Math.max(0, Number(subtotal) || 0);
  const servicePct = Math.min(100, Math.max(0, Number(rates.servicePercent) || 0));
  const vatPct = Math.min(100, Math.max(0, Number(rates.vatPercent) || 0));
  const serviceCharge = Math.round(food * (servicePct / 100) * 100) / 100;
  const vat =
    Math.round((food + serviceCharge) * (vatPct / 100) * 100) / 100;
  return {
    subtotal: food,
    serviceCharge,
    vat,
    total: Math.round((food + serviceCharge + vat) * 100) / 100,
    servicePercent: servicePct,
    vatPercent: vatPct,
  };
}
