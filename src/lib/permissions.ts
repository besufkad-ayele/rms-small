import type { AppModule, MemberRole, Membership, Subscription } from "@/lib/tenant";
import { includedSeatsFromFlags, type ModuleToggleMap } from "@/lib/pricing";

/** Feature keys the owner can grant to staff. */
export type StaffFeature =
  | "order"
  | "menu"
  | "kitchen"
  | "inventory"
  | "inventory_issue"
  | "finance"
  | "billing"
  | "staff";

export type StaffPermissions = {
  can_order: boolean;
  can_menu: boolean;
  can_kitchen: boolean;
  can_inventory: boolean;
  can_inventory_issue: boolean;
  can_finance: boolean;
  can_billing: boolean;
  can_manage_staff: boolean;
};

export const STAFF_FEATURE_LABELS: Record<StaffFeature, string> = {
  order: "Orders / cashier POS",
  menu: "Menu management",
  kitchen: "Kitchen tickets",
  inventory: "Inventory receive & catalog",
  inventory_issue: "Inventory issue (take-out)",
  finance: "Finance & reports",
  billing: "Billing (owner settings — not for staff)",
  staff: "Manage staff (HR)",
};

/** Seat caps used for marketing packages (fallback only). */
export const PLAN_STAFF_SEATS: Record<string, number> = {
  starter: 3,
  intermediate: 5,
  full: 7,
  website: 4,
  aramis_starter: 3,
  growth: 5,
  aramis_growth: 5,
};

export function flagsFromSubscription(sub: Subscription): ModuleToggleMap {
  const inv = sub.inventory_enabled;
  const ordering = sub.ordering_enabled ?? inv;
  return {
    menu: sub.menu_enabled ?? inv,
    ordering,
    kitchen: sub.kitchen_enabled ?? ordering,
    inventory: inv,
    finance: sub.finance_enabled,
    hr: sub.hr_enabled ?? true,
    online: Boolean(sub.online_enabled),
  };
}

export function seatsForPlan(planCode: string, override?: number | null): number {
  if (typeof override === "number" && override > 0) return override;
  return PLAN_STAFF_SEATS[planCode] ?? 3;
}

/** Included seats (1 per module) plus any extra seats purchased one-time. */
export function maxStaffSeats(sub: Subscription): number {
  const included = includedSeatsFromFlags(flagsFromSubscription(sub));
  const extra = Math.max(0, Number(sub.extra_staff_seats ?? 0));
  const stored = Number(sub.max_staff_seats ?? 0);
  return Math.max(included + extra, stored, 1);
}

export function isOwner(membership: Membership): boolean {
  return membership.role === "owner";
}

export function membershipActive(membership: Membership): boolean {
  return membership.active !== false;
}

/** Owners always have every feature. */
export function hasFeature(
  membership: Membership,
  feature: StaffFeature,
): boolean {
  if (!membershipActive(membership)) return false;
  if (membership.role === "owner") return true;
  switch (feature) {
    case "order":
      return Boolean(membership.can_order);
    case "menu":
      return Boolean(membership.can_menu);
    case "kitchen":
      return Boolean(membership.can_kitchen);
    case "inventory":
      return Boolean(membership.can_inventory);
    case "inventory_issue":
      return Boolean(membership.can_inventory_issue);
    case "finance":
      return Boolean(membership.can_finance);
    case "billing":
      return Boolean(membership.can_billing);
    case "staff":
      return Boolean(membership.can_manage_staff);
    default:
      return false;
  }
}

export function defaultPermissionsForRole(
  role: Exclude<MemberRole, "owner">,
): StaffPermissions {
  if (role === "manager") {
    return {
      can_order: true,
      can_menu: true,
      can_kitchen: true,
      can_inventory: true,
      can_inventory_issue: true,
      can_finance: true,
      can_billing: false,
      can_manage_staff: false,
    };
  }
  if (role === "waiter") {
    return {
      can_order: true,
      can_menu: false,
      can_kitchen: false,
      can_inventory: false,
      can_inventory_issue: false,
      can_finance: false,
      can_billing: false,
      can_manage_staff: false,
    };
  }
  // cashier
  return {
    can_order: true,
    can_menu: false,
    can_kitchen: false,
    can_inventory: false,
    can_inventory_issue: false,
    can_finance: false,
    can_billing: false,
    can_manage_staff: false,
  };
}

/** Waiters place & complete only — no print / cancel request. */
export function canCashierOrderOps(membership: Membership): boolean {
  if (!membershipActive(membership)) return false;
  if (membership.role === "waiter") return false;
  return true;
}

export function permissionsFromFlags(
  flags: Partial<StaffPermissions>,
): StaffPermissions {
  return {
    can_order: Boolean(flags.can_order),
    can_menu: Boolean(flags.can_menu),
    can_kitchen: Boolean(flags.can_kitchen),
    can_inventory: Boolean(flags.can_inventory),
    can_inventory_issue: Boolean(flags.can_inventory_issue),
    can_finance: Boolean(flags.can_finance),
    can_billing: Boolean(flags.can_billing),
    can_manage_staff: Boolean(flags.can_manage_staff),
  };
}
