"use client";

import type { ChangeEventHandler } from "react";
import FoodPhoto from "@/components/catalog/food-photo";
import { Button } from "@/components/ui/button";
import { qrMoney, type QrFood, type QrCategory } from "@/lib/qr-customer";
import { QrItemNote, QrQuantityControl } from "./qr-menu-controls";

export type QrMenuSelection = {
  category: QrCategory | undefined;
  sizeId: number | null;
  tasteId: number | null;
  note: string;
  selectedSize: QrCategory["foodSizes"][number] | undefined;
  selectedCount: number;
  selectionName: string;
};
type Props = {
  food: QrFood;
  selection: QrMenuSelection;
  noteValue: string;
  ordering: boolean;
  pending: boolean;
  limitReached: boolean;
  onOpenDetails: () => void;
  onSizeChange: ChangeEventHandler<HTMLSelectElement>;
  onTasteChange: ChangeEventHandler<HTMLSelectElement>;
  onNoteChange: (value: string) => void;
  onQuantityChange: (delta: number) => void;
};

export function QrMenuItemCard({
  food,
  selection,
  noteValue,
  ordering,
  pending,
  limitReached,
  onOpenDetails,
  onSizeChange,
  onTasteChange,
  onNoteChange,
  onQuantityChange,
}: Props) {
  const {
    category,
    sizeId,
    tasteId,
    selectedSize,
    selectedCount,
    selectionName,
  } = selection;
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 p-3">
        <FoodPhoto
          key={`${food.id}:${food.img}`}
          filename={food.img}
          alt=""
          className="size-24 rounded-md"
          sizes="96px"
        />
        <div className="flex min-w-0 flex-col justify-between gap-2 py-0.5">
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-base font-semibold leading-5">
              {food.name}
            </h2>
            <p className="mt-1 text-xs text-olive">
              <span className="font-medium">Huomautus: </span>
              {food.remark.trim() ||
                "Katso kaikki ainesosat kohdasta Katso tiedot."}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="text-sm font-semibold">
              {qrMoney(food.price + (selectedSize?.moneyAdded ?? 0))}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 px-2 text-xs"
              aria-label={`Katso tiedot: ${food.name}`}
              onClick={onOpenDetails}
            >
              Katso tiedot
            </Button>
          </div>
        </div>
      </div>
      {ordering && (
        <div className="space-y-2 border-t border-border px-3 py-3">
          <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
            <label
              className={`block text-xs text-muted-foreground ${category?.tastes.length ? "" : "min-[390px]:col-span-2"}`}
            >
              Koko
              <select
                className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-2 text-sm text-foreground"
                aria-label={`Koko: ${food.name}`}
                value={sizeId ?? ""}
                disabled={pending}
                onChange={onSizeChange}
              >
                <option value="">Tavallinen</option>
                {category?.foodSizes.map((size) => (
                  <option key={size.id} value={size.id}>
                    {size.name} · +{qrMoney(size.moneyAdded)}
                  </option>
                ))}
              </select>
            </label>
            {category && category.tastes.length > 0 && (
              <label className="block text-xs text-muted-foreground">
                Maku
                <select
                  className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-2 text-sm text-foreground"
                  aria-label={`Maku: ${food.name}`}
                  value={tasteId ?? ""}
                  disabled={pending}
                  onChange={onTasteChange}
                >
                  <option value="">Ei valintaa</option>
                  {category.tastes.map((taste) => (
                    <option key={taste.id} value={taste.id}>
                      {taste.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <QrItemNote
            id={`qr-menu-note-${food.id}`}
            foodName={food.name}
            value={noteValue}
            disabled={pending}
            onChange={onNoteChange}
          />
          <div className="flex items-center justify-end gap-2">
            <QrQuantityControl
              quantity={selectedCount}
              selectionName={selectionName}
              disabled={pending}
              limitReached={limitReached}
              onChange={onQuantityChange}
            />
          </div>
        </div>
      )}
    </article>
  );
}
