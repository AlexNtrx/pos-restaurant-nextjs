"use client";

import { Button } from "@/components/ui/button";
import type { SentCounterOrder } from "@/lib/sale-contracts";
export type SentOrderView = "active" | "history";
type Props = {
  sentOrders: SentCounterOrder[];
  sentView: SentOrderView;
  checkoutBusy: boolean;
  receiptBusy: boolean;
  cartBusy: boolean;
  onRefresh: () => void;
  onViewChange: (view: SentOrderView) => void;
  onOpenOrder: (orderId: number) => void;
  onPayOrder: (order: SentCounterOrder) => void;
  onPrintPrebill: (orderId: number) => void;
  onPrintReceipt: (billId: number) => void;
};

export function CounterSentOrdersList({
  sentOrders,
  sentView,
  checkoutBusy,
  receiptBusy,
  cartBusy,
  onRefresh,
  onViewChange,
  onOpenOrder,
  onPayOrder,
  onPrintPrebill,
  onPrintReceipt,
}: Props) {
  return (
    <section
      className="mt-6 border-t border-border pt-4"
      aria-label="Sent orders"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Keittiöön lähetetyt</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={checkoutBusy}
          onClick={onRefresh}
        >
          Päivitä
        </Button>
      </div>
      <div
        className="mt-3 flex gap-2"
        role="group"
        aria-label="Sent order view"
      >
        {(["active", "history"] as const).map((view) => (
          <Button
            key={view}
            type="button"
            size="sm"
            variant={sentView === view ? "default" : "outline"}
            aria-pressed={sentView === view}
            disabled={checkoutBusy}
            onClick={() => onViewChange(view)}
          >
            {view === "active" ? "Käynnissä" : "Historia"}
          </Button>
        ))}
      </div>
      {sentOrders.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {sentView === "active"
            ? "Ei keskeneräisiä tilauksia."
            : "Ei päättyneitä tilauksia."}
        </p>
      ) : null}
      {sentOrders.map((order) => (
        <article
          key={order.id}
          className="mt-3 rounded-md border border-border p-3 text-xs"
        >
          <button
            type="button"
            className="w-full text-left hover:text-primary"
            aria-label={`View Order #${order.id}`}
            onClick={() => onOpenOrder(order.id)}
          >
            <span className="flex justify-between font-semibold">
              <span>
                {order.serviceType === "TAKEAWAY"
                  ? `Nouto #${order.id}`
                  : `#${order.id}`}{" "}
                · {order.status}
              </span>
              <span>
                {order.total.toLocaleString("fi-FI", {
                  minimumFractionDigits: 2,
                })}{" "}
                €
              </span>
            </span>
            <span className="mt-1 block text-muted-foreground">
              {order.Items.map(
                (item) => `${item.quantity} × ${item.foodName}`,
              ).join(", ")}
            </span>
          </button>
          <div className="mt-2 flex flex-wrap gap-2">
            {order.billSaleId === null &&
            !["REJECTED", "CANCELLED", "PAID", "COMPLETED"].includes(
              order.status,
            ) ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  aria-label={`Pay Order #${order.id}`}
                  disabled={checkoutBusy || receiptBusy || cartBusy}
                  onClick={() => onPayOrder(order)}
                >
                  Maksa tilaus #{order.id}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`Print Order #${order.id}`}
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
                variant="outline"
                aria-label={`Print paid Order #${order.id}`}
                disabled={checkoutBusy || receiptBusy}
                onClick={() => onPrintReceipt(order.billSaleId!)}
              >
                Tulosta kuitti
              </Button>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
}
