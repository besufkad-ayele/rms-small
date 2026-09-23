"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { OrderPOS } from "@/components/order/OrderPOS";

export default function OrderPage() {
  return (
    <RequireAuth title="Order" module="inventory">
      <OrderPOS />
    </RequireAuth>
  );
}
