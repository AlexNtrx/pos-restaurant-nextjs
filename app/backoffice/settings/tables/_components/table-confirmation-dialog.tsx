"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Confirmation } from "./types";

type Props = {
  confirmation: Confirmation | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function TableConfirmationDialog({
  confirmation,
  busy,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog
      open={confirmation !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {confirmation?.kind === "rotate"
              ? "Luo uusi QR-koodi?"
              : confirmation?.kind === "close"
                ? "Sulje istunto?"
                : "Poista pöytä?"}
          </DialogTitle>
          <DialogDescription>
            {confirmation?.kind === "rotate"
              ? "Vanha QR-koodi lakkaa toimimasta heti. Tulosta ja jaa uusi koodi."
              : confirmation?.kind === "close"
                ? "QR-koodi lakkaa toimimasta. Istuntoa ei voi sulkea, jos tilauksia on vielä maksamatta."
                : "Pöytä poistuu aktiivisten pöytien listalta. Historiatiedot säilyvät."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Peruuta
          </Button>
          <Button disabled={busy} onClick={onConfirm}>
            {busy ? "Odota…" : "Vahvista"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
