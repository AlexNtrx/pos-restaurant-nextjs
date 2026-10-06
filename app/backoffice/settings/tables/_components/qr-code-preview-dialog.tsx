"use client";

import Image from "next/image";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatTableDate } from "../_lib/table-date";
import type { QrPreview } from "./types";

type Props = {
  preview: QrPreview | null;
  onClose: () => void;
  onPrint: () => void;
};

export function QrCodePreviewDialog({ preview, onClose, onPrint }: Props) {
  return (
    <Dialog
      open={preview !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pöytä {preview?.tableNo} · QR-koodi</DialogTitle>
          <DialogDescription>
            Voimassa {preview ? formatTableDate(preview.expiresAt) : ""} asti.
            Älä jaa linkkiä julkisesti.
          </DialogDescription>
        </DialogHeader>
        {preview && (
          <div className="flex flex-col items-center gap-3">
            {/* EN: The QR image comes from the authenticated staff response and is generated locally. */}
            {/* FI: QR-kuva tulee tunnistetun henkilökunnan vastauksesta ja luodaan paikallisesti. */}
            <Image
              src={preview.image}
              alt={`Pöydän ${preview.tableNo} QR-koodi`}
              width={288}
              height={288}
              unoptimized
            />
            <p className="break-all text-center text-xs text-muted-foreground">
              {preview.url}
            </p>
            <p className="text-center text-xs text-muted-foreground">
              Jaa QR-koodi vasta käyttöönoton jälkeen.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Sulje
          </Button>
          <Button onClick={onPrint}>
            <Printer aria-hidden="true" /> Tulosta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
