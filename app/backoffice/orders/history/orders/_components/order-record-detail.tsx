import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LoadingState } from "@/components/ui/states";
import type { StaffOrderDetail } from "@/lib/orders/contracts";
import {
  currency,
  formatTime,
  statusLabels,
  lifecycleFields,
} from "../_lib/presentation";
import { OrderRefund } from "@/components/orders/order-refund";

export function OrderRecordDetail({
  selectedId,
  detail,
  detailError,
  onOpenChange,
  onChanged,
}: {
  selectedId: number | null;
  detail: StaffOrderDetail | null;
  detailError: string;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  return (
    <Dialog open={selectedId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tilaus #{selectedId}</DialogTitle>
          <DialogDescription>
            {detail
              ? `${detail.serviceType === "TAKEAWAY" ? `Mukaan · Nouto #${detail.id}` : `${detail.channel === "QR" ? "QR" : detail.channel === "STAFF" ? "Tarjoilija" : "Kassa"} · pöytä ${detail.tableNo}`} · ${statusLabels[detail.status]}`
              : "Tilauksen tiedot"}
          </DialogDescription>
        </DialogHeader>
        {detailError ? (
          <p role="alert" className="text-sm text-destructive">
            {detailError}
          </p>
        ) : !detail ? (
          <LoadingState title="Tilausta ladataan" />
        ) : (
          <div className="space-y-5 text-sm">
            <OrderRefund key={detail.id} order={detail} onChanged={onChanged} />
            <p className="font-medium">
              Tilauksen summa: {currency.format(detail.total)} ·{" "}
              {detail.tableSessionId
                ? `istunto #${detail.tableSessionId}`
                : "ei pöytäistuntoa"}
            </p>
            {(detail.rejectionReason || detail.cancellationReason) && (
              <p className="text-destructive">
                Syy: {detail.rejectionReason || detail.cancellationReason}
              </p>
            )}
            <ul className="space-y-2">
              {detail.items.map((item, index) => (
                <li key={index}>
                  {item.quantity} × {item.name} ·{" "}
                  {currency.format(item.lineTotal)}
                  {item.modifiers.length > 0
                    ? ` · ${item.modifiers.map((modifier) => modifier.name).join(", ")}`
                    : ""}
                  {item.note ? ` · ${item.note}` : ""}
                </li>
              ))}
            </ul>
            <section aria-label="Tilauksen vaiheet">
              <h3 className="font-semibold">Vaiheet</h3>
              <dl className="mt-2 grid grid-cols-2 gap-2">
                {lifecycleFields.map(
                  ([key, label]) =>
                    detail[key] && (
                      <div key={key}>
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd>{formatTime(detail[key]!)}</dd>
                      </div>
                    ),
                )}
              </dl>
            </section>
            <section aria-label="Tilahistoria">
              <h3 className="font-semibold">Tilahistoria</h3>
              <ol className="mt-2 space-y-1">
                {detail.history.map((event) => (
                  <li key={event.version}>
                    #{event.version} {statusLabels[event.toStatus]} ·{" "}
                    {formatTime(event.at)}
                    {event.reason ? ` · ${event.reason}` : ""}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
