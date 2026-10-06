"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FoodCategory } from "@/lib/catalog-contracts";
export type CategoryFilter = "all" | number;
type Props = {
  query: string;
  category: CategoryFilter;
  categories: FoodCategory[];
  canCreate: boolean;
  onCreate: () => void;
  onQueryChange: (query: string) => void;
  onCategoryChange: (category: CategoryFilter) => void;
};

export function MenuItemsToolbar({
  query,
  category,
  categories,
  canCreate,
  onCreate,
  onQueryChange,
  onCategoryChange,
}: Props) {
  return (
    <header className="mt-6 md:mt-10 xl:mt-[31px]">
      <div className="flex flex-col gap-[19px]! sm:flex-row sm:items-start sm:justify-between sm:gap-[16px]!">
        <div>
          <h1 className="m-0! text-[26px]! leading-8! font-semibold! text-[#1b1c17]! md:text-[28px]! md:leading-[34px]! xl:text-[30px]! xl:leading-9!">
            Ruokalista
          </h1>
          <p className="mt-1! text-sm! leading-5! text-[#636657]!">
            <span className="md:hidden">Hallitse ruokia ja juomia.</span>
            <span className="hidden md:inline">
              Hallitse ravintolan ruokia ja juomia.
            </span>
          </p>
        </div>
        <Button
          className="h-[46px] w-full rounded-[9px] bg-[#455c2b]! px-5 text-sm font-semibold text-white! no-underline! hover:bg-[#3d5226]! hover:text-white! sm:h-11 sm:w-[178px] xl:mt-1"
          onClick={onCreate}
          disabled={!canCreate}
        >
          Lisää ruokalaji
        </Button>
      </div>

      <div className="mt-4! grid grid-cols-2 gap-[16px]! md:mt-[30px]! md:grid-cols-[minmax(0,1fr)_210px_230px] lg:grid-cols-[376px_210px_230px] xl:mt-[15px]! xl:grid-cols-[410px_214px_210px] xl:gap-[18px]!">
        <label className="relative col-span-2 mb-0! block md:col-span-1">
          <span className="sr-only">Hae ruokalistaa</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#636657]"
          />
          <Input
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
            }}
            placeholder="Hae ruokalistaa"
            className="h-11 rounded-[9px] border-[#d4d4c7] bg-white pl-10! text-sm font-normal! placeholder:font-normal!"
          />
        </label>

        <Select
          value={String(category)}
          onValueChange={(value) => {
            onCategoryChange(value === "all" ? "all" : Number(value));
          }}
        >
          <SelectTrigger
            aria-label="Suodata kategorian mukaan"
            className="h-11! w-full rounded-[9px] border-[#d4d4c7] bg-white"
          >
            <SelectValue placeholder="Kaikki kategoriat" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Kaikki kategoriat</SelectItem>
            {categories.map((foodCategory) => (
              <SelectItem key={foodCategory.id} value={String(foodCategory.id)}>
                {foodCategory.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <Select disabled value="availability-api-pending">
            <SelectTrigger
              aria-label="Saatavuussuodatin ei ole käytössä"
              className="h-11! w-full rounded-[9px] border-[#d4d4c7] bg-[#f0f0e8] opacity-100"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="availability-api-pending">
                Saatavuus
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="absolute top-[52px] -left-[calc(100%+16px)] mt-0! w-[calc(200%+16px)] text-[11px]! leading-4! font-medium! text-[#636657]! md:top-[49px] md:left-0 md:w-max">
            Saatavuussuodatus ei ole vielä käytettävissä.
          </p>
        </div>
      </div>
    </header>
  );
}
