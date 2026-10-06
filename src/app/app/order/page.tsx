"use client";

import { useMemo, useState } from "react";
import { Ban, ClipboardList, ShoppingBag } from "lucide-react";
import { RequireAccess } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { CashierOrderBoard } from "@/components/order/CashierOrderBoard";
import { OwnerCancelBoard } from "@/components/order/OwnerCancelBoard";
import { OrderPOS } from "@/components/order/OrderPOS";
import {
  SegmentedTabs,
  type SegmentedTabItem,
} from "@/components/ui/SegmentedTabs";
import { type CloudSaleOrder } from "@/lib/cloud-sales";
import { canCashierOrderOps, isOwner } from "@/lib/permissions";

type OrderTab = "pos" | "queue" | "cancel";

export default function OrderPage() {
  return (
    <RequireAccess module="ordering" feature="order">
      <OrderWorkspace />
    </RequireAccess>
  );
}

function OrderWorkspace() {
  const { tenant } = useAuth();
  const owner = tenant ? isOwner(tenant.membership) : false;
  const cashierOps = tenant ? canCashierOrderOps(tenant.membership) : false;
  const [tab, setTab] = useState<OrderTab>("pos");
  const [appendTo, setAppendTo] = useState<CloudSaleOrder | null>(null);

  const tabs = useMemo(() => {
    const list: SegmentedTabItem<OrderTab>[] = [
      { id: "pos", label: "Place order", icon: ShoppingBag },
      {
        id: "queue",
        label: cashierOps ? "Placed orders" : "My orders",
        icon: ClipboardList,
      },
    ];
    if (owner) {
      list.push({ id: "cancel", label: "Cancel orders", icon: Ban });
    }
    return list;
  }, [owner, cashierOps]);

  function addOnto(order: CloudSaleOrder) {
    setAppendTo(order);
    setTab("pos");
  }

  return (
    <div className="space-y-4">
      <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "pos" ? (
        <OrderPOS
          appendTo={appendTo}
          onClearAppend={() => setAppendTo(null)}
          onPlaced={() => {
            setAppendTo(null);
            setTab("queue");
          }}
        />
      ) : null}
      {tab === "queue" ? <CashierOrderBoard onAddItems={addOnto} /> : null}
      {tab === "cancel" && owner ? <OwnerCancelBoard /> : null}
    </div>
  );
}
