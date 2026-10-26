"use client";

import { staffOrderStatusLabels as labels } from "@/lib/orders/presentation";
import { useState } from "react";

import { OrderItemDetails } from "@/components/orders/order-item-details";
import { OrderRefund } from "@/components/orders/order-refund";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StaffOrderDetail } from "@/lib/orders/contracts";

const currency = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});
const localTime = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  dateStyle: "short",
  timeStyle: "short",
});

type Props = {
  orderId: number | null;
  detail: StaffOrderDetail | null;
  error: string;
  cancelling: boolean;
  serving: boolean;
  refundBusy: boolean;
  initialCancelOpen?: boolean;
  onClose: () => void;
  onRetry: () => void;
  onCancel: (reason: string) => void;
  onServe: () => void;
  onRefundChanged: () => Promise<void>;
  onRefundBusyChange: (busy: boolean) => void;
};

export default function SentOrderDetails({
  orderId,
  detail,
  error,
  cancelling,
  serving,
  refundBusy,
  initialCancelOpen = false,
  onClose,
  onRetry,
  onCancel,
  onServe,
  onRefundChanged,
  onRefundBusyChange,
}: Props) {
  const [cancelOpen, setCancelOpen] = useState(initialCancelOpen);
  const [reason, setReason] = useState("");
  // EN: The cashier can cancel only before Kitchen preparation and before a receipt exists; the API checks this again.
  // FI: Kassatyöntekijä voi perua vain ennen keittiövalmistelua ja kuitin syntymistä; API tarkistaa tämän uudelleen.
  const canCancel =
    detail !== null &&
    detail.paidAt === null &&
    ["SUBMITTED", "CONFIRMED"].includes(detail.status);

  return (
    <Dialog
      open={orderId !== null}
      onOpenChange={(open) =>
        !open && !cancelling && !serving && !refundBusy && onClose()
      }
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tilaus #{orderId}</DialogTitle>
          <DialogDescription>
            {detail
              ? `${detail.serviceType === "TAKEAWAY" ? `Nouto #${detail.id}` : `Pöytä ${detail.tableNo}`} · ${localTime.format(new Date(detail.submittedAt))}`
              : "Keittiöön lähetetyn tilauksen tiedot"}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {detail ? (
          <>
            <div className="flex items-center gap-2">
              <StatusBadge tone="neutral">{labels[detail.status]}</StatusBadge>
              {detail.paidAt && (
                <StatusBadge tone="success">Maksettu</StatusBadge>
              )}
            </div>
            <OrderItemDetails items={detail.items} currency={currency} />
            <p className="text-right font-semibold">
              Yhteensä {currency.format(detail.total)}
            </p>
            {detail.paidAt && (
              <OrderRefund
                key={detail.id}
                order={detail}
                onChanged={onRefundChanged}
                onBusyChange={onRefundBusyChange}
              />
            )}
            <div className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Tapahtumat</p>
              {detail.history.map((event) => (
                <p key={event.version}>
                  {localTime.format(new Date(event.at))} ·{" "}
                  {labels[event.toStatus]}
                  {event.reason ? ` · ${event.reason}` : ""}
                </p>
              ))}
            </div>
            {detail.status === "READY" && (
              <Button
                type="button"
                className="min-h-11"
                disabled={serving || cancelling}
                onClick={onServe}
              >
                {serving ? "Tallennetaan…" : "Merkitse tarjoilluksi"}
              </Button>
            )}
            {canCancel && !cancelOpen && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setCancelOpen(true)}
              >
                Peruuta tilaus
              </Button>
            )}
            {canCancel && cancelOpen && (
              <div className="space-y-3 border-t border-border pt-3">
                <label className="block space-y-1 text-sm">
                  <span>Peruutuksen syy (3–500 merkkiä)</span>
                  <textarea
                    className="min-h-24 w-full rounded-md border border-border bg-surface p-2"
                    maxLength={500}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={cancelling}
                    onClick={() => setCancelOpen(false)}
                  >
                    Takaisin
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={
                      cancelling ||
                      reason.trim().length < 3 ||
                      reason.trim().length > 500
                    }
                    onClick={() => onCancel(reason.trim())}
                  >
                    {cancelling ? "Peruutetaan…" : "Vahvista peruutus"}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </>
        ) : error ? (
          <Button type="button" onClick={onRetry}>
            Yritä uudelleen
          </Button>
        ) : (
          <LoadingState title="Tilausta ladataan" />
        )}
      </DialogContent>
    </Dialog>
  );
}
