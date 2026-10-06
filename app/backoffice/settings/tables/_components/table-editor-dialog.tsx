"use client";

import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { RestaurantTable } from "./types";

type Props = {
  editor: RestaurantTable | "new" | null;
  tableNo: string;
  tableName: string;
  busy: boolean;
  onClose: () => void;
  onTableNoChange: (value: string) => void;
  onTableNameChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function TableEditorDialog({
  editor,
  tableNo,
  tableName,
  busy,
  onClose,
  onTableNoChange,
  onTableNameChange,
  onSubmit,
}: Props) {
  return (
    <Dialog
      open={editor !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editor === "new" ? "Lisää pöytä" : "Muokkaa pöytää"}
          </DialogTitle>
          <DialogDescription>
            Anna pöydälle yksilöllinen numero ja halutessasi nimi.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block space-y-1 text-sm font-medium">
            Pöydän numero
            <Input
              type="number"
              min={1}
              max={10000}
              required
              value={tableNo}
              onChange={(event) => onTableNoChange(event.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Nimi (valinnainen)
            <Input
              maxLength={80}
              value={tableName}
              onChange={(event) => onTableNameChange(event.target.value)}
            />
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Peruuta
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Tallennetaan…" : "Tallenna"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
