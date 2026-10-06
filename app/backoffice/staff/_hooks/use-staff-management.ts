"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { isUserLevel, type UserLevel } from "@/lib/access-control";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import type { StaffUser } from "../_lib/types";
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

// EN: Password drafts remain local and reset when either editor mode opens.
// FI: Salasanaluonnokset säilyvät paikallisesti ja nollautuvat avattaessa kumpi tahansa muokkaustila.
export function useStaffManagement() {
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
  const [level, setLevel] = useState<UserLevel>("kassa");
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
    setLevel("kassa");
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

  return {
    users,
    status,
    error,
    currentUserId,
    editorOpen,
    editing,
    pendingDelete,
    name,
    username,
    password,
    level,
    formError,
    isSaving,
    isDeleting,
    load,
    openCreate,
    openEdit,
    save,
    remove,
    setEditorOpen,
    setPendingDelete,
    setName,
    setUsername,
    setPassword,
    setLevel,
  };
}
