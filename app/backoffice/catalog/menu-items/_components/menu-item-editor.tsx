"use client";

import type { FormEvent, Ref } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { FoodCategory, FoodKind } from "@/lib/catalog-contracts";

type MenuItemDraft = {
  foodTypeId: number | null;
  name: string;
  price: string;
  foodKind: FoodKind;
  remark: string;
};
type ImageField = {
  fileName: string;
  selectedFile: File | null;
  onSelect: (file: File | null) => void;
};
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  saving: boolean;
  draft: MenuItemDraft;
  onDraftChange: {
    [Key in keyof MenuItemDraft]: (value: MenuItemDraft[Key]) => void;
  };
  categories: FoodCategory[];
  listImageInputRef: Ref<HTMLInputElement>;
  detailImageInputRef: Ref<HTMLInputElement>;
  listImage: ImageField;
  detailImage: ImageField & { onRemove: () => void };
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function MenuItemEditor({
  open,
  onOpenChange,
  editing,
  saving,
  draft,
  onDraftChange,
  categories,
  listImageInputRef,
  detailImageInputRef,
  listImage,
  detailImage,
  error,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(open) => !saving && onOpenChange(open)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Muokkaa ruokalajia" : "Lisää ruokalaji"}
          </DialogTitle>
          <DialogDescription>
            Ruokalajin tiedot, kuva ja myyntityyppi.
          </DialogDescription>
        </DialogHeader>
        {/* EN: Keep the submitted draft stable during upload and save. */}
        {/* FI: Säilytä lähetetty luonnos muuttumattomana latauksen ja tallennuksen aikana. */}
        <form
          aria-busy={saving}
          id="menu-item-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={onSubmit}
        >
          <FormField
            id="menu-item-category"
            label="Kategoria"
            required
            className="sm:col-span-2"
          >
            <select
              disabled={saving}
              className="h-10 w-full rounded-md border border-border bg-surface px-3"
              value={draft.foodTypeId ?? ""}
              onChange={(event) =>
                onDraftChange.foodTypeId(Number(event.target.value))
              }
            >
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="menu-item-name" label="Nimi" required>
            <Input
              disabled={saving}
              value={draft.name}
              maxLength={120}
              onChange={(event) => onDraftChange.name(event.target.value)}
            />
          </FormField>
          <FormField id="menu-item-price" label="Hinta" required>
            <Input
              disabled={saving}
              type="number"
              min="0"
              step="1"
              value={draft.price}
              onChange={(event) => onDraftChange.price(event.target.value)}
            />
          </FormField>
          <FormField id="menu-item-kind" label="Tyyppi" required>
            <select
              disabled={saving}
              className="h-10 w-full rounded-md border border-border bg-surface px-3"
              value={draft.foodKind}
              onChange={(event) =>
                onDraftChange.foodKind(event.target.value as FoodKind)
              }
            >
              <option value="food">Ruoka</option>
              <option value="drink">Juoma</option>
            </select>
          </FormField>
          <FormField
            id="menu-item-image"
            label="Ruokalistan kuva"
            description="Näkyy ruokalistassa. JPEG, PNG, WEBP tai GIF, enintään 5 MB, 24 megapikseliä ja 8000 px/sivu."
          >
            <Input
              disabled={saving}
              ref={listImageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(event) =>
                listImage.onSelect(event.target.files?.[0] ?? null)
              }
            />
          </FormField>
          <FormField
            id="menu-item-detail-image"
            label="Lisätietokuva"
            description="Näkyy Lisätiedot-ikkunassa. JPEG, PNG, WEBP tai GIF, enintään 5 MB, 24 megapikseliä ja 8000 px/sivu."
          >
            <Input
              disabled={saving}
              ref={detailImageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(event) =>
                detailImage.onSelect(event.target.files?.[0] ?? null)
              }
            />
          </FormField>
          <FormField
            id="menu-item-remark"
            label="Huomautus"
            className="sm:col-span-2"
          >
            <Input
              disabled={saving}
              value={draft.remark}
              maxLength={500}
              onChange={(event) => onDraftChange.remark(event.target.value)}
            />
          </FormField>
          {listImage.fileName && !listImage.selectedFile && (
            <p className="text-xs text-muted-foreground">
              Nykyinen ruokalistan kuva säilytetään, jos uutta ei valita.
            </p>
          )}
          {detailImage.fileName && !detailImage.selectedFile && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted-foreground">
                Nykyinen lisätietokuva säilytetään, jos uutta ei valita.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => detailImage.onRemove()}
              >
                Poista lisätietokuva
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="sm:col-span-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Peruuta
          </Button>
          <Button
            type="submit"
            form="menu-item-form"
            disabled={saving || !draft.foodTypeId}
          >
            {saving ? "Tallennetaan…" : "Tallenna"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
