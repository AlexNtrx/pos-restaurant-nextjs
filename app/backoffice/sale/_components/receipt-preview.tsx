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
      <DialogContent
        showCloseButton={false}
        className="max-h-[95dvh] overflow-y-auto p-5 sm:max-w-[440px]"
      >
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
          <div className="mx-auto w-full max-w-[320px] overflow-hidden border border-border bg-white">
            <iframe
              src={`${billUrl}#toolbar=0&navpanes=0&view=FitH`}
              title={
                kind === "paid" ? "Kuitin esikatselu" : "Esilaskun esikatselu"
              }
              className="block h-[min(55dvh,520px)] w-full border-0 bg-white"
            />
          </div>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="w-fit !bg-[#f1efea]"
          aria-label={
            lastCompletedBillId && kind === "paid"
              ? `Tulosta kuitti uudelleen #${lastCompletedBillId}`
              : kind === "paid"
                ? "Tulosta kuitti"
                : "Tulosta esilasku"
          }
          onClick={
            lastCompletedBillId && kind === "paid" && onReprint
              ? onReprint
              : () =>
                  billUrl &&
                  window.open(billUrl, "_blank", "noopener,noreferrer")
          }
        >
          <Printer aria-hidden="true" />{" "}
          {kind === "paid" ? "Tulosta kuitti" : "Tulosta esilasku"}
        </Button>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Sulje
            </Button>
          </DialogClose>
          {kind === "paid" && !historical ? (
            <DialogClose asChild>
              <Button type="button">Uusi tilaus</Button>
            </DialogClose>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
