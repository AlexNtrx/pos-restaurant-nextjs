import { Button } from "@/components/ui/button";
import type { StaffOrder } from "@/lib/orders/contracts";
import { canCancelOrder } from "../_lib/can-cancel-order";
const orderStages = [
  { status: "SUBMITTED", label: "Saapunut" },
  { status: "CONFIRMED", label: "Vahvistettu" },
  { status: "PREPARING", label: "Valmistelussa" },
  { status: "READY", label: "Valmis" },
  { status: "SERVED", label: "Tarjoiltu" },
] as const;

export function OrderTracking({
  orders,
  workingId,
  onServe,
  onCancel,
}: {
  orders: StaffOrder[];
  workingId: number | null;
  onServe: (order: StaffOrder) => void;
  onCancel: (order: StaffOrder) => void;
}) {
  return (
    <section className="self-start space-y-3 rounded-xl border border-border bg-surface p-5">
      <div>
        <h2 className="font-heading text-xl font-semibold">
          Tilausten seuranta{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({orders.length})
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">
          Näet jokaisen pöytätilauksen nykyisen vaiheen ja etenemisen.
        </p>
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ei tilauksia.</p>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id} className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    Pöytä {order.tableNo} · Tilaus #{order.id}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {order.channel === "QR"
                      ? "QR"
                      : order.channel === "STAFF"
                        ? "Tarjoilija"
                        : "Kassa"}
                    {" · "}
                    {order.status === "SUBMITTED"
                      ? "Odottaa vahvistusta"
                      : orderStages.find(
                          (stage) => stage.status === order.status,
                        )?.label}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {order.status === "READY" && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={workingId !== null}
                      onClick={() => onServe(order)}
                    >
                      {workingId === order.id
                        ? "Tallennetaan…"
                        : "Merkitse tarjoilluksi"}
                    </Button>
                  )}
                  {canCancelOrder(order) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={workingId !== null}
                      onClick={() => onCancel(order)}
                    >
                      Peru tilaus
                    </Button>
                  )}
                </div>
              </div>
              <ol
                aria-label={`Tilauksen #${order.id} eteneminen`}
                className="mt-3 grid grid-cols-5 gap-1 text-center text-[10px] sm:text-xs"
              >
                {orderStages.map((stage, index) => {
                  const currentIndex = orderStages.findIndex(
                    (candidate) => candidate.status === order.status,
                  );
                  return (
                    <li
                      key={stage.status}
                      aria-current={
                        stage.status === order.status ? "step" : undefined
                      }
                      className={`rounded-md border px-1 py-2 ${
                        index === currentIndex
                          ? "border-primary bg-primary/10 font-semibold text-foreground"
                          : index < currentIndex
                            ? "border-border bg-muted text-foreground"
                            : "border-border text-muted-foreground"
                      }`}
                    >
                      <span className="block">{index + 1}</span>
                      {stage.label}
                    </li>
                  );
                })}
              </ol>
              <ul className="mt-3 space-y-1 text-sm">
                {order.items.map((item, index) => (
                  <li key={index}>
                    {item.quantity} × {item.name}
                    {item.modifiers.length > 0 &&
                      ` · ${item.modifiers.map((modifier) => modifier.name).join(", ")}`}
                    {item.note && (
                      <span className="block text-muted-foreground">
                        Huom: {item.note}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
