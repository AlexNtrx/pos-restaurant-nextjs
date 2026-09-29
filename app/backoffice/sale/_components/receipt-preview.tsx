import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ReceiptPreviewProps = {
  billUrl: string;
  kind: "prebill" | "paid";
  historical?: boolean;
  onClose: () => void;
  lastCompletedBillId: number | null;
  onReprint?: () => void;
};

export default function ReceiptPreview({
  billUrl,
  kind,
  historical = false,
  onClose,
  lastCompletedBillId,
  onReprint,
}: ReceiptPreviewProps) {
  return (
    <Dialog open={Boolean(billUrl)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="p-6 sm:max-w-[560px]">
        <DialogHeader className="gap-3">
          <DialogTitle className="font-sans !text-xl !leading-6">
            {historical
              ? "Kuitin kopio"
              : kind === "paid"
                ? "Kuitti valmis"
                : "Esilasku valmis"}
          </DialogTitle>
          <DialogDescription>
            {historical
              ? "Aiemmin maksettu kuitti on valmis tulostettavaksi."
              : kind === "paid"
                ? "Maksu hyväksyttiin ja kuitti on valmis."
                : "Esilasku on valmis tulostettavaksi."}
          </DialogDescription>
        </DialogHeader>
        <p className="m-0 text-sm font-medium text-[#5f7f65]">
          {historical
            ? "Kuitin uudelleentulostus"
            : kind === "paid"
              ? "Maksu hyväksytty"
              : "Esilasku"}
        </p>
        {billUrl ? (
          <iframe
            src={billUrl}
            title="Receipt PDF"
            className="h-[280px] w-full rounded-md border border-border bg-white"
          />
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="w-fit !bg-[#f1efea]"
          aria-label={
            lastCompletedBillId && kind === "paid"
              ? `Reprint Receipt #${lastCompletedBillId}`
              : "Print receipt"
          }
          onClick={
            lastCompletedBillId && kind === "paid" && onReprint
              ? onReprint
              : () =>
                  billUrl &&
                  window.open(billUrl, "_blank", "noopener,noreferrer")
          }
        >
          <Printer aria-hidden="true" /> Tulosta kuitti
        </Button>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Sulje
            </Button>
          </DialogClose>
          {kind === "paid" && !historical ? (
            <DialogClose asChild>
              <Button type="button">Uusi</Button>
            </DialogClose>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
