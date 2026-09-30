export const userLevels = ["admin", "user", "waiter", "kitchen"] as const;
export type UserLevel = (typeof userLevels)[number];

export type NavigationIcon =
  | "overview"
  | "catalog"
  | "orders"
  | "kitchen"
  | "receipts"
  | "orderHistory"
  | "reports"
  | "settings";

export type BackofficeNavigationChild = {
  href: string;
  label: string;
  legacyPaths?: readonly string[];
  roles: readonly UserLevel[];
};

export type BackofficeNavigationGroup = {
  id: string;
  href?: string;
  label: string;
  icon: NavigationIcon;
  roles: readonly UserLevel[];
  legacyPaths?: readonly string[];
  unavailable?: boolean;
  hiddenFromNavigation?: boolean;
  activeExact?: boolean;
  children?: readonly BackofficeNavigationChild[];
};

const adminOnly = ["admin"] as const;
const allStaff = ["admin", "user"] as const;
const serviceStaff = ["admin", "user", "waiter"] as const;

// EN: Show the admin home first, then daily service, review and administration; role filtering preserves this order.
// FI: Näytä ylläpitäjän etusivu ensin, sitten päivittäinen palvelutyö, seuranta ja hallinta; roolisuodatus säilyttää järjestyksen.
export const backofficeNavigation: readonly BackofficeNavigationGroup[] = [
  {
    id: "overview",
    href: "/backoffice/dashboard",
    label: "Yhteenveto",
    icon: "overview",
    roles: adminOnly,
  },
  {
    id: "orders",
    href: "/backoffice/orders/new",
    label: "Kassa",
    icon: "orders",
    roles: allStaff,
    children: [
      {
        href: "/backoffice/orders/new",
        label: "Uusi tilaus",
        legacyPaths: ["/backoffice/sale"],
        roles: allStaff,
      },
      {
        href: "/backoffice/orders/inbox",
        label: "Saapuvat tilaukset",
        roles: allStaff,
      },
    ],
  },
  {
    id: "waiter",
    href: "/backoffice/waiter",
    label: "Tarjoilija",
    icon: "orders",
    roles: serviceStaff,
  },
  {
    id: "kitchen",
    href: "/backoffice/kitchen",
    label: "Keittiö",
    icon: "kitchen",
    roles: ["admin", "user", "kitchen"],
  },
  {
    id: "serviceCalls",
    href: "/backoffice/service-calls",
    label: "Palvelukutsut",
    icon: "orders",
    roles: serviceStaff,
    // EN: Calls open in the waiter dialog; keep direct-route authorization without a duplicate sidebar item.
    // FI: Kutsut avataan tarjoilijan dialogissa; säilytä suoran reitin käyttöoikeus ilman sivupalkin kaksoislinkkiä.
    hiddenFromNavigation: true,
  },
  {
    id: "orderHistory",
    href: "/backoffice/orders/history/orders",
    label: "Tilaushistoria",
    icon: "orderHistory",
    roles: adminOnly,
  },
  {
    id: "receipts",
    href: "/backoffice/orders/history",
    label: "Kuittihistoria",
    icon: "receipts",
    roles: adminOnly,
    legacyPaths: ["/backoffice/salereport"],
    // EN: The Order history URL is nested under this route, so only the receipt page highlights this item.
    // FI: Tilaushistorian URL on tämän reitin alla, joten vain kuittisivu korostaa tämän kohdan.
    activeExact: true,
  },
  {
    id: "reports",
    href: "/backoffice/reports/daily-sales",
    label: "Raportit",
    icon: "reports",
    roles: adminOnly,
    children: [
      {
        href: "/backoffice/reports/daily-sales",
        label: "Päivämyynti",
        legacyPaths: ["/backoffice/dailysales"],
        roles: adminOnly,
      },
      {
        href: "/backoffice/reports/monthly-sales",
        label: "Kuukausimyynti",
        legacyPaths: ["/backoffice/monthlysales"],
        roles: adminOnly,
      },
    ],
  },
  {
    id: "catalog",
    href: "/backoffice/catalog/menu-items",
    label: "Ruokalista",
    icon: "catalog",
    roles: adminOnly,
    children: [
      {
        href: "/backoffice/catalog/menu-items",
        label: "Ruokalistan tuotteet",
        legacyPaths: ["/backoffice/food"],
        roles: adminOnly,
      },
      {
        href: "/backoffice/food-paginate",
        label: "Tuotelista",
        roles: adminOnly,
      },
      {
        href: "/backoffice/catalog/categories",
        label: "Kategoriat",
        legacyPaths: ["/backoffice/food-type"],
        roles: adminOnly,
      },
      {
        href: "/backoffice/catalog/size-options",
        label: "Kokovaihtoehdot",
        legacyPaths: ["/backoffice/food-size"],
        roles: adminOnly,
      },
      {
        href: "/backoffice/catalog/modifiers",
        label: "Lisävalinnat",
        legacyPaths: ["/backoffice/taste"],
        roles: adminOnly,
      },
    ],
  },
  {
    id: "settings",
    href: "/backoffice/settings/tables",
    label: "Asetukset",
    icon: "settings",
    roles: allStaff,
    children: [
      {
        href: "/backoffice/settings/tables",
        label: "Pöydät ja QR-istunnot",
        roles: allStaff,
      },
      {
        href: "/backoffice/settings/restaurant",
        label: "Ravintolan tiedot",
        legacyPaths: ["/backoffice/organization"],
        roles: adminOnly,
      },
      {
        href: "/backoffice/settings/qr-ordering",
        label: "QR-tilaaminen",
        roles: adminOnly,
      },
      {
        href: "/backoffice/staff",
        label: "Henkilöstö",
        legacyPaths: ["/backoffice/user"],
        roles: adminOnly,
      },
    ],
  },
];

export function isUserLevel(value: unknown): value is UserLevel {
  return (
    typeof value === "string" && userLevels.some((level) => level === value)
  );
}

export function getBackofficeLanding(level: UserLevel) {
  if (level === "admin") return "/backoffice/dashboard";
  if (level === "kitchen") return "/backoffice/kitchen";
  return level === "waiter" ? "/backoffice/waiter" : "/backoffice/sale";
}

function hasRole(roles: readonly UserLevel[], level: UserLevel) {
  return roles.some((role) => role === level);
}

function matchesPath(
  pathname: string,
  href: string,
  legacyPaths: readonly string[] = [],
) {
  return [href, ...legacyPaths].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function isNavigationGroupActive(
  group: BackofficeNavigationGroup,
  pathname: string,
) {
  if (group.activeExact && group.href)
    return (
      pathname === group.href ||
      (group.legacyPaths?.some((path) => matchesPath(pathname, path)) ?? false)
    );
  if (group.href && matchesPath(pathname, group.href, group.legacyPaths))
    return true;
  return (
    group.children?.some(({ href, legacyPaths }) =>
      matchesPath(pathname, href, legacyPaths),
    ) ?? false
  );
}

export function getVisibleBackofficeNavigation(level: UserLevel) {
  return backofficeNavigation
    .filter(
      ({ roles, hiddenFromNavigation }) =>
        !hiddenFromNavigation && hasRole(roles, level),
    )
    .map((group) => ({
      ...group,
      children: group.children?.filter(({ roles }) => hasRole(roles, level)),
    }));
}

export function canAccessBackofficePath(pathname: string, level: UserLevel) {
  if (pathname === "/backoffice") return true;

  // EN: Canonical and legacy paths share one role rule while migrations remain incremental.
  // FI: Kanoniset ja vanhat polut jakavat saman roolisäännön vaiheittaisen siirtymän ajan.
  return backofficeNavigation.some((group) => {
    if (group.unavailable || !hasRole(group.roles, level)) return false;
    // EN: A group link with children must use the matching child's role, not grant its parent role to every settings page.
    // FI: Alilinkillisen ryhmän osoite käyttää vastaavan alilinkin roolia, eikä ylätason rooli avaa kaikkia asetussivuja.
    if (
      !group.children &&
      group.href &&
      matchesPath(pathname, group.href, group.legacyPaths)
    )
      return true;
    return (
      group.children?.some(
        ({ href, legacyPaths, roles }) =>
          hasRole(roles, level) && matchesPath(pathname, href, legacyPaths),
      ) ?? false
    );
  });
}
