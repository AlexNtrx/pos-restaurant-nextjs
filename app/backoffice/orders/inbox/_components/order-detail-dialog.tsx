import { OrderItemDetails } from "@/components/orders/order-item-details";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/states";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { StaffOrderDetail } from "@/lib/orders/contracts";
import {
  currency,
  localTime,
  actionText,
  statusText,
  type ActionStatus,
} from "../_lib/presentation";
export function OrderDetailDialog({
  selectedId,
  detail,
  saving,
  detailError,
  action,
  reason,
  setAction,
  setReason,
  submitAction,
  openDetail,
  onOpenChange,
}: {
  selectedId: number | null;
  detail: StaffOrderDetail | null;
  saving: boolean;
  detailError: string;
  action: ActionStatus | null;
  reason: string;
  setAction: (action: ActionStatus | null) => void;
  setReason: (reason: string) => void;
  submitAction: () => Promise<void>;
  openDetail: (id: number) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={selectedId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tilaus #{selectedId}</DialogTitle>
          <DialogDescription>
            {detail
              ? `${detail.channel === "QR" ? "QR" : detail.channel === "STAFF" ? "Tarjoilija" : "Kassa"} · ${detail.serviceType === "TAKEAWAY" ? `Mukaan · Nouto #${detail.id}` : `Pöytä ${detail.tableNo}`} · ${localTime.format(new Date(detail.submittedAt))}`
              : "Ladataan tilauksen tietoja"}
          </DialogDescription>
        </DialogHeader>
        {detailError && (
          <p role="alert" className="text-sm text-destructive">
            {detailError}
          </p>
        )}
        {detail ? (
          <>
            <StatusBadge
              tone={detail.status === "SUBMITTED" ? "warning" : "neutral"}
            >
              {statusText[detail.status] ?? detail.status}
            </StatusBadge>
            <OrderItemDetails items={detail.items} currency={currency} />
            <p className="text-right font-semibold">
              Yhteensä {currency.format(detail.total)}
            </p>
            <div className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Tapahtumat</p>
              {detail.history.map((event) => (
                <p key={event.version}>
                  {localTime.format(new Date(event.at))} ·{" "}
                  {statusText[event.toStatus] ?? event.toStatus}
                  {event.reason ? ` · ${event.reason}` : ""}
                </p>
              ))}
            </div>
            {detail.status === "SUBMITTED" && !action && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setAction("CONFIRMED")}>Vahvista</Button>
                <Button variant="outline" onClick={() => setAction("REJECTED")}>
                  Hylkää
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    saving ||
                    detail.paidAt !== null ||
                    detail.preparingAt !== null ||
                    !["SUBMITTED", "CONFIRMED"].includes(detail.status)
                  }
                  onClick={() => setAction("CANCELLED")}
                >
                  Peruuta
                </Button>
              </div>
            )}
            {detail.status === "SUBMITTED" && action && (
              <div className="space-y-3 border-t border-border pt-3">
                <p className="font-semibold">{actionText[action]} tilaus?</p>
                {action !== "CONFIRMED" && (
                  <label className="block space-y-1 text-sm">
                    <span>Syy (3–500 merkkiä)</span>
                    <textarea
                      className="min-h-24 w-full rounded-md border border-border bg-surface p-2"
                      maxLength={500}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                )}
                <DialogFooter>
                  <Button
                    variant="outline"
                    disabled={saving}
                    onClick={() => setAction(null)}
                  >
                    Takaisin
                  </Button>
                  <Button
                    variant={action === "CONFIRMED" ? "default" : "destructive"}
                    disabled={
                      saving ||
                      (action !== "CONFIRMED" && reason.trim().length < 3)
                    }
                    onClick={() => void submitAction()}
                  >
                    {saving ? "Tallennetaan…" : actionText[action]}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </>
        ) : !detailError ? (
          <LoadingState title="Tilausta ladataan" />
        ) : (
          <Button
            onClick={() => selectedId !== null && void openDetail(selectedId)}
          >
            Yritä uudelleen
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
