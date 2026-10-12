import "client-only";
import {
  assertPendingOwner,
  clearPendingRequest,
  pendingRequestKey,
  readPendingRequest,
  savePendingRequest,
} from "@/lib/pending-request";
import type { WaiterCategory, WaiterItem } from "@/lib/waiter-orders";

export type WaiterDraft = {
  tableId: number | null;
  items: WaiterItem[];
  foodId: number | null;
  sizeId: number | null;
  tasteId: number | null;
  quantity: number;
  note: string;
};

export const emptyWaiterDraft = (
  tableId: number | null = null,
): WaiterDraft => ({
  tableId,
  items: [],
  foodId: null,
  sizeId: null,
  tasteId: null,
  quantity: 1,
  note: "",
});
const id = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const optionalId = (value: unknown) => value === null || id(value);

export function parseWaiterDraft(value: unknown): WaiterDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as WaiterDraft;
  if (
    !optionalId(draft.tableId) ||
    !optionalId(draft.foodId) ||
    !optionalId(draft.sizeId) ||
    !optionalId(draft.tasteId) ||
    !Number.isFinite(draft.quantity) ||
    typeof draft.note !== "string" ||
    draft.note.length > 500 ||
    !Array.isArray(draft.items) ||
    draft.items.length > 200 ||
    draft.items.some(
      (row) =>
        !row ||
        !id(row.foodId) ||
        !optionalId(row.foodSizeId) ||
        !optionalId(row.tasteId) ||
        !id(row.quantity) ||
        typeof row.note !== "string" ||
        row.note.length > 500,
    ) ||
    draft.items.reduce((sum, row) => sum + row.quantity, 0) > 200 ||
    (draft.items.length > 0 && draft.tableId === null)
  )
    return null;
  // EN: Store only editable intent, never catalog prices, totals, sessions or submission keys.
  // FI: Tallenna vain muokattava sisältö, älä ruokalistan hintoja, summia, istuntoja tai lähetysavaimia.
  return {
    tableId: draft.tableId,
    foodId: draft.foodId,
    sizeId: draft.sizeId,
    tasteId: draft.tasteId,
    quantity: draft.quantity,
    note: draft.note,
    items: draft.items.map((row) => ({
      foodId: row.foodId,
      foodSizeId: row.foodSizeId,
      tasteId: row.tasteId,
      quantity: row.quantity,
      note: row.note,
    })),
  };
}

export const waiterDraftKey = () => pendingRequestKey("waiter-draft");
export const assertWaiterDraftOwner = (key: string | null) =>
  assertPendingOwner("waiter-draft", key);
export function readWaiterDraft(key: string | null) {
  if (!key) return null;
  assertWaiterDraftOwner(key);
  return readPendingRequest("waiter-draft", parseWaiterDraft);
}
export function saveWaiterDraft(draft: WaiterDraft, key: string | null) {
  const parsed = parseWaiterDraft(draft);
  if (!parsed) throw new Error("Tilausluonnos on virheellinen.");
  savePendingRequest("waiter-draft", parsed, key);
}
export const clearWaiterDraft = (key: string | null) =>
  clearPendingRequest("waiter-draft", key);
export const hasWaiterDraft = (draft: WaiterDraft) =>
  draft.items.length > 0 ||
  draft.foodId !== null ||
  draft.note !== "" ||
  draft.quantity !== 1;

export function waiterItemAvailable(
  item: WaiterItem,
  categories: WaiterCategory[],
) {
  const category = categories.find((category) =>
    category.food.some((food) => food.id === item.foodId),
  );
  return (
    !!category &&
    (item.foodSizeId === null ||
      category.foodSizes.some((size) => size.id === item.foodSizeId)) &&
    (item.tasteId === null ||
      category.tastes.some((taste) => taste.id === item.tasteId))
  );
}
