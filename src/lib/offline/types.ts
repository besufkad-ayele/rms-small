import type { CloudInventoryItem, CloudMenuItem } from "@/lib/cloud-catalog";
import type { CloudSaleOrder, SalePaymentMethodId } from "@/lib/cloud-sales";

export type ConnectionStatus = "live" | "slow" | "down";

export type SyncActionType =
  | "COMPLETE_SALE"
  | "UPSERT_INVENTORY"
  | "DELETE_INVENTORY"
  | "UPSERT_MENU"
  | "DELETE_MENU"
  | "SAVE_DAY_CLOSE"
  | "SAVE_X_REPORT"
  | "CREATE_PAID_BILL"
  | "DELETE_PAID_BILL";

export type SyncQueueStatus = "pending" | "syncing" | "failed";

export interface SyncQueueItem {
  id: string;
  orgId: string;
  actionType: SyncActionType;
  payload: unknown;
  createdAt: string;
  retryCount: number;
  status: SyncQueueStatus;
  errorMessage?: string;
}

export interface CloudCacheRow {
  key: string;
  orgId: string;
  updatedAt: string;
  data: unknown;
}

export interface ConnectionSnapshot {
  status: ConnectionStatus;
  latencyMs: number | null;
  checkedAt: string;
  /** True when live and latency is under the fast threshold. */
  fastEnough: boolean;
}

export interface SaleLineInput {
  menuItem: CloudMenuItem;
  quantity: number;
}

export interface CompleteSalePayload {
  orgId: string;
  lines: SaleLineInput[];
  paymentMethod: SalePaymentMethodId;
  paymentReference?: string;
  paymentProofUrl?: string | null;
  cashierName: string;
  placeLabel?: string;
  kitchenNote?: string;
  /** Accept payment at Mark as paid (place stays unpaid). */
  markPaid?: boolean;
  /** Populated when the sale was recorded locally first. */
  localOrder?: CloudSaleOrder;
}

export interface SyncResult {
  totalProcessed: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

export type CatalogBundle = {
  menu: CloudMenuItem[];
  inventory: CloudInventoryItem[];
};
