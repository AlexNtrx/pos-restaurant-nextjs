import { Minus, Plus, Settings2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SaleTemp } from "@/lib/sale-contracts";

type CartSidebarProps = {
  items: SaleTemp[];
  cartBusy: boolean;
  customizationBusy: boolean;
  checkoutBusy: boolean;
  onQuantityChange: (id: number, quantity: number) => void;
  onRemove: (id: number) => void;
  onCustomize: (item: SaleTemp) => void;
};

export default function CartSidebar({
  items,
  cartBusy,
  customizationBusy,
  checkoutBusy,
  onQuantityChange,
  onRemove,
  onCustomize,
}: CartSidebarProps) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {items.map((item) => (
        <article className="py-4" key={item.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 truncate text-sm font-medium text-foreground">
                {item.Food.name}
              </p>
              <p className="m-0 mt-1 text-xs text-muted-foreground">
                {item.qty} ×{" "}
                {item.Food.price.toLocaleString("fi-FI", {
                  minimumFractionDigits: 2,
                })}{" "}
                €
              </p>
            </div>
            <strong className="shrink-0 text-sm font-semibold">
              {item.pricing.total.toLocaleString("fi-FI", {
                minimumFractionDigits: 2,
              })}{" "}
              €
            </strong>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex h-8 items-center rounded-md border border-border bg-surface">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Decrease ${item.Food.name}`}
                disabled={item.qty <= 1 || cartBusy || checkoutBusy}
                onClick={() => onQuantityChange(item.id, item.qty - 1)}
              >
                <Minus aria-hidden="true" />
              </Button>
              <span className="w-8 text-center text-sm font-semibold">
                {item.qty}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Increase ${item.Food.name}`}
                disabled={cartBusy || checkoutBusy}
                onClick={() => onQuantityChange(item.id, item.qty + 1)}
              >
                <Plus aria-hidden="true" />
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Customize"
                disabled={cartBusy || customizationBusy || checkoutBusy}
                onClick={() => onCustomize(item)}
              >
                <Settings2 aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove"
                disabled={cartBusy || checkoutBusy}
                onClick={() => onRemove(item.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
