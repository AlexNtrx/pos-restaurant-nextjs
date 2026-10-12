import { readAuthSession } from "@/lib/auth-session";

export type CounterSelection = {
  table: number;
  serviceType: "DINE_IN" | "TAKEAWAY";
};
const key = () => {
  const userId = readAuthSession()?.userId;
  return userId ? `counter-selection:v1:${userId}` : null;
};
// EN: Restore only this staff account's cart destination; sent-order filters never write this key.
// FI: Palauta vain tämän työntekijän ostoskorin kohde; lähetettyjen tilausten suodattimet eivät kirjoita tätä avainta.
export function readCounterSelection(): CounterSelection | null {
  try {
    const storageKey = key();
    const raw = storageKey ? localStorage.getItem(storageKey) : null;
    if (!raw) return null;
    const value = JSON.parse(raw) as CounterSelection;
    return value &&
      Number.isSafeInteger(value.table) &&
      value.table > 0 &&
      ["DINE_IN", "TAKEAWAY"].includes(value.serviceType)
      ? value
      : null;
  } catch {
    return null;
  }
}
export function saveCounterSelection(selection: CounterSelection) {
  try {
    const storageKey = key();
    if (
      storageKey &&
      Number.isSafeInteger(selection.table) &&
      selection.table > 0
    )
      localStorage.setItem(storageKey, JSON.stringify(selection));
  } catch {
    // EN: Destination persistence is optional; draft/payment persistence keeps its own strict checks.
    // FI: Kohteen tallennus on valinnainen; luonnosten ja maksujen tallennus säilyttää omat tiukat tarkistuksensa.
  }
}
