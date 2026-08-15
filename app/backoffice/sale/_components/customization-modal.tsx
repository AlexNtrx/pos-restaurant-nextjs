import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FoodSize, SaleTempDetail, Taste } from "@/lib/sale-contracts";

type CustomizationModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleTempId: number;
  saleTempDetails: SaleTempDetail[];
  tastes: Taste[];
  sizes: FoodSize[];
  customizationBusy: boolean;
  checkoutBusy: boolean;
  onCreateDetail: () => void;
  onRemoveDetail: (saleTempDetailId: number) => void;
  onSelectTaste: (
    tasteId: number,
    saleTempDetailId: number,
    saleTempId: number,
  ) => void;
  onUnselectTaste: (saleTempDetailId: number, saleTempId: number) => void;
  onSelectSize: (
    sizeId: number | null,
    saleTempDetailId: number,
    saleTempId: number,
  ) => void;
};

export default function CustomizationModal({
  open,
  onOpenChange,
  saleTempId,
  saleTempDetails,
  tastes,
  sizes,
  customizationBusy,
  checkoutBusy,
  onCreateDetail,
  onRemoveDetail,
  onSelectTaste,
  onUnselectTaste,
  onSelectSize,
}: CustomizationModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !customizationBusy && onOpenChange(next)}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-32px)] overflow-y-auto p-6 sm:max-w-[560px]"
      >
        <DialogHeader className="gap-3">
          <DialogTitle className="font-sans !text-xl !leading-6">
            Muokkaa tilausta
          </DialogTitle>
          <DialogDescription>
            Valitse maku ja koko. Hinta päivittyy heti.
          </DialogDescription>
        </DialogHeader>

        {customizationBusy && saleTempDetails.length === 0 ? (
          <p
            role="status"
            className="m-0 rounded-md bg-muted p-4 text-muted-foreground"
          >
            Vaihtoehtoja ladataan…
          </p>
        ) : null}

        <table className="block w-full border-separate border-spacing-y-3">
          <tbody className="block space-y-3">
            {saleTempDetails.map((item, index) => (
              <tr
                key={item.id}
                className="block rounded-md border border-border bg-surface p-4"
              >
                <td className="block">
                  <div className="flex items-start justify-between gap-4 rounded-md bg-muted/60 p-3">
                    <div>
                      <p className="m-0 text-sm font-medium">
                        {item.Food.name}
                      </p>
                      <p className="m-0 mt-1 text-xs text-muted-foreground">
                        Annos {index + 1}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-action">
                      {item.Food.price.toLocaleString("fi-FI", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      €
                    </span>
                  </div>
                  {tastes.length > 0 ? (
                    <fieldset className="mt-3">
                      <legend className="mb-1.5 text-xs text-muted-foreground">
                        Maku
                      </legend>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {tastes.map((taste) => {
                          const selected = item.tasteId === taste.id;
                          return (
                            <Button
                              key={taste.id}
                              type="button"
                              variant="outline"
                              aria-pressed={selected}
                              disabled={customizationBusy}
                              onClick={() =>
                                selected
                                  ? onUnselectTaste(item.id, item.saleTempId)
                                  : onSelectTaste(
                                      taste.id,
                                      item.id,
                                      item.saleTempId,
                                    )
                              }
                              className={
                                selected
                                  ? "h-[54px] justify-start border-action bg-muted text-left"
                                  : "h-[54px] justify-start text-left"
                              }
                            >
                              {taste.name}
                            </Button>
                          );
                        })}
                      </div>
                    </fieldset>
                  ) : null}
                  {sizes.filter((size) => size.moneyAdded >= 0).length > 0 ? (
                    <fieldset className="mt-3">
                      <legend className="mb-1.5 text-xs text-muted-foreground">
                        Koko
                      </legend>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {sizes
                          .filter((size) => size.moneyAdded >= 0)
                          .map((size) => {
                            const selected = item.foodSizeId === size.id;
                            return (
                              <Button
                                key={size.id}
                                type="button"
                                variant="outline"
                                aria-label={`+${size.moneyAdded} ${size.name}`}
                                aria-pressed={selected}
                                disabled={customizationBusy || checkoutBusy}
                                onClick={() =>
                                  onSelectSize(
                                    selected ? null : size.id,
                                    item.id,
                                    item.saleTempId,
                                  )
                                }
                                className={
                                  selected
                                    ? "h-[54px] justify-start border-action bg-muted"
                                    : "h-[54px] justify-start"
                                }
                              >
                                {size.name} · +
                                {size.moneyAdded.toLocaleString("fi-FI", {
                                  minimumFractionDigits: 2,
                                })}{" "}
                                €
                              </Button>
                            );
                          })}
                      </div>
                    </fieldset>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-3 !border-transparent !bg-transparent !text-destructive hover:!bg-muted hover:!text-destructive"
                    disabled={customizationBusy}
                    onClick={() => onRemoveDetail(item.id)}
                  >
                    <Trash2 aria-hidden="true" /> Poista annos
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="m-0 text-xs text-muted-foreground">
          Voit lisätä toisen annoksen tai poistaa tämän rivin.
        </p>
        <Button
          type="button"
          variant="default"
          className="w-fit"
          aria-label="Add"
          disabled={customizationBusy || saleTempId === 0}
          onClick={onCreateDetail}
        >
          <Plus aria-hidden="true" /> Lisää annos
        </Button>
        <DialogFooter className="mt-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Peruuta
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button type="button" disabled={customizationBusy}>
              Tallenna
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
