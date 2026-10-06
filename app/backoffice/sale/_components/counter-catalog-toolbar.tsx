"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
type Props = {
  availableCount: number;
  searchQuery: string;
  activeFilter: "all" | "food" | "drink";
  filtersDisabled: boolean;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: "all" | "food" | "drink") => void;
};

export function CounterCatalogToolbar({
  availableCount,
  searchQuery,
  activeFilter,
  filtersDisabled,
  onSearchChange,
  onFilterChange,
}: Props) {
  return (
    <>
      <header className="flex min-h-[76px] flex-col gap-3 bg-surface px-7 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="m-0 text-[22px] leading-7 font-semibold">
            Ruokalista
          </h2>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            {availableCount} tuotetta saatavilla
          </p>
        </div>
        <label className="relative block lg:w-[274px]">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <span className="sr-only">Hae tuotetta</span>
          <Input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Hae tuotetta"
            className="h-11 border-transparent bg-[#f1efea] pl-10"
          />
        </label>
      </header>
      <div className="border-b border-border/60 px-7 pt-5">
        <div className="flex gap-8 overflow-x-auto">
          {(
            [
              ["all", "Kaikki"],
              ["food", "Ruoat"],
              ["drink", "Juomat"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-label={
                value === "all"
                  ? "All Items"
                  : value === "food"
                    ? "Food"
                    : "Drinks"
              }
              disabled={filtersDisabled}
              onClick={() => onFilterChange(value)}
              className={`relative h-11 min-w-[76px] shrink-0 text-left text-[13px] font-medium ${activeFilter === value ? "text-olive after:absolute after:inset-x-0 after:top-0 after:h-[3px] after:rounded-full after:bg-[#706f5e]" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
