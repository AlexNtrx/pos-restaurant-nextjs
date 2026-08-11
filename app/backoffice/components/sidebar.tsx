"use client";

import {
  Clock3,
  Columns2,
  Grid3X3,
  House,
  LogOut,
  Settings,
  SquareMenu,
  type LucideIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { NavItem } from "@/components/ui/nav-item";
import { StatusBadge } from "@/components/ui/status-badge";
import { clearAuthSession } from "@/lib/auth-session";
import {
  getVisibleBackofficeNavigation,
  isNavigationGroupActive,
  type NavigationIcon,
  type UserLevel,
} from "@/lib/access-control";
import { cn } from "@/lib/utils";

const navigationIcons = {
  overview: House,
  catalog: Grid3X3,
  orders: SquareMenu,
  kitchen: Columns2,
  reports: Clock3,
  settings: Settings,
} satisfies Record<NavigationIcon, LucideIcon>;

type SidebarProps = {
  name: string;
  userLevel: UserLevel;
  collapsed?: boolean;
  mobile?: boolean;
  onNavigate?: () => void;
};

export default function Sidebar({
  name,
  userLevel,
  collapsed = false,
  mobile = false,
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const groups = getVisibleBackofficeNavigation(userLevel);
  const showLabels = !collapsed || mobile;
  const roleLabel = userLevel === "admin" ? "Ylläpitäjä" : "Työntekijä";
  const displayName = name.trim() || "Tuntematon";

  const signOut = () => {
    clearAuthSession();
    router.replace("/signin");
  };

  return (
    <>
      <div
        role="complementary"
        aria-label="Päänavigointi"
        className={cn(
          "h-dvh min-h-dvh shrink-0 overflow-hidden bg-ink font-sans text-[#e7e5de]",
          collapsed && !mobile ? "w-[88px]" : "w-[232px]",
          mobile && "w-full",
        )}
      >
        {/* EN: The flexible content area preserves Figma's group spacing while the account footer stays at the viewport edge. */}
        {/* FI: Joustava sisältöalue säilyttää Figman ryhmävälit ja pitää tilin alatunnisteen näkymän reunassa. */}
        <div className="flex h-full w-full flex-col gap-[20px] p-[16px]">
          <div
            className={cn(
              "flex h-[72px] shrink-0 items-center overflow-hidden",
              showLabels ? "pl-[12px]" : "justify-center",
            )}
          >
            {showLabels ? (
              <div className="min-w-0">
                <div className="truncate font-heading text-2xl leading-none font-semibold text-[#fbfaf7]">
                  Ravintola POS
                </div>
                <div className="mt-0.5 truncate text-[11px] text-[#e7e5de]">
                  Helsinki · Keskusta
                </div>
              </div>
            ) : (
              <House
                aria-label="Ravintola POS"
                className="size-8 p-1.5 text-[#d8d4cc]"
                strokeWidth={1.5}
              />
            )}
          </div>

          <div
            className={cn(
              "min-h-0",
              showLabels && "flex flex-1 flex-col gap-[48px] overflow-hidden",
            )}
          >
            <div
              role="navigation"
              className="flex h-[280px] shrink-0 flex-col gap-[8px] overflow-hidden"
              aria-label="Työtilat"
            >
              {groups.map((group) => {
                const Icon = navigationIcons[group.icon];
                const active = isNavigationGroupActive(group, pathname);

                return (
                  <NavItem
                    key={group.id}
                    href={group.href}
                    onClick={onNavigate}
                    disabled={group.unavailable || !group.href}
                    active={active}
                    icon={<Icon strokeWidth={1.5} />}
                    title={
                      group.unavailable
                        ? `${group.label} — tulossa myöhemmin`
                        : collapsed && !mobile
                          ? group.label
                          : undefined
                    }
                    style={{
                      backgroundColor: active ? "#706f5e" : undefined,
                      color: active ? "#fbfaf7" : "#e7e5de",
                      textDecoration: "none",
                    }}
                    className={cn(
                      "h-10 min-h-10 w-full shrink-0 !gap-[8px] !rounded-[8px] !px-[12px] !py-[8px] text-[13px] font-medium hover:bg-[#2c2d29] focus-visible:ring-[#bfc0b3] focus-visible:ring-offset-[#1f201d]",
                      !showLabels &&
                        "w-14 justify-center !px-0 [&>span:last-child]:sr-only",
                    )}
                  >
                    {group.label}
                  </NavItem>
                );
              })}
            </div>

            {showLabels && (
              <div className="flex shrink-0 flex-col items-start gap-[8px] pl-[12px]">
                <div className="text-xs font-semibold text-[#c6c3b5]">
                  QR-tilaaminen
                </div>
                <StatusBadge
                  tone="neutral"
                  className="h-10 min-h-10 border-0 bg-[#efece6] px-[16px] font-medium text-[#5f765b] [&_svg]:size-1.5"
                >
                  Ei käytössä
                </StatusBadge>
                <div className="flex items-center gap-[8px] text-xs text-[#94d1ad]">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-current"
                  />
                  Yhteys kunnossa
                </div>
              </div>
            )}
          </div>

          {showLabels ? (
            <div className="flex h-8 shrink-0 items-center justify-between gap-[8px] overflow-hidden">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-medium text-[#fbfaf7]">
                  {roleLabel}: {displayName}
                </div>
                <div className="truncate text-[10px] text-[#c6c3b5]">
                  Versio 0.1 · Workshop
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setSignOutOpen(true)}
                aria-label="Kirjaudu ulos"
                title="Kirjaudu ulos"
                className="shrink-0 text-[#c6c3b5] hover:bg-[#3a3b36] hover:text-[#fbfaf7] focus-visible:ring-[#bfc0b3] focus-visible:ring-offset-[#1f201d]"
              >
                <LogOut aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <div className="mt-auto flex h-8 shrink-0 items-center justify-center">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setSignOutOpen(true)}
                aria-label="Kirjaudu ulos"
                title="Kirjaudu ulos"
                className="text-[#c6c3b5] hover:bg-[#3a3b36] hover:text-[#fbfaf7] focus-visible:ring-[#bfc0b3] focus-visible:ring-offset-[#1f201d]"
              >
                <LogOut aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kirjaudutaanko ulos?</AlertDialogTitle>
            <AlertDialogDescription>
              Nykyinen henkilökunnan istunto päätetään tällä laitteella.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Peruuta</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={signOut}>
              Kirjaudu ulos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
