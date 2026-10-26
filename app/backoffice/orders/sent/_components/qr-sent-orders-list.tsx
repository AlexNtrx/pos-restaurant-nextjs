import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { staffOrderStatusLabels } from "@/lib/orders/presentation";
import type { useQrSentOrders } from "../_hooks/use-qr-sent-orders";
import { SentOrdersPanel } from "./sent-orders-panel";

export function QrSentOrdersList({
  filters,
  busy,
  queue,
}: {
  filters: ReactNode;
  busy: boolean;
  queue: ReturnType<typeof useQrSentOrders>;
}) {
  return (
    <SentOrdersPanel
      filters={filters}
      loading={queue.loading}
      error={queue.error}
      empty={queue.orders.length === 0}
    >
      {queue.orders.map((order) => (
        <article
          key={order.id}
          className="flex flex-col gap-3 border-b border-border p-4 text-sm last:border-b-0 sm:p-5 lg:flex-row lg:items-center lg:gap-6"
        >
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">
              Pöytä {order.tableNo} · QR #{order.id} ·{" "}
              {staffOrderStatusLabels[order.status]}
            </h2>
            <ul className="mt-1 space-y-1 text-muted-foreground">
              {order.items.map((item, index) => (
                <li key={index} className="break-words">
                  {item.quantity} × {item.name}
                  {item.modifiers.length > 0 &&
                    ` · ${item.modifiers.map((modifier) => modifier.name).join(", ")}`}
                  {item.note && <p>Huom: {item.note}</p>}
                </li>
              ))}
            </ul>
          </div>
          {order.status === "READY" && (
            <Button
              type="button"
              size="sm"
              className="min-h-11"
              disabled={busy}
              aria-label={`Merkitse tarjoilluksi: tilaus #${order.id}`}
              onClick={() => void queue.serve(order)}
            >
              {queue.workingId === order.id
                ? "Tallennetaan…"
                : "Merkitse tarjoilluksi"}
            </Button>
          )}
        </article>
      ))}
    </SentOrdersPanel>
  );
}
