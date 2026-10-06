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
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { FoodCategory } from "@/lib/catalog-contracts";
import type { ManagementKind, ManagementRow } from "./catalog-management-types";
interface Props {
  kind: ManagementKind;
  config: { singular: string };
  editorOpen: boolean;
  isSaving: boolean;
  editing: ManagementRow | null;
  foodTypeId: number | null;
  categories: FoodCategory[];
  name: string;
  remark: string;
  moneyAdded: string;
  formError: string;
  setEditorOpen: (open: boolean) => void;
  setFoodTypeId: (id: number) => void;
  setName: (name: string) => void;
  setRemark: (remark: string) => void;
  setMoneyAdded: (amount: string) => void;
  save: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}
export function CatalogManagementEditor({
  kind,
  config,
  editorOpen,
  isSaving,
  editing,
  foodTypeId,
  categories,
  name,
  remark,
  moneyAdded,
  formError,
  setEditorOpen,
  setFoodTypeId,
  setName,
  setRemark,
  setMoneyAdded,
  save,
}: Props) {
  const requiresCategory = kind !== "categories";
  return (
    <Dialog
      open={editorOpen}
      onOpenChange={(open) => !isSaving && setEditorOpen(open)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Muokkaa" : "Lisää"} {config.singular}
          </DialogTitle>
          <DialogDescription>
            Täytä tiedot ja tallenna muutokset.
          </DialogDescription>
        </DialogHeader>
        <form id={`${kind}-form`} className="grid gap-4" onSubmit={save}>
          {requiresCategory && (
            <FormField id={`${kind}-category`} label="Kategoria" required>
              <select
                className="h-10 w-full rounded-md border border-border bg-surface px-3"
                value={foodTypeId ?? ""}
                onChange={(event) => setFoodTypeId(Number(event.target.value))}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <FormField
            id={`${kind}-name`}
            label="Nimi"
            required
            error={formError && !name.trim() ? formError : undefined}
          >
            <Input
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          {kind === "size-options" && (
            <FormField id="size-money-added" label="Hinnanlisä" required>
              <Input
                type="number"
                min="0"
                step="1"
                value={moneyAdded}
                onChange={(event) => setMoneyAdded(event.target.value)}
              />
            </FormField>
          )}
          <FormField id={`${kind}-remark`} label="Huomautus">
            <Input
              value={remark}
              maxLength={500}
              onChange={(event) => setRemark(event.target.value)}
            />
          </FormField>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            disabled={isSaving}
            onClick={() => setEditorOpen(false)}
          >
            Peruuta
          </Button>
          <Button type="submit" form={`${kind}-form`} disabled={isSaving}>
            {isSaving ? "Tallennetaan…" : "Tallenna"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
