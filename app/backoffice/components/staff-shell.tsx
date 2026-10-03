"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type { UserLevel } from "@/lib/access-control";
import api from "@/lib/api";

import Sidebar from "./sidebar";

type StaffShellProps = {
  children: React.ReactNode;
  name: string;
  userLevel: UserLevel;
};

function getInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("fi-FI"))
    .join("");
  return initials || "POS";
}

export default function StaffShell({
  children,
  name,
  userLevel,
}: StaffShellProps) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [qrMode, setQrMode] = useState<
    "DISABLED" | "MENU_ONLY" | "ORDERING" | null
  >(null);
  const qrModeVersionRef = useRef(0);

  useEffect(() => {
    if (userLevel !== "admin") return;
    let active = true;
    const version = qrModeVersionRef.current;
    void api
      .get("/qr-mode")
      .then(({ data }) => {
        const mode = data?.result?.mode;
        if (
          active &&
          version === qrModeVersionRef.current &&
          (mode === "DISABLED" || mode === "MENU_ONLY" || mode === "ORDERING")
        )
          setQrMode(mode);
      })
      .catch(() => {
        if (active && version === qrModeVersionRef.current) setQrMode(null);
      });
    return () => {
      active = false;
    };
  }, [userLevel]);

  useEffect(() => {
    // EN: QR settings notify the persistent shell so its mode badge changes without reloading the page.
    // FI: QR-asetukset ilmoittavat pysyvälle kuorelle, jotta tilamerkki päivittyy ilman sivun latausta.
    const onModeChanged = (event: Event) => {
      const mode = (event as CustomEvent<unknown>).detail;
      if (mode === "DISABLED" || mode === "MENU_ONLY" || mode === "ORDERING") {
        qrModeVersionRef.current += 1;
        setQrMode(mode);
      }
    };
    window.addEventListener("qr-mode-changed", onModeChanged);
    return () => window.removeEventListener("qr-mode-changed", onModeChanged);
  }, []);

  return (
    <div className="flex min-h-dvh w-full items-start bg-canvas text-foreground">
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-md bg-surface px-[16px] py-[8px] font-sans text-sm font-semibold text-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-2 focus:ring-ring"
      >
        Siirry sisältöön
      </a>
      {/* EN: Figma keeps a compact rail on tablets and expands it on wide desktops. */}
      {/* FI: Figma säilyttää tabletilla kompaktin palkin ja laajentaa sen leveällä työpöydällä. */}
      {/* EN: Keep desktop rails attached to the viewport while long legacy pages continue scrolling in the document. */}
      {/* FI: Pidä työpöydän sivupalkit kiinni näkymässä, kun pitkät legacy-sivut vierivät edelleen dokumentissa. */}
      <div className="sticky top-0 hidden h-dvh self-start md:block xl:hidden">
        <Sidebar name={name} userLevel={userLevel} qrMode={qrMode} collapsed />
      </div>
      <div className="sticky top-0 hidden h-dvh self-start xl:block">
        <Sidebar name={name} userLevel={userLevel} qrMode={qrMode} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div
          role="banner"
          className="flex h-16 items-center justify-between border-b border-border bg-surface px-[16px] font-sans md:hidden"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Avaa navigointi"
            onClick={() => setMobileNavigationOpen(true)}
          >
            <Menu aria-hidden="true" />
          </Button>
          <div className="font-heading text-xl font-semibold">
            Ravintola POS
          </div>
          <div
            className="flex size-9 items-center justify-center rounded-md bg-olive text-xs font-semibold text-primary-foreground"
            aria-label={`Kirjautunut käyttäjä: ${name}`}
          >
            {getInitials(name)}
          </div>
        </div>

        <main
          id="main-content"
          className="min-w-0 flex-1 overflow-x-hidden bg-canvas px-[16px] py-[20px] sm:px-6 md:pt-8 md:pr-10 md:pb-10 md:pl-8 xl:px-12 xl:pt-12 xl:pb-16"
        >
          {children}
        </main>
      </div>

      <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
        <SheetContent
          side="left"
          className="w-[min(88vw,232px)] gap-0 border-0 p-0"
          showCloseButton={false}
          style={{ width: "min(88vw, 232px)" }}
        >
          <SheetTitle className="sr-only">Päänavigointi</SheetTitle>
          <SheetDescription className="sr-only">
            Siirry ravintolan henkilökunnan työtilojen välillä.
          </SheetDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Sulje navigointi"
            onClick={() => setMobileNavigationOpen(false)}
            className="absolute top-3 right-3 z-10 text-[#e7e5de] hover:bg-[#3a3b36] hover:text-[#fbfaf7] focus-visible:ring-[#bfc0b3] focus-visible:ring-offset-[#1f201d]"
          >
            <X aria-hidden="true" />
          </Button>
          <Sidebar
            name={name}
            userLevel={userLevel}
            qrMode={qrMode}
            mobile
            onNavigate={() => setMobileNavigationOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
