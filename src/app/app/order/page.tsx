"use client";

import { useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { CashierOrderBoard } from "@/components/order/CashierOrderBoard";
import { OwnerCancelBoard } from "@/components/order/OwnerCancelBoard";
import { OrderPOS } from "@/components/order/OrderPOS";
import { isOwner } from "@/lib/permissions";
import { cn } from "@/lib/utils";

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
  const [tab, setTab] = useState<"pos" | "queue" | "cancel">("pos");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <TabBtn
          active={tab === "pos"}
          onClick={() => setTab("pos")}
          label="Place order"
        />
        <TabBtn
          active={tab === "queue"}
          onClick={() => setTab("queue")}
          label="Placed orders"
        />
        {owner ? (
          <TabBtn
            active={tab === "cancel"}
            onClick={() => setTab("cancel")}
            label="Cancel orders"
            tone="coral"
          />
        ) : null}
      </div>
      {tab === "pos" ? (
        <OrderPOS onPlaced={() => setTab("queue")} />
      ) : null}
      {tab === "queue" ? <CashierOrderBoard /> : null}
      {tab === "cancel" && owner ? <OwnerCancelBoard /> : null}
    </div>
  );
}

function TabBtn({
  active,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: "coral";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium",
        active && tone === "coral" && "bg-coral text-white",
        active && !tone && "bg-teal text-white",
        !active && tone === "coral" && "bg-coral/10 text-coral",
        !active && !tone && "bg-ink/5 text-ink/70",
      )}
    >
      {label}
    </button>
  );
}
