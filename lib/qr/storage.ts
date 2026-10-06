import "client-only";
import type { QrCartItem, QrPending } from "./contracts";
const storageKey = (token: string, name: string) => `qr02:${token}:${name}`;
const browserStorage = () =>
  typeof window === "undefined" ? null : window.localStorage;

// EN: Only identifier-based drafts are stored; failed network submits retain the exact key and intent for safe retry.
// FI: Vain tunnisteisiin perustuvat luonnokset tallennetaan; verkkovirheen jälkeen sama avain ja pyyntö säilyvät turvallista uudelleenyritystä varten.
export const readQrCart = (token: string): QrCartItem[] => {
  try {
    const parsed: unknown = JSON.parse(
      browserStorage()?.getItem(storageKey(token, "cart")) || "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is QrCartItem =>
          item &&
          Number.isSafeInteger(item.foodId) &&
          item.foodId > 0 &&
          Number.isSafeInteger(item.quantity) &&
          item.quantity > 0 &&
          item.quantity <= 200 &&
          typeof item.note === "string" &&
          item.note.length <= 500,
      )
      .slice(0, 200);
  } catch {
    return [];
  }
};

export const writeQrCart = (token: string, cart: QrCartItem[]) =>
  browserStorage()?.setItem(storageKey(token, "cart"), JSON.stringify(cart));

export const readQrPending = (token: string): QrPending | null => {
  // EN: Corrupted saved requests must block ordering; silently replacing their key could duplicate an already committed Order.
  // FI: Virheellisen tallennetun pyynnön on estettävä tilaaminen; avaimen huomaamaton vaihtaminen voi monistaa jo tallennetun tilauksen.
  const parsed: unknown = JSON.parse(
    browserStorage()?.getItem(storageKey(token, "pending")) || "null",
  );
  if (parsed === null) return null;
  if (
    parsed &&
    typeof parsed === "object" &&
    "idempotencyKey" in parsed &&
    typeof parsed.idempotencyKey === "string" &&
    !!parsed.idempotencyKey &&
    "expectedTotal" in parsed &&
    Number.isSafeInteger(parsed.expectedTotal) &&
    Number(parsed.expectedTotal) >= 0 &&
    "items" in parsed &&
    Array.isArray(parsed.items) &&
    parsed.items.length > 0 &&
    parsed.items.length <= 200 &&
    parsed.items.every(
      (item) =>
        item &&
        Number.isSafeInteger(item.foodId) &&
        item.foodId > 0 &&
        Number.isSafeInteger(item.quantity) &&
        item.quantity > 0 &&
        (item.foodSizeId === null ||
          (Number.isSafeInteger(item.foodSizeId) && item.foodSizeId > 0)) &&
        (item.tasteId === null ||
          (Number.isSafeInteger(item.tasteId) && item.tasteId > 0)) &&
        typeof item.note === "string" &&
        item.note.length <= 500,
    ) &&
    parsed.items.reduce((sum, item) => sum + item.quantity, 0) <= 200
  )
    return parsed as QrPending;
  throw new Error(
    "Tallennettu tilaus on virheellinen. Pyydä henkilökuntaa tarkistamaan sen tila.",
  );
};

export const writeQrPending = (token: string, pending: QrPending | null) => {
  if (pending)
    browserStorage()?.setItem(
      storageKey(token, "pending"),
      JSON.stringify(pending),
    );
  else browserStorage()?.removeItem(storageKey(token, "pending"));
};

export const lastQrOrder = (token: string) => {
  const id = Number(browserStorage()?.getItem(storageKey(token, "lastOrder")));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
export const writeLastQrOrder = (token: string, orderId: number) =>
  browserStorage()?.setItem(storageKey(token, "lastOrder"), String(orderId));
