"use client";

import {
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import FoodPhoto from "@/components/catalog/food-photo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Food } from "@/lib/catalog-contracts";
import { cn } from "@/lib/utils";
const currencyFormatter = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});
export type LoadStatus = "loading" | "ready" | "error" | "forbidden";
type Props = {
  status: LoadStatus;
  error: string;
  totalCount: number;
  filteredCount: number;
  visibleFoods: Food[];
  canCreate: boolean;
  pagination: {
    page: number;
    pageCount: number;
    firstResult: number;
    lastResult: number;
  };
  onPageChange: (page: number) => void;
  onCreate: () => void;
  onRetry: () => void;
  onClearFilters: () => void;
  onEdit: (food: Food) => void;
  onDelete: (food: Food) => void;
};
function MenuItemCard({
  food,
  onEdit,
  onDelete,
}: {
  food: Food;
  onEdit: (food: Food) => void;
  onDelete: (food: Food) => void;
}) {
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-[#d6d6cf] bg-white">
      {food.img ? (
        <FoodPhoto
          filename={food.img}
          alt={food.name}
          sizes="(min-width: 768px) 320px, calc(100vw - 48px)"
          className="aspect-4/3 w-full shrink-0 rounded-t-[11px] bg-[#f0f0e8]"
        />
      ) : (
        <div className="flex aspect-4/3 w-full shrink-0 flex-col items-center justify-center gap-2 rounded-t-[11px] bg-[#f0f0e8] text-muted-foreground">
          <ImageIcon aria-hidden="true" className="size-7" />
          <span className="text-xs font-medium">Ei kuvaa</span>
        </div>
      )}

      <div className="flex flex-col gap-2 p-[16px]!">
        <div className="flex h-[30px] min-w-0 items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-[17px]! leading-[22px]! font-semibold! text-[#1f1f1c]!">
            {food.name}
          </h2>
          <details className="group relative shrink-0">
            <summary className="flex h-8 w-9 cursor-pointer list-none items-center justify-center rounded-lg bg-[#f5f5f0] text-[#3b3b33] outline-none hover:bg-[#ecece5] focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <MoreHorizontal aria-hidden="true" className="size-5" />
              <span className="sr-only">Lisää toimintoja: {food.name}</span>
            </summary>
            <div className="absolute top-10 right-0 z-20 w-40 rounded-lg border border-border bg-popover p-1 shadow-lg">
              <button
                type="button"
                onClick={(event) => {
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                  onEdit(food);
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-popover-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Pencil aria-hidden="true" className="size-4" />
                Muokkaa
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                  onDelete(food);
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-md border-t border-border px-3 text-left text-sm font-medium text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Poista
              </button>
            </div>
          </details>
        </div>

        <p className="text-xl! leading-6! font-semibold! text-[#2b401f]!">
          {currencyFormatter.format(food.price)}
        </p>
        <Badge className="min-h-[26px] rounded-full border-0 bg-[#edf0e3] px-[9px] py-[5px] text-xs leading-4 font-medium text-[#384a29]">
          {food.FoodType.name}
        </Badge>
      </div>
    </article>
  );
}

function CatalogSkeleton() {
  return (
    <div
      role="status"
      aria-label="Ruokalistaa ladataan"
      className="grid grid-cols-1 gap-[18px] md:grid-cols-2 md:gap-x-9 lg:grid-cols-[repeat(3,252px)] xl:grid-cols-[repeat(4,252px)] xl:gap-x-[18px]"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-xl border border-border bg-white"
        >
          <div className="aspect-4/3 animate-pulse bg-[#ecece6]" />
          <div className="space-y-3 p-4">
            <div className="h-5 w-3/4 animate-pulse rounded bg-[#ecece6]" />
            <div className="h-6 w-24 animate-pulse rounded bg-[#ecece6]" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-[#ecece6]" />
          </div>
        </div>
      ))}
      <span className="sr-only">Ruokalistaa ladataan…</span>
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  const visiblePages = Array.from(
    { length: Math.min(4, pageCount) },
    (_, index) => index + 1,
  );

  return (
    <nav aria-label="Ruokalistan sivutus" className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-10 w-11 rounded-[9px] p-0"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Edellinen sivu"
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      {visiblePages.map((pageNumber) => (
        <Button
          type="button"
          key={pageNumber}
          variant={page === pageNumber ? "default" : "outline"}
          className={cn(
            "h-10 w-9 rounded-[9px] p-0",
            page === pageNumber && "bg-[#455c2b] hover:bg-[#3d5226]",
          )}
          onClick={() => onPageChange(pageNumber)}
          aria-current={page === pageNumber ? "page" : undefined}
          aria-label={`Sivu ${pageNumber}`}
        >
          {pageNumber}
        </Button>
      ))}
      {pageCount > 4 && (
        <span aria-hidden="true" className="px-1 text-muted-foreground">
          …
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        className="h-10 w-11 rounded-[9px] p-0"
        disabled={page === pageCount}
        onClick={() => onPageChange(page + 1)}
        aria-label="Seuraava sivu"
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
}

export function MenuItemsList({
  status,
  error,
  totalCount,
  filteredCount,
  visibleFoods,
  canCreate,
  pagination,
  onPageChange,
  onCreate,
  onRetry,
  onClearFilters,
  onEdit,
  onDelete,
}: Props) {
  return (
    <section
      aria-label="Ruokalajit"
      className="mt-[43px]! md:mt-[21px]! xl:mt-[5px]!"
    >
      {status === "ready" && (
        <p className="mb-[14px]! text-sm! leading-5! font-medium! text-[#636657]! md:mb-[13px]! xl:mb-2!">
          {filteredCount} tuotetta
        </p>
      )}

      {status === "loading" ? (
        <CatalogSkeleton />
      ) : status === "forbidden" ? (
        <div
          role="alert"
          className="rounded-xl border border-border bg-white p-8"
        >
          <h2 className="text-xl font-semibold">Ei käyttöoikeutta</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sinulla ei ole oikeutta tarkastella ruokalistaa.
          </p>
        </div>
      ) : status === "error" ? (
        <div
          role="alert"
          className="rounded-xl border border-border bg-white p-8"
        >
          <h2 className="text-xl font-semibold">Ruokalistaa ei voitu ladata</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-6" onClick={onRetry}>
            Yritä uudelleen
          </Button>
        </div>
      ) : totalCount === 0 ? (
        <div className="rounded-xl border border-border bg-white p-8">
          <h2 className="text-xl font-semibold">Ruokalista on tyhjä</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Lisää ensimmäinen ruokalaji katalogiin.
          </p>
          <Button className="mt-6" onClick={onCreate} disabled={!canCreate}>
            Lisää ruokalaji
          </Button>
        </div>
      ) : filteredCount === 0 ? (
        <div className="rounded-xl border border-border bg-white p-8">
          <h2 className="text-xl font-semibold">Ei hakutuloksia</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Muuta hakua tai tyhjennä suodattimet.
          </p>
          <Button variant="outline" className="mt-6" onClick={onClearFilters}>
            Tyhjennä suodattimet
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 md:gap-x-9 lg:grid-cols-[repeat(3,252px)] xl:grid-cols-[repeat(4,252px)] xl:gap-x-[18px]">
            {visibleFoods.map((food) => (
              <MenuItemCard
                key={food.id}
                food={food}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>

          <footer className="mt-8 flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between md:mt-10">
            <p className="text-[13px] leading-[18px] font-medium text-[#636657]">
              {pagination.firstResult}–{pagination.lastResult} / {filteredCount}
            </p>
            <Pagination
              page={pagination.page}
              pageCount={pagination.pageCount}
              onPageChange={onPageChange}
            />
          </footer>
        </>
      )}
    </section>
  );
}
