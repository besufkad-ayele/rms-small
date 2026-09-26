"use client";

import { useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { InventoryIssue } from "@/components/inventory/InventoryIssue";
import { InventoryManager } from "@/components/inventory/InventoryManager";
import { InventoryReceive } from "@/components/inventory/InventoryReceive";
import { cn } from "@/lib/utils";

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
  const [tab, setTab] = useState<"dashboard" | "receive" | "issue">(
    canCatalog ? "dashboard" : "issue",
  );

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
      <div className="flex flex-wrap gap-2">
        {canCatalog ? (
          <>
            <TabBtn
              active={tab === "dashboard"}
              onClick={() => setTab("dashboard")}
              label="Dashboard"
            />
            <TabBtn
              active={tab === "receive"}
              onClick={() => setTab("receive")}
              label="Receive & suppliers"
            />
          </>
        ) : null}
        {canIssue ? (
          <TabBtn
            active={tab === "issue"}
            onClick={() => setTab("issue")}
            label="Issue / take-out"
          />
        ) : null}
      </div>
      {tab === "dashboard" && canCatalog ? <InventoryManager /> : null}
      {tab === "receive" && canCatalog ? <InventoryReceive /> : null}
      {tab === "issue" && canIssue ? <InventoryIssue /> : null}
    </div>
  );
}

function TabBtn({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium",
        active ? "bg-teal text-white" : "bg-ink/5 text-ink/70",
      )}
    >
      {label}
    </button>
  );
}
