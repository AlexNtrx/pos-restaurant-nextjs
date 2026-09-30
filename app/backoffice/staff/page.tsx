"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { isUserLevel, type UserLevel } from "@/lib/access-control";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";

const roleLabels: Record<UserLevel, string> = {
  admin: "Ylläpitäjä",
  user: "Työntekijä",
  waiter: "Tarjoilija",
  kitchen: "Keittiöhenkilökunta",
};
type StaffUser = {
  id: number;
  name: string;
  username: string;
  level: UserLevel;
};
type LoadStatus = "loading" | "ready" | "error" | "forbidden";

function isStaffUser(value: unknown): value is StaffUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === "number" &&
    typeof user.name === "string" &&
    typeof user.username === "string" &&
    isUserLevel(user.level)
  );
}

export default function StaffPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState("");
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StaffUser | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [level, setLevel] = useState<UserLevel>("user");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const response = await api.get("/user/list");
      const results = response.data?.results;
      if (!Array.isArray(results) || !results.every(isStaffUser)) {
        throw new Error("Palvelin palautti virheellisen henkilöstöluettelon.");
      }
      setUsers(results);
      setStatus("ready");
    } catch (reason: unknown) {
      setError(getApiErrorMessage(reason, "Henkilöstöä ei voitu ladata."));
      setStatus(isPermissionDeniedError(reason) ? "forbidden" : "error");
    }
  }, []);

  useEffect(() => {
    const requestId = window.setTimeout(() => {
      const storedId = Number(window.localStorage.getItem("next_user_id"));
      if (Number.isInteger(storedId) && storedId > 0) {
        setCurrentUserId(storedId);
      }
      void load();
    }, 0);
    return () => window.clearTimeout(requestId);
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setUsername("");
    setPassword("");
    setLevel("user");
    setFormError("");
    setEditorOpen(true);
  };

  const openEdit = (user: StaffUser) => {
    setEditing(user);
    setName(user.name);
    setUsername(user.username);
    setPassword("");
    setLevel(user.level);
    setFormError("");
    setEditorOpen(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedUsername = username.trim();
    if (!normalizedName || !normalizedUsername) {
      setFormError("Nimi ja käyttäjätunnus ovat pakollisia.");
      return;
    }
    if (
      (!editing && password.length < 8) ||
      (editing && password && password.length < 8)
    ) {
      setFormError("Salasanassa on oltava vähintään 8 merkkiä.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      const payload = {
        name: normalizedName,
        username: normalizedUsername,
        level,
        ...(password ? { password } : {}),
      };
      if (editing)
        await api.put("/user/update", { ...payload, id: editing.id });
      else await api.post("/user/create", payload);
      await load();
      setEditorOpen(false);
      toast.success("Henkilöstötili tallennettiin.");
    } catch (reason: unknown) {
      setFormError(
        getApiErrorMessage(reason, "Henkilöstötiliä ei voitu tallentaa."),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await api.delete(`/user/remove/${pendingDelete.id}`);
      await load();
      setPendingDelete(null);
      toast.success("Henkilöstötili poistettiin käytöstä.");
    } catch (reason: unknown) {
      toast.error(
        getApiErrorMessage(reason, "Henkilöstötiliä ei voitu poistaa."),
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="tw04-layout space-y-6 font-sans">
      <PageHeader
        title="Henkilöstö"
        description="Hallitse henkilöstötilejä ja käyttöoikeustasoja."
        actions={
          <Button onClick={openCreate}>
            <Plus aria-hidden="true" /> Lisää työntekijä
          </Button>
        }
      />

      {status === "loading" ? (
        <LoadingState title="Henkilöstöä ladataan" />
      ) : status === "forbidden" ? (
        <ErrorState
          title="Ei käyttöoikeutta"
          description="Vain ylläpitäjä voi hallita henkilöstötilejä."
        />
      ) : status === "error" ? (
        <ErrorState
          title="Henkilöstöä ei voitu ladata"
          description={error}
          action={<Button onClick={() => void load()}>Yritä uudelleen</Button>}
        />
      ) : users.length === 0 ? (
        <EmptyState
          title="Ei aktiivisia henkilöstötilejä"
          description="Lisää ensimmäinen henkilöstötili."
          action={<Button onClick={openCreate}>Lisää työntekijä</Button>}
        />
      ) : (
        <Table className="min-w-[680px]">
          <TableHeader>
            <TableRow>
              <TableHead>Nimi</TableHead>
              <TableHead>Käyttäjätunnus</TableHead>
              <TableHead>Rooli</TableHead>
              <TableHead className="text-right">Toiminnot</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell>
                  <StatusBadge
                    tone={user.level === "admin" ? "info" : "neutral"}
                  >
                    {roleLabels[user.level]}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(user)}
                    >
                      <Pencil aria-hidden="true" /> Muokkaa
                    </Button>
                    {currentUserId !== user.id && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setPendingDelete(user)}
                        aria-label={`Poista ${user.username}`}
                      >
                        <Trash2
                          aria-hidden="true"
                          className="text-destructive"
                        />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

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
              Rooli määrittää näkyvät sivut; backend tarkistaa oikeudet
              jokaisessa pyynnössä.
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
                <option value="user">Työntekijä</option>
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

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && !isDeleting && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Poistetaanko henkilöstötili?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${pendingDelete.username} poistetaan käytöstä. Käyttäjä ei voi enää kirjautua sisään.`
                : "Tili poistetaan käytöstä."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Peruuta</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              {isDeleting ? "Poistetaan…" : "Poista"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
