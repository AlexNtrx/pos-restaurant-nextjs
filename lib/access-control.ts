export const userLevels = ["admin", "user"] as const;
export type UserLevel = (typeof userLevels)[number];

type BackofficeNavigationItem = {
  href: string;
  label: string;
  icon: string;
  roles: readonly UserLevel[];
};
const adminOnly = ["admin"] as const;
const allStaff = ["admin", "user"] as const;

export const backofficeNavigation: readonly BackofficeNavigationItem[] = [
  {
    href: "/backoffice/dashboard",
    label: "Dashboard",
    icon: "fas fa-chart-bar",
    roles: adminOnly,
  },
  {
    href: "/backoffice/sale",
    label: "POS",
    icon: "fas fa-cash-register",
    roles: allStaff,
  },
  {
    href: "/backoffice/user",
    label: "Staff Accounts",
    icon: "fas fa-users",
    roles: adminOnly,
  },
  {
    href: "/backoffice/food-type",
    label: "Menu Categories",
    icon: "fas fa-tags",
    roles: adminOnly,
  },
  {
    href: "/backoffice/food-size",
    label: "Size Options",
    icon: "fas fa-expand",
    roles: adminOnly,
  },
  {
    href: "/backoffice/taste",
    label: "Modifiers",
    icon: "fas fa-sliders-h",
    roles: adminOnly,
  },
  {
    href: "/backoffice/food",
    label: "Menu Items",
    icon: "fas fa-utensils",
    roles: adminOnly,
  },
  {
    href: "/backoffice/food-paginate",
    label: "Menu Item List",
    icon: "fas fa-list",
    roles: adminOnly,
  },
  {
    href: "/backoffice/organization",
    label: "Business Profile",
    icon: "fas fa-store",
    roles: adminOnly,
  },
  {
    href: "/backoffice/salereport",
    label: "Sales History",
    icon: "fas fa-receipt",
    roles: adminOnly,
  },
  {
    href: "/backoffice/dailysales",
    label: "Daily Sales",
    icon: "fas fa-calendar-day",
    roles: adminOnly,
  },
  {
    href: "/backoffice/monthlysales",
    label: "Monthly Sales",
    icon: "fas fa-calendar-alt",
    roles: adminOnly,
  },
  // Validates is user level before it is used.
];

// Validates is user level before it is used.
export function isUserLevel(value: unknown): value is UserLevel {
  return (
    typeof value === "string" && userLevels.some((level) => level === value)
  );
  // Loads backoffice landing for the current workflow.
}
// Loads backoffice landing for the current workflow.
export function getBackofficeLanding(level: UserLevel) {
  return level === "admin" ? "/backoffice/dashboard" : "/backoffice/sale";
  // Enforces can access backoffice path ownership and authorization rules.
}
// Enforces can access backoffice path ownership and authorization rules.
export function canAccessBackofficePath(pathname: string, level: UserLevel) {
  if (pathname === "/backoffice") return true;
  const item = backofficeNavigation.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );
  return item?.roles.some((role) => role === level) ?? false;
}
