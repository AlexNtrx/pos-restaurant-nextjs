"use client";

import FoodPhoto, { originalImageUrl } from "@/components/catalog/food-photo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { qrMoney, type QrFood } from "@/lib/qr-customer";
import type { QrMenuSelection } from "./qr-menu-item-card";
import { QrQuantityControl } from "./qr-menu-controls";
type Props = {
  food: QrFood | null;
  selection: QrMenuSelection | null;
  ordering: boolean;
  pending: boolean;
  limitReached: boolean;
  onOpenChange: (open: boolean) => void;
  onQuantityChange: (delta: number) => void;
};

export function QrMenuItemDetails({
  food: detailsFood,
  selection: detailsSelection,
  ordering,
  pending,
  limitReached,
  onOpenChange,
  onQuantityChange,
}: Props) {
  return (
    <Dialog open={detailsFood !== null} onOpenChange={onOpenChange}>
      {detailsFood && detailsSelection && (
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader className="pr-10">
            <DialogTitle>{detailsFood.name}</DialogTitle>
            <DialogDescription>
              {detailsFood.remark || "Tuotteen kuva ja hinta."}
            </DialogDescription>
          </DialogHeader>
          {detailsFood.detailImg ? (
            <div className="space-y-2">
              <FoodPhoto
                key={`${detailsFood.id}:${detailsFood.detailImg}`}
                filename={detailsFood.detailImg}
                variant="detail"
                alt={detailsFood.name}
                className="h-[65dvh] max-h-[600px] w-full rounded-lg"
                sizes="(min-width: 640px) 536px, calc(100vw - 72px)"
                fit="contain"
              />
              {originalImageUrl(detailsFood.detailImg) && (
                <a
                  href={originalImageUrl(detailsFood.detailImg)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-olive underline underline-offset-4"
                >
                  Avaa alkuperäinen kuva
                </a>
              )}
            </div>
          ) : (
            <p className="rounded-lg bg-[#efece6] px-4 py-8 text-center text-sm text-muted-foreground">
              Tälle tuotteelle ei ole vielä lisätietokuvaa.
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 font-semibold">
              {qrMoney(
                detailsFood.price +
                  (detailsSelection.selectedSize?.moneyAdded ?? 0),
              )}
            </p>
            {ordering && (
              <QrQuantityControl
                quantity={detailsSelection.selectedCount}
                selectionName={detailsSelection.selectionName}
                disabled={pending}
                limitReached={limitReached}
                onChange={onQuantityChange}
              />
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
