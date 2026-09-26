"use client";

import { useMemo, useState } from "react";
import { LayoutDashboard, PackageMinus, PackagePlus } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { InventoryIssue } from "@/components/inventory/InventoryIssue";
import { InventoryManager } from "@/components/inventory/InventoryManager";
import { InventoryReceive } from "@/components/inventory/InventoryReceive";
import {
  SegmentedTabs,
  type SegmentedTabItem,
} from "@/components/ui/SegmentedTabs";

type InvTab = "dashboard" | "receive" | "issue";

export default function InventoryPage() {
  return (
    <RequireAuth title="Inventory" module="inventory">
      <InventoryWorkspace />
    </RequireAuth>
  );
}

function InventoryWorkspace() {
  const { hasFeature } = useAuth();
  const canCatalog = hasFeature("inventory");
  const canIssue = hasFeature("inventory_issue");
  const [tab, setTab] = useState<InvTab>(canCatalog ? "dashboard" : "issue");

  const tabs = useMemo(() => {
    const list: SegmentedTabItem<InvTab>[] = [];
    if (canCatalog) {
      list.push(
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { id: "receive", label: "Receive & suppliers", icon: PackagePlus },
      );
    }
    if (canIssue) {
      list.push({
        id: "issue",
        label: "Issue / take-out",
        icon: PackageMinus,
      });
    }
    return list;
  }, [canCatalog, canIssue]);

  if (!canCatalog && !canIssue) {
    return (
      <p className="rounded-2xl border border-ink/10 bg-white/80 p-6 text-sm text-ink/60">
        You do not have inventory access. Ask the owner to grant receive or
        issue permissions.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "dashboard" && canCatalog ? <InventoryManager /> : null}
      {tab === "receive" && canCatalog ? <InventoryReceive /> : null}
      {tab === "issue" && canIssue ? <InventoryIssue /> : null}
    </div>
  );
}
