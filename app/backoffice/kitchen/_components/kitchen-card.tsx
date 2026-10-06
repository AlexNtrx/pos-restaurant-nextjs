import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { StaffOrder } from "@/lib/orders/contracts";
export const timeFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  hour: "2-digit",
  minute: "2-digit",
});
function elapsed(submittedAt: string, now: number) {
  const seconds = Math.max(
    0,
    Math.floor((now - Date.parse(submittedAt)) / 1000),
  );
  if (seconds >= 3600)
    return `${Math.floor(seconds / 3600)} h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")} min`;
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

// EN: The clock updates every second; unchanged item content does not need to render again.
// FI: Kello päivittyy joka sekunti; muuttumatonta annossisältöä ei tarvitse piirtää uudelleen.
const KitchenItems = memo(function KitchenItems({
  items,
}: {
  items: StaffOrder["items"];
}) {
  return (
    <div className="flex-1 space-y-2 px-4 py-4 text-[14px] leading-5 text-[#2c2b27]">
      {items.map((item, index) => (
        <div key={index}>
          <p className="font-medium">
            {item.name} × {item.quantity}
          </p>
          {item.modifiers.length > 0 && (
            <p className="text-[12px] text-[#767168]">
              {item.modifiers.map((modifier) => modifier.name).join(", ")}
            </p>
          )}
          {item.note && (
            <p className="mt-2 border-l-[3px] border-[#a68c62] pl-2 text-[12px] text-[#6b5840]">
              Huomio: {item.note}
            </p>
          )}
        </div>
      ))}
    </div>
  );
});

export function KitchenCard({
  order,
  now,
  saving,
  canServe,
  onAction,
}: {
  order: StaffOrder;
  now: number;
  saving: boolean;
  canServe: boolean;
  onAction: (nextStatus: "PREPARING" | "READY" | "SERVED") => void;
}) {
  return (
    <Card
      size="sm"
      className="min-h-[224px] min-w-0 gap-0 rounded-[8px] border-[#d8d4cc] bg-[#fbfaf7] py-0 shadow-none"
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <h3 className="font-sans text-[18px] leading-6 font-semibold">
            {order.serviceType === "TAKEAWAY"
              ? `Nouto #${order.id}`
              : `#${order.id}`}
          </h3>
          <p className="mt-1 text-[12px] leading-5 text-[#767168]">
            {order.channel === "QR"
              ? "QR"
              : order.channel === "STAFF"
                ? "Tarjoilija"
                : order.serviceType === "TAKEAWAY"
                  ? "Mukaan"
                  : "Kassa"}
            {order.tableNo == null ? "" : ` · Pöytä ${order.tableNo}`} ·{" "}
            {timeFormatter.format(new Date(order.submittedAt))}
          </p>
        </div>
        <span className="shrink-0 rounded-[5px] bg-[#f1efea] px-2 py-1 font-sans text-[11px] text-[#514f49]">
          {order.status === "READY"
            ? timeFormatter.format(new Date(order.updatedAt))
            : elapsed(order.submittedAt, now)}
        </span>
      </div>
      <KitchenItems items={order.items} />
      <div className="px-4 pb-3">
        {order.status === "CONFIRMED" ? (
          <Button
            className="h-9 w-full rounded-[5px] bg-[#e7e5de] text-[12px] text-[#514f49] hover:bg-[#d8d4cc]"
            disabled={saving}
            onClick={() => onAction("PREPARING")}
          >
            Aloita
          </Button>
        ) : order.status === "PREPARING" ? (
          <Button
            className="h-9 w-full rounded-[5px] bg-[#e7e5de] text-[12px] text-[#514f49] hover:bg-[#d8d4cc]"
            disabled={saving}
            onClick={() => onAction("READY")}
          >
            Merkitse valmiiksi
          </Button>
        ) : canServe ? (
          <Button
            className="h-9 w-full rounded-[5px] bg-[#e4e5e2] text-[12px] text-[#514f49] hover:bg-[#d8d4cc]"
            disabled={saving}
            onClick={() => onAction("SERVED")}
          >
            Merkitse tarjoilluksi
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
