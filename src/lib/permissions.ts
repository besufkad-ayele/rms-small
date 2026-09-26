import type { MemberRole, Membership, Subscription } from "@/lib/tenant";

/** Feature keys the owner can grant to staff. */
export type StaffFeature =
  | "order"
  | "menu"
  | "inventory"
  | "finance"
  | "billing"
  | "staff";

export type StaffPermissions = {
  can_order: boolean;
  can_menu: boolean;
  can_inventory: boolean;
  can_finance: boolean;
  can_billing: boolean;
  can_manage_staff: boolean;
};

export const STAFF_FEATURE_LABELS: Record<StaffFeature, string> = {
  order: "Orders / cashier POS",
  menu: "Menu management",
  inventory: "Inventory / stock",
  finance: "Finance & reports",
  billing: "Billing & subscription",
  staff: "Manage staff (HR)",
};

/** Seat caps used for marketing packages. */
export const PLAN_STAFF_SEATS: Record<string, number> = {
  aramis_starter: 2,
  starter: 2,
  basic: 2,
  aramis_growth: 10,
  growth: 10,
  aramis_medium: 10,
  medium: 10,
  full: 25,
  aramis_enterprise: 50,
  enterprise: 50,
};

export function seatsForPlan(planCode: string, override?: number | null): number {
  if (typeof override === "number" && override > 0) return override;
  return PLAN_STAFF_SEATS[planCode] ?? PLAN_STAFF_SEATS.aramis_starter;
}

export function maxStaffSeats(sub: Subscription): number {
  return seatsForPlan(sub.plan_code, sub.max_staff_seats);
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
    case "inventory":
      return Boolean(membership.can_inventory);
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
      can_inventory: true,
      can_finance: true,
      can_billing: false,
      can_manage_staff: false,
    };
  }
  return {
    can_order: true,
    can_menu: false,
    can_inventory: false,
    can_finance: false,
    can_billing: false,
    can_manage_staff: false,
  };
}

export function permissionsFromFlags(
  flags: Partial<StaffPermissions>,
): StaffPermissions {
  return {
    can_order: Boolean(flags.can_order),
    can_menu: Boolean(flags.can_menu),
    can_inventory: Boolean(flags.can_inventory),
    can_finance: Boolean(flags.can_finance),
    can_billing: Boolean(flags.can_billing),
    can_manage_staff: Boolean(flags.can_manage_staff),
  };
}
