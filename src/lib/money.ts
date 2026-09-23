/** Ethiopian café bill: 10% service, then 15% VAT on food + service. */
export const SERVICE_CHARGE_RATE = 0.1;
export const VAT_RATE = 0.15;

export interface BillBreakdown {
  subtotal: number;
  serviceCharge: number;
  vat: number;
  total: number;
}

export function computeBill(subtotal: number): BillBreakdown {
  const food = Math.max(0, Number(subtotal) || 0);
  const serviceCharge = Math.round(food * SERVICE_CHARGE_RATE * 100) / 100;
  const vat = Math.round((food + serviceCharge) * VAT_RATE * 100) / 100;
  return {
    subtotal: food,
    serviceCharge,
    vat,
    total: Math.round((food + serviceCharge + vat) * 100) / 100,
  };
}
