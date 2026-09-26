import Dexie, { type EntityTable } from "dexie";
import type {
  AppMeta,
  AuthSession,
  BusinessProfile,
  DayCloseRecord,
  InventoryItem,
  MenuItem,
  SaleOrder,
  UserAccount,
} from "./types";
import type { CloudCacheRow, SyncQueueItem } from "./offline/types";

export class RmsSmallDB extends Dexie {
  business!: EntityTable<BusinessProfile, "id">;
  users!: EntityTable<UserAccount, "id">;
  session!: EntityTable<AuthSession, "id">;
  inventory!: EntityTable<InventoryItem, "id">;
  menu!: EntityTable<MenuItem, "id">;
  orders!: EntityTable<SaleOrder, "id">;
  dayCloses!: EntityTable<DayCloseRecord, "id">;
  meta!: EntityTable<AppMeta, "id">;
  syncQueue!: EntityTable<SyncQueueItem, "id">;
  cloudCache!: EntityTable<CloudCacheRow, "key">;

  constructor() {
    super("rms_small_pos");
    this.version(1).stores({
      business: "id",
      users: "id, username",
      session: "id",
      inventory: "id, name, updatedAt",
      menu: "id, category, name, voteCount",
      orders: "id, dayKey, createdAt, receiptNumber",
      dayCloses: "id, dayKey, closedAt, synced",
      meta: "id",
    });
    this.version(2).stores({
      business: "id",
      users: "id, username",
      session: "id",
      inventory: "id, name, updatedAt",
      menu: "id, category, name, voteCount",
      orders: "id, dayKey, createdAt, receiptNumber",
      dayCloses: "id, dayKey, closedAt, synced",
      meta: "id",
      syncQueue: "id, orgId, createdAt, status, actionType",
      cloudCache: "key, orgId, updatedAt",
    });
  }
}

export const db = new RmsSmallDB();

export async function getMeta(): Promise<AppMeta> {
  const existing = await db.meta.get("meta");
  if (existing) return existing;
  const fresh: AppMeta = { id: "meta", receiptSeq: 0, seeded: false };
  await db.meta.put(fresh);
  return fresh;
}

export async function nextReceiptNumber(): Promise<string> {
  return db.transaction("rw", db.meta, async () => {
    const meta = await getMeta();
    const next = meta.receiptSeq + 1;
    await db.meta.put({ ...meta, receiptSeq: next });
    const day = new Date();
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, "0");
    const d = String(day.getDate()).padStart(2, "0");
    return `CS-${y}${m}${d}-${String(next).padStart(4, "0")}`;
  });
}
