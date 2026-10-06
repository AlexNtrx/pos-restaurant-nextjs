import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { StaffOrder } from "@/lib/orders/contracts";
export function OrderCancelDialog({
  cancelOrder,
  workingId,
  setCancelOrder,
  cancelReason,
  setCancelReason,
  cancel,
}: {
  cancelOrder: StaffOrder | null;
  workingId: number | null;
  setCancelOrder: (order: StaffOrder | null) => void;
  cancelReason: string;
  setCancelReason: (value: string) => void;
  cancel: () => Promise<void>;
}) {
  return (
    <Dialog
      open={cancelOrder !== null}
      onOpenChange={(open) => {
        if (!open && workingId === null) setCancelOrder(null);
      }}
    >
      <DialogContent showCloseButton={workingId === null}>
        <DialogHeader>
          <DialogTitle>Peru tilaus #{cancelOrder?.id}</DialogTitle>
          <DialogDescription>
            Pöytä {cancelOrder?.tableNo}. Peruuttaminen poistaa tilauksen
            aktiivisista jonoista. Anna syy ennen vahvistamista.
          </DialogDescription>
        </DialogHeader>
        <label className="space-y-1 text-sm font-medium">
          Peruutuksen syy
          <textarea
            className="min-h-24 w-full rounded-md border border-border bg-background p-3"
            value={cancelReason}
            maxLength={500}
            disabled={workingId !== null}
            onChange={(event) => setCancelReason(event.target.value)}
          />
        </label>
        <p className="text-xs text-muted-foreground">3–500 merkkiä.</p>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={workingId !== null}
            onClick={() => setCancelOrder(null)}
          >
            Takaisin
          </Button>
          <Button
            variant="destructive"
            disabled={workingId !== null || cancelReason.trim().length < 3}
            onClick={() => void cancel()}
          >
            {workingId !== null ? "Perutaan…" : "Vahvista peruutus"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
