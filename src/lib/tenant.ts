export type AppModule = "inventory" | "finance";
export type OrgType = "cafe" | "restaurant" | "other";
export type MemberRole = "owner" | "manager" | "cashier";
export type SubStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";
export type ProofStatus = "pending" | "approved" | "rejected";
export type VerificationStatus = "pending" | "approved" | "rejected";
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
  business_license_url?: string | null;
  id_document_url?: string | null;
  verification_status?: VerificationStatus;
  verified_at?: string | null;
  verified_by?: string | null;
  admin_notes?: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Membership {
  id: string;
  organization_id: string;
  user_id: string;
  role: MemberRole;
  can_order?: boolean;
  can_menu?: boolean;
  can_inventory?: boolean;
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
  trial_ends_at: string;
  current_period_end: string | null;
  plan_code: string;
  notes?: string | null;
  /** Non-owner staff seats included in the package */
  max_staff_seats?: number;
}

export interface TenantContext {
  profile: Profile;
  organization: Organization;
  membership: Membership;
  subscription: Subscription;
}

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

export function moduleEnabled(
  sub: Subscription,
  module: AppModule,
  org?: Organization,
): boolean {
  if (org && !isOrgVerified(org)) return false;
  if (!subscriptionIsLive(sub)) return false;
  return module === "inventory" ? sub.inventory_enabled : sub.finance_enabled;
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
