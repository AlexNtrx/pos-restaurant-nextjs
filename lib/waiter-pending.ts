import type { WaiterItem } from "@/lib/waiter-orders";

export type WaiterPending = {
  tableId: number;
  tableNo: number;
  tableSessionId: number;
  idempotencyKey: string;
  expectedTotal: number;
  items: WaiterItem[];
};
const positive = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) > 0;
export function parseWaiterPending(value: unknown): WaiterPending | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<WaiterPending>;
  if (
    !positive(item.tableId) ||
    !positive(item.tableNo) ||
    !positive(item.tableSessionId) ||
    typeof item.idempotencyKey !== "string" ||
    !item.idempotencyKey ||
    !Number.isSafeInteger(item.expectedTotal) ||
    Number(item.expectedTotal) < 0 ||
    !Array.isArray(item.items) ||
    !item.items.length ||
    item.items.length > 200 ||
    item.items.some(
      (row) =>
        !row ||
        !positive(row.foodId) ||
        !positive(row.quantity) ||
        (row.foodSizeId !== null && !positive(row.foodSizeId)) ||
        (row.tasteId !== null && !positive(row.tasteId)) ||
        typeof row.note !== "string" ||
        row.note.length > 500,
    ) ||
    item.items.reduce((sum, row) => sum + row.quantity, 0) > 200
  )
    return null;
  return item as WaiterPending;
}
