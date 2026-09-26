"use client";

import { useMemo, useState } from "react";
import { Ban, ClipboardList, ShoppingBag } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { CashierOrderBoard } from "@/components/order/CashierOrderBoard";
import { OwnerCancelBoard } from "@/components/order/OwnerCancelBoard";
import { OrderPOS } from "@/components/order/OrderPOS";
import {
  SegmentedTabs,
  type SegmentedTabItem,
} from "@/components/ui/SegmentedTabs";
import { isOwner } from "@/lib/permissions";

type OrderTab = "pos" | "queue" | "cancel";

export default function OrderPage() {
  return (
    <RequireAuth title="Order" module="ordering" feature="order">
      <OrderWorkspace />
    </RequireAuth>
  );
}

function OrderWorkspace() {
  const { tenant } = useAuth();
  const owner = tenant ? isOwner(tenant.membership) : false;
  const [tab, setTab] = useState<OrderTab>("pos");

  const tabs = useMemo(() => {
    const list: SegmentedTabItem<OrderTab>[] = [
      { id: "pos", label: "Place order", icon: ShoppingBag },
      { id: "queue", label: "Placed orders", icon: ClipboardList },
    ];
    if (owner) {
      list.push({ id: "cancel", label: "Cancel orders", icon: Ban });
    }
    return list;
  }, [owner]);

  return (
    <div className="space-y-4">
      <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "pos" ? (
        <OrderPOS onPlaced={() => setTab("queue")} />
      ) : null}
      {tab === "queue" ? <CashierOrderBoard /> : null}
      {tab === "cancel" && owner ? <OwnerCancelBoard /> : null}
    </div>
  );
}
