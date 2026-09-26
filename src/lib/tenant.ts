export type AppModule =
  | "menu"
  | "ordering"
  | "kitchen"
  | "inventory"
  | "finance"
  | "hr";
export type OrgType = "cafe" | "restaurant" | "other";
export type MemberRole = "owner" | "manager" | "cashier" | "waiter";

export const STAFF_ROLES: Exclude<MemberRole, "owner">[] = [
  "cashier",
  "waiter",
  "manager",
];

export const STAFF_ROLE_LABELS: Record<Exclude<MemberRole, "owner">, string> = {
  cashier: "Cashier",
  waiter: "Waiter",
  manager: "Manager",
};

/** Auth user_metadata key for staff job role (supports waiter before/without DB enum). */
export const APP_STAFF_ROLE_META = "app_staff_role";

export function resolveStaffRole(
  dbRole: string | null | undefined,
  meta?: Record<string, unknown> | null,
): MemberRole {
  const fromMeta = meta?.[APP_STAFF_ROLE_META];
  if (
    fromMeta === "waiter" ||
    fromMeta === "cashier" ||
    fromMeta === "manager" ||
    fromMeta === "owner"
  ) {
    return fromMeta;
  }
  if (
    dbRole === "owner" ||
    dbRole === "manager" ||
    dbRole === "cashier" ||
    dbRole === "waiter"
  ) {
    return dbRole;
  }
  return "cashier";
}

export type SaleOrderStatus =
  | "placed"
  | "preparing"
  | "ready"
  | "completed"
  | "canceled";
export type SubStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";
export type ProofStatus = "pending" | "approved" | "rejected";
export type VerificationStatus = "pending" | "approved" | "rejected";
export type PaymentMethod = "cash" | "cbe" | "telebirr" | "other";
export type UnitKind = "mass" | "volume" | "count" | "custom";
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

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  email?: string | null;
  is_platform_admin?: boolean;
}

export interface Organization {
  id: string;
  name: string;
  org_type: OrgType;
  phone: string | null;
  address: string | null;
  email?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  tin: string | null;
  vat_number: string | null;
  website?: string | null;
  business_license_url?: string | null;
  id_document_url?: string | null;
  verification_status?: VerificationStatus;
  verified_at?: string | null;
  verified_by?: string | null;
  admin_notes?: string | null;
  created_by: string | null;
  created_at: string;
  /** Last password issued by platform reset (not the signup password). */
  platform_login_password?: string | null;
}

export interface Membership {
  id: string;
  organization_id: string;
  user_id: string;
  role: MemberRole;
  can_order?: boolean;
  can_menu?: boolean;
  can_kitchen?: boolean;
  can_inventory?: boolean;
  can_inventory_issue?: boolean;
  can_finance?: boolean;
  can_billing?: boolean;
  can_manage_staff?: boolean;
  active?: boolean;
  invited_by?: string | null;
}

export interface Subscription {
  id: string;
  organization_id: string;
  status: SubStatus;
  inventory_enabled: boolean;
  finance_enabled: boolean;
  menu_enabled?: boolean;
  ordering_enabled?: boolean;
  kitchen_enabled?: boolean;
  hr_enabled?: boolean;
  trial_ends_at: string;
  current_period_end: string | null;
  plan_code: string;
  /** Optional catalog package code (mirrors plan_code when set from Packages). */
  package_code?: string | null;
  notes?: string | null;
  /** Non-owner staff seats included in the package */
  max_staff_seats?: number;
  /** Platform owner reminder to check on this café */
  follow_up_at?: string | null;
  follow_up_note?: string | null;
}

export interface InventoryUnit {
  id: string;
  organization_id: string;
  code: string;
  label: string;
  kind: UnitKind;
  base_unit: string | null;
  to_base_factor: number;
  is_builtin: boolean;
}

export interface TenantContext {
  profile: Profile;
  organization: Organization;
  membership: Membership;
  subscription: Subscription;
}

export type TenantLoadResult = {
  tenant: TenantContext | null;
  /** True only when a membership row was found for this user. */
  hasMembership: boolean;
  /** Set when membership exists but org/sub load failed (or other load error). */
  error: string | null;
};

export function isOrgVerified(org: Organization): boolean {
  return org.verification_status === "approved";
}

/** End date for trial or paid period (whichever currently applies). */
export function subscriptionEndsAt(sub: Subscription): string | null {
  if (sub.status === "trialing") return sub.trial_ends_at;
  if (sub.status === "active") return sub.current_period_end;
  return sub.current_period_end || sub.trial_ends_at || null;
}

export function subscriptionIsLive(sub: Subscription): boolean {
  const end = subscriptionEndsAt(sub);
  if (sub.status === "active" || sub.status === "trialing") {
    if (!end) return sub.status === "active";
    return new Date(end).getTime() > Date.now();
  }
  return false;
}

export function tenantCanUseApp(tenant: TenantContext): boolean {
  return isOrgVerified(tenant.organization) && subscriptionIsLive(tenant.subscription);
}

export function moduleFlag(
  sub: Subscription,
  module: AppModule,
): boolean {
  switch (module) {
    case "menu":
      return Boolean(sub.menu_enabled ?? sub.inventory_enabled);
    case "ordering":
      return Boolean(sub.ordering_enabled ?? sub.inventory_enabled);
    case "kitchen":
      // Explicit kitchen flag only — do not inherit ordering unless unset (null/undefined).
      if (sub.kitchen_enabled === undefined || sub.kitchen_enabled === null) {
        return Boolean(sub.ordering_enabled ?? sub.inventory_enabled);
      }
      return Boolean(sub.kitchen_enabled);
    case "inventory":
      return Boolean(sub.inventory_enabled);
    case "finance":
      return Boolean(sub.finance_enabled);
    case "hr":
      // Explicit false stays off; null/undefined defaults on (seats always needed).
      return sub.hr_enabled !== false;
    default:
      return false;
  }
}

/**
 * Module is usable only when:
 * 1) org is approved by platform admin, AND
 * 2) subscription is live (active trial OR paid period not expired), AND
 * 3) that module flag is enabled on the subscription (set by admin at trial/payment).
 */
export function moduleEnabled(
  sub: Subscription,
  module: AppModule,
  org?: Organization,
): boolean {
  if (org && !isOrgVerified(org)) return false;
  if (!subscriptionIsLive(sub)) return false;
  return moduleFlag(sub, module);
}

/** Days until trial or subscription period ends. Negative if already past. */
export function daysLeftOnAccess(sub: Subscription): number {
  const end = subscriptionEndsAt(sub);
  if (!end) return 999;
  const ms = new Date(end).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** @deprecated use daysLeftOnAccess — kept for trial-specific UIs */
export function daysLeftOnTrial(sub: Subscription): number {
  if (sub.status !== "trialing") return 0;
  return Math.max(0, daysLeftOnAccess(sub));
}

export type AccessWarningLevel = "none" | "notice" | "urgent";

/** Show from 10 days left; urgent (red) at 5 days or fewer. */
export function accessWarningLevel(sub: Subscription): AccessWarningLevel {
  if (!subscriptionIsLive(sub) && (sub.status === "trialing" || sub.status === "active")) {
    return "urgent";
  }
  if (!subscriptionIsLive(sub)) return "none";
  const days = daysLeftOnAccess(sub);
  if (days <= 5) return "urgent";
  if (days <= 10) return "notice";
  return "none";
}

export const APP_MODULE_LABELS: Record<AppModule, string> = {
  menu: "Menu",
  ordering: "Ordering",
  kitchen: "Kitchen",
  inventory: "Inventory",
  finance: "Finance",
  hr: "HR / Staff",
};

export const SALE_ORDER_STATUS_LABELS: Record<SaleOrderStatus, string> = {
  placed: "Placed",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  canceled: "Canceled",
};
