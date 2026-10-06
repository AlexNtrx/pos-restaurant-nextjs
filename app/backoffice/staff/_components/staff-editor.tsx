import { Button } from "@/components/ui/button";
import type { StaffUser } from "../_lib/types";
import type { FormEvent } from "react";
import type { UserLevel } from "@/lib/access-control";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
export function StaffEditor({
  editorOpen,
  isSaving,
  editing,
  name,
  username,
  password,
  level,
  formError,
  setEditorOpen,
  setName,
  setUsername,
  setPassword,
  setLevel,
  save,
}: {
  editorOpen: boolean;
  isSaving: boolean;
  editing: StaffUser | null;
  name: string;
  username: string;
  password: string;
  level: UserLevel;
  formError: string;
  setEditorOpen: (open: boolean) => void;
  setName: (value: string) => void;
  setUsername: (value: string) => void;
  setPassword: (value: string) => void;
  setLevel: (value: UserLevel) => void;
  save: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <Dialog
      open={editorOpen}
      onOpenChange={(open) => !isSaving && setEditorOpen(open)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Muokkaa henkilöstötiliä" : "Lisää henkilöstötili"}
          </DialogTitle>
          <DialogDescription>
            Rooli määrittää näkyvät sivut; backend tarkistaa oikeudet jokaisessa
            pyynnössä.
          </DialogDescription>
        </DialogHeader>
        <form id="staff-form" className="grid gap-4" onSubmit={save}>
          <FormField id="staff-name" label="Nimi" required>
            <Input
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <FormField id="staff-role" label="Rooli" required>
            <select
              className="h-10 w-full rounded-md border border-border bg-surface px-3"
              value={level}
              onChange={(event) => setLevel(event.target.value as UserLevel)}
            >
              <option value="kassa">Kassatyöntekijä</option>
              <option value="waiter">Tarjoilija</option>
              <option value="kitchen">Keittiöhenkilökunta</option>
              <option value="admin">Ylläpitäjä</option>
            </select>
          </FormField>
          <FormField id="staff-username" label="Käyttäjätunnus" required>
            <Input
              value={username}
              maxLength={64}
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
            />
          </FormField>
          <FormField
            id="staff-password"
            label="Salasana"
            required={!editing}
            description={
              editing
                ? "Jätä tyhjäksi, jos salasana ei muutu."
                : "Vähintään 8 merkkiä."
            }
          >
            <Input
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={() => setEditorOpen(false)}
          >
            Peruuta
          </Button>
          <Button type="submit" form="staff-form" disabled={isSaving}>
            {isSaving ? "Tallennetaan…" : "Tallenna"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
