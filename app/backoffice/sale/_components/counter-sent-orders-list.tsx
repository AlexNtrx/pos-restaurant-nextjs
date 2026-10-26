"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { staffOrderStatusLabels } from "@/lib/orders/presentation";
import type { SentCounterOrder } from "@/lib/sale-contracts";
import { SentOrdersPanel } from "../../orders/sent/_components/sent-orders-panel";
export type SentOrderView = "active" | "history";
type Props = {
  sentView: SentOrderView;
  onViewChange: (view: SentOrderView) => void;
  sentOrders: SentCounterOrder[];
  checkoutBusy: boolean;
  receiptBusy: boolean;
  cartBusy: boolean;
  loading?: boolean;
  error?: string;
  filters: ReactNode;
  onOpenOrder: (orderId: number) => void;
  onCancelOrder: (orderId: number) => void;
  onServeOrder: (order: SentCounterOrder) => void;
  onPayOrder: (order: SentCounterOrder) => void;
  onPrintPrebill: (orderId: number) => void;
  onPrintReceipt: (billId: number) => void;
};

export function CounterSentOrdersList({
  sentView,
  onViewChange,
  sentOrders,
  checkoutBusy,
  receiptBusy,
  cartBusy,
  loading = false,
  error = "",
  filters,
  onOpenOrder,
  onCancelOrder,
  onServeOrder,
  onPayOrder,
  onPrintPrebill,
  onPrintReceipt,
}: Props) {
  return (
    <SentOrdersPanel
      filters={filters}
      view={sentView}
      busy={checkoutBusy}
      onViewChange={onViewChange}
      loading={loading}
      error={error}
      empty={sentOrders.length === 0}
    >
      {sentOrders.map((order) => (
        <article
          key={order.id}
          className="flex flex-col gap-3 border-b border-border p-4 text-sm last:border-b-0 sm:p-5 lg:flex-row lg:items-center lg:gap-6"
        >
          <button
            type="button"
            className="min-h-11 min-w-0 flex-1 rounded-sm text-left outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Näytä tilaus #${order.id}`}
            disabled={checkoutBusy}
            onClick={() => onOpenOrder(order.id)}
          >
            <span className="block font-semibold break-words">
              {order.serviceType === "TAKEAWAY"
                ? `Nouto #${order.id}`
                : `#${order.id}`}{" "}
              ·{" "}
              {staffOrderStatusLabels[
                order.status as keyof typeof staffOrderStatusLabels
              ] ?? "Tila ei saatavilla"}
            </span>
            <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="min-w-0 break-words text-muted-foreground">
                {order.Items.map(
                  (item) => `${item.quantity} × ${item.foodName}`,
                ).join(", ")}
              </span>
              <span className="font-semibold tabular-nums whitespace-nowrap">
                {order.total.toLocaleString("fi-FI", {
                  minimumFractionDigits: 2,
                })}{" "}
                €
              </span>
            </span>
          </button>
          <div className="flex min-w-0 shrink-0 flex-wrap gap-2 lg:max-w-[45%]">
            {order.status === "READY" && (
              <Button
                type="button"
                size="sm"
                className="min-h-11"
                aria-label={`Merkitse tarjoilluksi: tilaus #${order.id}`}
                disabled={checkoutBusy || receiptBusy || cartBusy}
                onClick={() => onServeOrder(order)}
              >
                Merkitse tarjoilluksi
              </Button>
            )}
            {["SUBMITTED", "CONFIRMED"].includes(order.status) && (
              <Button
                type="button"
                size="sm"
                className="min-h-11"
                variant="outline"
                aria-label={`Peruuta tilaus #${order.id}`}
                disabled={checkoutBusy || receiptBusy || cartBusy}
                onClick={() => onCancelOrder(order.id)}
              >
                Peruuta tilaus
              </Button>
            )}
            {order.billSaleId === null &&
            !["REJECTED", "CANCELLED", "PAID", "COMPLETED"].includes(
              order.status,
            ) ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="min-h-11"
                  aria-label={`Maksa tilaus #${order.id}`}
                  disabled={checkoutBusy || receiptBusy || cartBusy}
                  onClick={() => onPayOrder(order)}
                >
                  Maksa tilaus #{order.id}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="min-h-11"
                  variant="outline"
                  aria-label={`Tulosta ennakkokuitti: tilaus #${order.id}`}
                  disabled={checkoutBusy || receiptBusy || cartBusy}
                  onClick={() => onPrintPrebill(order.id)}
                >
                  Tulosta ennakkokuitti
                </Button>
              </>
            ) : order.billSaleId !== null ? (
              <Button
                type="button"
                size="sm"
                className="min-h-11"
                variant="outline"
                aria-label={`Tulosta kuitti: tilaus #${order.id}`}
                disabled={checkoutBusy || receiptBusy}
                onClick={() => onPrintReceipt(order.billSaleId!)}
              >
                Tulosta kuitti
              </Button>
            ) : null}
          </div>
        </article>
      ))}
    </SentOrdersPanel>
  );
}
