"use client";

import { usePathname } from "next/navigation";

import { NavItem } from "@/components/ui/nav-item";
import {
  getVisibleBackofficeNavigation,
  isNavigationGroupActive,
  type UserLevel,
  type BackofficeNavigationGroup,
} from "@/lib/access-control";
import { cn } from "@/lib/utils";
import { useReadyOrders } from "@/lib/use-ready-orders";
import { NotificationDot } from "@/components/ui/notification-dot";

export function WorkspaceNavigation({ userLevel }: { userLevel: UserLevel }) {
  const pathname = usePathname();
  // EN: Expose cashier, waiter and report destinations inside their workspace; keep sidebar order and role rules unchanged.
  // FI: Näytä kassa-, tarjoilija- ja raporttikohteet työtilan sisällä; säilytä sivupalkin järjestys ja roolisäännöt.
  const group = getVisibleBackofficeNavigation(userLevel).find(
    (item) =>
      (item.id === "orders" || item.id === "reports" || item.id === "waiter") &&
      isNavigationGroupActive(item, pathname),
  );

  if (!group?.children?.length) return null;

  return (
    <WorkspaceLinks
      key={`${userLevel}:${group.id}`}
      group={group}
      pathname={pathname}
    />
  );
}

function WorkspaceLinks({
  group,
  pathname,
}: {
  group: BackofficeNavigationGroup;
  pathname: string;
}) {
  const hasReady = useReadyOrders(
    group.id === "orders" || group.id === "waiter" ? group.id : null,
  );

  return (
    <nav
      aria-label={
        group.id === "orders"
          ? "Kassan näkymät"
          : group.id === "waiter"
            ? "Tarjoilijan näkymät"
            : "Raporttien näkymät"
      }
      className={cn(
        "mb-6 flex flex-wrap gap-2",
        // EN: Use the same route decision as StaffShell so insets change together, including while page content is loading.
        // FI: Käytä samaa reittipäätöstä kuin StaffShell, jotta sisävälit muuttuvat yhdessä myös sivusisällön latautuessa.
        (pathname === "/backoffice/sale" ||
          pathname === "/backoffice/orders/new") &&
          "px-[16px] pt-[20px] sm:px-6 md:pt-8 md:pr-10 md:pl-8 xl:px-12 xl:pt-12",
      )}
    >
      {group.children!.map((item) => (
        <NavItem
          key={item.href}
          href={item.href}
          active={
            pathname === item.href ||
            Boolean(item.legacyPaths?.includes(pathname))
          }
          className="relative min-h-11 max-w-full border border-border [&>span:last-child]:whitespace-normal"
        >
          {item.label}
          {hasReady &&
            ["/backoffice/waiter/tracking", "/backoffice/orders/sent"].includes(
              item.href,
            ) && <NotificationDot label="Valmiita tilauksia" />}
        </NavItem>
      ))}
    </nav>
  );
}
