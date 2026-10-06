"use client";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { RestaurantTable } from "../_components/types";
// EN: The editor owns its draft while the settings page owns the shared mutation lock.
// FI: Muokkain omistaa luonnoksensa ja asetussivu yhteisen muutoslukon.
export function useTableEditor(
  refresh: () => Promise<void>,
  setBusy: (busy: boolean) => void,
  setError: (error: string) => void,
  tableErrorMessage: (reason: unknown, fallback: string) => string,
) {
  const [editor, setEditor] = useState<RestaurantTable | "new" | null>(null);
  const [tableNo, setTableNo] = useState("");
  const [tableName, setTableName] = useState("");
  const startEditor = (table: RestaurantTable | "new") => {
    setEditor(table);
    setTableNo(table === "new" ? "" : String(table.tableNo));
    setTableName(table === "new" ? "" : (table.name ?? ""));
  };

  const saveTable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editor === null) return;
    const number = Number(tableNo);
    if (!Number.isSafeInteger(number) || number < 1 || number > 10000) {
      setError("Pöydän numeron on oltava kokonaisluku väliltä 1–10000.");
      return;
    }
    setBusy(true);
    try {
      const payload = { tableNo: number, name: tableName.trim() || null };
      if (editor === "new") await api.post("/tables", payload);
      else await api.put(`/tables/${editor.id}`, payload);
      setEditor(null);
      toast.success(
        editor === "new" ? "Pöytä lisättiin." : "Pöytä päivitettiin.",
      );
      await refresh();
    } catch (reason: unknown) {
      setError(tableErrorMessage(reason, "Pöytää ei voitu tallentaa."));
    } finally {
      setBusy(false);
    }
  };

  return {
    editor,
    tableNo,
    tableName,
    setEditor,
    setTableNo,
    setTableName,
    startEditor,
    saveTable,
  };
}
