export type PaymentMethod = "cash" | "cbe" | "telebirr" | "other";

export type MenuCategory =
  | "hot-drinks"
  | "soft-drinks"
  | "cold-drinks"
  | "juices"
  | "beer"
  | "wine"
  | "cocktails"
  | "breakfast"
  | "food"
  | "pastry"
  | "desserts"
  | "snacks"
  | "sides"
  | "other";

export interface BusinessProfile {
  id: string;
  name: string;
  phone: string;
  address: string;
  tin: string;
  vatNumber: string;
  currency: "ETB";
  createdAt: string;
  lastSyncedAt: string | null;
}

export interface UserAccount {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
}

export interface AuthSession {
  id: "current";
  userId: string;
  username: string;
  displayName: string;
  loggedInAt: string;
}

export interface PricePoint {
  cost: number;
  recordedAt: string;
  note?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  stockQty: number;
  lowStockThreshold: number;
  /** Current unit cost in ETB */
  costPerUnit: number;
  /** Up to 12 historical cost values for comparison */
  costHistory: PricePoint[];
  updatedAt: string;
  createdAt: string;
}

export interface RecipeLine {
  inventoryItemId: string;
  quantityRequired: number;
}

export interface MenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  available: boolean;
  description: string;
  /** Popularity / order count — increments on each sold unit */
  voteCount: number;
  recipe: RecipeLine[];
  updatedAt: string;
  createdAt: string;
}

export interface OrderLine {
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface SaleOrder {
  id: string;
  receiptNumber: string;
  lines: OrderLine[];
  subtotal: number;
  serviceCharge: number;
  vat: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  cashierName: string;
  note?: string;
  createdAt: string;
  /** Local calendar day key YYYY-MM-DD for reporting */
  dayKey: string;
}

export interface DayCloseRecord {
  id: string;
  dayKey: string;
  expectedSalesTotal: number;
  declaredCashTotal: number;
  variance: number;
  note: string;
  /** Data URLs of payment proof screenshots/photos */
  proofImages: string[];
  closedBy: string;
  closedAt: string;
  synced: boolean;
}

export interface AppMeta {
  id: "meta";
  receiptSeq: number;
  seeded: boolean;
}

export type ReportPeriod =
  | "today"
  | "week"
  | "month"
  | "year"
  | "all";
