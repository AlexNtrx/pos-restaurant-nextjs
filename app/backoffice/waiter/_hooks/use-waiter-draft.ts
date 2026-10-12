import { useCallback, useRef, useState } from "react";
import {
  assertWaiterDraftOwner,
  clearWaiterDraft,
  emptyWaiterDraft,
  readWaiterDraft,
  saveWaiterDraft,
  waiterDraftKey,
  type WaiterDraft,
} from "@/lib/waiter-draft";
import type { WaiterPending } from "@/lib/waiter-pending";

export default function useWaiterDraft() {
  const [draft, setDraft] = useState(emptyWaiterDraft);
  const current = useRef(draft);
  const owner = useRef(waiterDraftKey());
  const initialized = useRef(false);
  const [storageError, setStorageError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const unreadable = useRef(false);
  const apply = useCallback((next: WaiterDraft) => {
    current.current = next;
    setDraft(next);
  }, []);

  const load = useCallback(
    (pending: WaiterPending | null) => {
      let next = emptyWaiterDraft();
      try {
        next = readWaiterDraft(owner.current) ?? next;
        unreadable.current = false;
        setBlocked(false);
        setStorageError("");
      } catch {
        unreadable.current = true;
        setBlocked(true);
        setStorageError(
          "Tallennettua luonnosta ei voitu lukea. Lue se uudelleen tai poista vain lähettämätön luonnos.",
        );
      }
      // EN: The exact pending request wins over any older draft, including its original table.
      // FI: Täsmällinen odottava pyyntö ohittaa vanhemman luonnoksen ja säilyttää alkuperäisen pöytänsä.
      if (pending)
        next = { ...emptyWaiterDraft(pending.tableId), items: pending.items };
      initialized.current = true;
      apply(next);
    },
    [apply],
  );

  const selectInitialTable = useCallback(
    (tableId: number | null) => {
      if (current.current.tableId === null)
        apply({ ...current.current, tableId });
    },
    [apply],
  );
  const clearMemory = useCallback(() => apply(emptyWaiterDraft()), [apply]);

  function change(update: (draft: WaiterDraft) => WaiterDraft) {
    if (!initialized.current || unreadable.current) return;
    try {
      assertWaiterDraftOwner(owner.current);
    } catch {
      setBlocked(true);
      setStorageError(
        "Käyttäjä vaihtui. Avaa työpiste uudelleen oikealla käyttäjällä.",
      );
      return;
    }
    const next = update(current.current);
    apply(next);
    try {
      saveWaiterDraft(next, owner.current);
      setStorageError("");
    } catch {
      setStorageError(
        "Luonnosta ei voitu tallentaa tälle laitteelle. Älä lataa sivua uudelleen ennen tallennuksen onnistumista.",
      );
    }
  }

  function discard(tableId: number | null) {
    try {
      const next = emptyWaiterDraft(tableId);
      // EN: Confirmed discarding changes memory only after storage succeeds; an unreadable draft is never overwritten automatically.
      // FI: Vahvistettu poistaminen muuttaa muistia vasta tallennuksen onnistuttua; lukukelvotonta luonnosta ei korvata automaattisesti.
      saveWaiterDraft(next, owner.current);
      unreadable.current = false;
      setBlocked(false);
      setStorageError("");
      apply(next);
      return true;
    } catch {
      setStorageError(
        "Luonnosta ei voitu poistaa. Nykyinen pöytä ja luonnos säilytettiin.",
      );
      return false;
    }
  }

  return {
    draft,
    storageError,
    blocked,
    load,
    change,
    discard,
    selectInitialTable,
    clearMemory,
    retrySave: () => change((next) => next),
    // EN: Remove the draft before releasing the pending lock so a cleanup failure cannot restore a second unsent order.
    // FI: Poista luonnos ennen odottavan pyynnön lukon vapauttamista, jotta siivousvirhe ei palauta toista lähettämätöntä tilausta.
    clearStored: () => clearWaiterDraft(owner.current),
    resetAfterSubmit: () => apply(emptyWaiterDraft(current.current.tableId)),
  };
}
