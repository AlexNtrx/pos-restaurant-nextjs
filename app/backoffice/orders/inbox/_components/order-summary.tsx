import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StaffOrder } from "@/lib/orders/contracts";
import { currency, statusText } from "../_lib/presentation";
function elapsed(minutes: number) {
  if (minutes < 1) return "juuri nyt";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function OrderSummary({
  order,
  onOpen,
  now,
}: {
  order: StaffOrder;
  onOpen: (id: number) => void;
  now: number;
}) {
  const age = Math.max(
    0,
    Math.floor((now - Date.parse(order.submittedAt)) / 60_000),
  );
  return (
    <article className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-heading text-lg font-semibold">
            Tilaus #{order.id}
          </h2>
          <p className="text-xs text-muted-foreground">
            {order.channel === "QR"
              ? "QR"
              : order.channel === "STAFF"
                ? "Tarjoilija"
                : "Kassa"}{" "}
            ·{" "}
            {order.serviceType === "TAKEAWAY"
              ? `Mukaan · Nouto #${order.id}`
              : `Pöytä ${order.tableNo}`}{" "}
            · {elapsed(age)}
          </p>
        </div>
        <StatusBadge
          tone={
            order.status === "REJECTED" || order.status === "CANCELLED"
              ? "danger"
              : "warning"
          }
        >
          {statusText[order.status] ?? order.status}
        </StatusBadge>
      </div>
      <ul className="space-y-2 text-sm">
        {order.items.map((item, index) => (
          <li key={index}>
            <span className="font-medium">
              {item.quantity} × {item.name}
            </span>
            {item.modifiers.length > 0 && (
              <p className="pl-5 text-xs text-muted-foreground">
                {item.modifiers.map((modifier) => modifier.name).join(", ")}
              </p>
            )}
            {item.note && (
              <p className="pl-5 text-xs text-foreground">Huom: {item.note}</p>
            )}
          </li>
        ))}
      </ul>
      {(order.rejectionReason || order.cancellationReason) && (
        <p className="text-xs text-destructive">
          Syy: {order.rejectionReason || order.cancellationReason}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="font-semibold">{currency.format(order.total)}</span>
        <Button size="sm" onClick={() => onOpen(order.id)}>
          Avaa
        </Button>
      </div>
    </article>
  );
}
