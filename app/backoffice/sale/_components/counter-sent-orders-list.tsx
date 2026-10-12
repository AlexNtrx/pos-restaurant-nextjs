"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { staffOrderStatusLabels } from "@/lib/orders/presentation";
import type { SentCounterOrder } from "@/lib/sale-contracts";
export type SentOrderView = "active" | "history";
type Props = {
  sentOrders: SentCounterOrder[];
  sentView: SentOrderView;
  checkoutBusy: boolean;
  receiptBusy: boolean;
  cartBusy: boolean;
  loading?: boolean;
  error?: string;
  filters: ReactNode;
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
  loading = false,
  error = "",
  filters,
  onRefresh,
  onViewChange,
  onOpenOrder,
  onPayOrder,
  onPrintPrebill,
  onPrintReceipt,
}: Props) {
  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-surface"
      aria-label="Lähetetyt tilaukset"
      aria-busy={loading}
    >
      {/* EN: Keep scope, view and refresh together; wrap the toolbar without shrinking touch targets. */}
      {/* FI: Pidä rajaus, näkymä ja päivitys yhdessä; rivitä työkalupalkki pienentämättä kosketuskohteita. */}
      <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:p-5">
        {filters}
        <div className="flex items-center gap-3">
          <div className="flex gap-2" role="group" aria-label="Tilausnäkymä">
            {(["active", "history"] as const).map((view) => (
              <Button
                key={view}
                type="button"
                className="min-h-11"
                variant={sentView === view ? "default" : "outline"}
                aria-pressed={sentView === view}
                disabled={checkoutBusy}
                onClick={() => onViewChange(view)}
              >
                {view === "active" ? "Käynnissä" : "Historia"}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={checkoutBusy}
            onClick={onRefresh}
          >
            Päivitä
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="p-4 text-sm text-destructive sm:p-5">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="p-6 text-sm text-muted-foreground">
          Tilauksia ladataan…
        </p>
      )}
      {!loading && !error && sentOrders.length === 0 ? (
        <p className="flex min-h-40 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {sentView === "active"
            ? "Ei keskeneräisiä tilauksia."
            : "Ei päättyneitä tilauksia."}
        </p>
      ) : null}
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
            <span className="flex flex-wrap justify-between gap-x-4 gap-y-1 font-semibold">
              <span className="min-w-0 break-words">
                {order.serviceType === "TAKEAWAY"
                  ? `Nouto #${order.id}`
                  : `#${order.id}`}{" "}
                ·{" "}
                {staffOrderStatusLabels[
                  order.status as keyof typeof staffOrderStatusLabels
                ] ?? "Tila ei saatavilla"}
              </span>
              <span className="shrink-0 tabular-nums">
                {order.total.toLocaleString("fi-FI", {
                  minimumFractionDigits: 2,
                })}{" "}
                €
              </span>
            </span>
            <span className="mt-1 block break-words text-muted-foreground">
              {order.Items.map(
                (item) => `${item.quantity} × ${item.foodName}`,
              ).join(", ")}
            </span>
          </button>
          <div className="flex min-w-0 shrink-0 flex-wrap gap-2 lg:max-w-[45%]">
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
    </section>
  );
}
