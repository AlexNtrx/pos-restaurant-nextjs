"use client";

import type { SettingsTab } from "./types";

type Props = {
  activeTab: SettingsTab;
  isAdmin: boolean;
  onTabChange: (tab: SettingsTab) => void;
};

function tabClassName(active: boolean) {
  return active
    ? "border-b-2 border-olive pb-3 font-semibold text-foreground"
    : "pb-3 text-muted-foreground hover:text-foreground";
}

export function SettingsTabs({ activeTab, isAdmin, onTabChange }: Props) {
  return (
    <nav
      aria-label="Asetusten välilehdet"
      className="flex gap-5 overflow-x-auto border-b border-border text-sm"
    >
      {isAdmin && (
        <button
          type="button"
          aria-pressed={activeTab === "restaurant"}
          className={tabClassName(activeTab === "restaurant")}
          onClick={() => onTabChange("restaurant")}
        >
          Ravintolan tiedot
        </button>
      )}
      <button
        type="button"
        aria-pressed={activeTab === "tables"}
        className={tabClassName(activeTab === "tables")}
        onClick={() => onTabChange("tables")}
      >
        Pöydät ja QR
      </button>
      {isAdmin && (
        <button
          type="button"
          aria-pressed={activeTab === "qr"}
          className={tabClassName(activeTab === "qr")}
          onClick={() => onTabChange("qr")}
        >
          QR-tila
        </button>
      )}
      {isAdmin && (
        <button
          type="button"
          aria-pressed={activeTab === "staff"}
          className={tabClassName(activeTab === "staff")}
          onClick={() => onTabChange("staff")}
        >
          Henkilöstö
        </button>
      )}
    </nav>
  );
}
