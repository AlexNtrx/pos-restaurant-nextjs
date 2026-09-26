import "client-only";

import { isAxiosError } from "axios";
import { publicApi } from "@/lib/api";

export type QrMode = "CLOSED" | "MENU_ONLY" | "ORDERING";
export type QrContext = {
  state: QrMode;
  tableNo: number;
  restaurantName: string;
};
export type QrFood = {
  id: number;
  name: string;
  remark: string;
  price: number;
  foodTypeId: number;
};
export type QrCategory = {
  id: number;
  name: string;
  food: QrFood[];
  foodSizes: { id: number; name: string; moneyAdded: number }[];
  tastes: { id: number; name: string }[];
};
export type QrMenu = {
  state: "MENU_ONLY" | "ORDERING";
  tableNo: number;
  categories: QrCategory[];
};
export type QrCartItem = {
  foodId: number;
  foodSizeId: number | null;
  tasteId: number | null;
  quantity: number;
  note: string;
};
export type QrOrder = {
  id: number;
  status: string;
  tableNo: number;
  total: number;
  submittedAt: string;
  items: {
    name: string;
    quantity: number;
    note: string | null;
    lineTotal: number;
    modifiers: { type: string; name: string }[];
  }[];
  history: { status: string; at: string }[];
};
export type QrPending = {
  idempotencyKey: string;
  expectedTotal: number;
  items: QrCartItem[];
};

export const qrMoney = (amount: number) =>
  new Intl.NumberFormat("fi-FI", {
    style: "currency",
    currency: "EUR",
  }).format(amount);

export const qrErrorCode = (error: unknown): string | null =>
  isAxiosError(error) && typeof error.response?.data?.code === "string"
    ? error.response.data.code
    : null;

export const qrErrorText = (error: unknown) => {
  const code = qrErrorCode(error);
  if (code === "QR_INVALID")
    return "QR-koodi ei ole enää voimassa. Pyydä henkilökunnalta uusi koodi.";
  if (code === "QR_ORDERING_CLOSED")
    return "QR-tilaaminen ei ole juuri nyt käytettävissä.";
  if (
    code === "FOOD_UNAVAILABLE" ||
    code === "SIZE_UNAVAILABLE" ||
    code === "TASTE_UNAVAILABLE"
  )
    return "Jokin tuote tai valinta ei ole enää saatavilla. Tarkista ostoskori.";
  if (code === "QUOTE_CHANGED")
    return "Hinta on muuttunut. Tarkista ostoskori ennen uutta yritystä.";
  if (code === "QR_RATE_LIMITED")
    return "Pöydästä on lähetetty monta tilausta. Yritä hetken kuluttua.";
  if (code === "IDEMPOTENCY_CONFLICT")
    return "Tilausyritys on muuttunut. Päivitä sivu ja tarkista tilanne.";
  if (code === "ORDER_NOT_FOUND") return "Tilausta ei löytynyt tästä pöydästä.";
  return "Yhteys epäonnistui. Yritä uudelleen.";
};

const encoded = (token: string) => encodeURIComponent(token);

export const loadQrContext = async (token: string) => {
  const response = await publicApi.get<{ result: QrContext }>(
    `/qr/${encoded(token)}/context`,
  );
  if (
    !response.data?.result ||
    !["CLOSED", "MENU_ONLY", "ORDERING"].includes(response.data.result.state) ||
    !Number.isSafeInteger(response.data.result.tableNo)
  )
    throw new Error("Invalid QR context");
  return response.data.result;
};

export const loadQrMenu = async (token: string) => {
  const response = await publicApi.get<{ result: QrMenu }>(
    `/qr/${encoded(token)}/menu`,
  );
  if (!Array.isArray(response.data?.result?.categories))
    throw new Error("Invalid QR menu");
  return response.data.result;
};

export const submitQrOrder = async (token: string, pending: QrPending) => {
  const response = await publicApi.post<{
    result: { orderId: number; status: string; total: number };
  }>(`/qr/${encoded(token)}/orders`, pending);
  if (!Number.isSafeInteger(response.data?.result?.orderId))
    throw new Error("Invalid QR order response");
  return response.data.result;
};

export const loadQrOrder = async (token: string, orderId: number) => {
  const response = await publicApi.get<{ result: QrOrder }>(
    `/qr/${encoded(token)}/orders/${orderId}`,
  );
  if (!Number.isSafeInteger(response.data?.result?.id))
    throw new Error("Invalid QR status response");
  return response.data.result;
};

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
  try {
    const parsed: unknown = JSON.parse(
      browserStorage()?.getItem(storageKey(token, "pending")) || "null",
    );
    if (
      parsed &&
      typeof parsed === "object" &&
      "idempotencyKey" in parsed &&
      typeof parsed.idempotencyKey === "string" &&
      "expectedTotal" in parsed &&
      Number.isSafeInteger(parsed.expectedTotal) &&
      "items" in parsed &&
      Array.isArray(parsed.items)
    )
      return parsed as QrPending;
  } catch {}
  return null;
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
