import { readAuthSession } from "@/lib/auth-session";
export type Attempt = {
  tableNo: number;
  orders: { id: number; version: number }[];
  idempotencyKey: string;
  payType: "cash" | "bank";
  inputMoney?: number;
  total: number;
};
export const attemptKey = (sessionId: number) => {
  if (typeof window === "undefined") return null;
  const userId = readAuthSession()?.userId;
  return userId && /^[1-9]\d*$/.test(userId)
    ? `table-payment:v1:${userId}:${sessionId}`
    : null;
};
export const listPendingTablePayments = (): {
  sessionId: number;
  tableNo: number;
}[] => {
  const userId = readAuthSession()?.userId;
  if (!userId || !/^[1-9]\d*$/.test(userId)) return [];
  const prefix = `table-payment:v1:${userId}:`;
  const pending: { sessionId: number; tableNo: number }[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const sessionId = Number(key.slice(prefix.length));
    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) continue;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
      const tableNo =
        saved &&
        typeof saved === "object" &&
        Number.isSafeInteger((saved as Record<string, unknown>).tableNo)
          ? Number((saved as Record<string, unknown>).tableNo)
          : 0;
      pending.push({ sessionId, tableNo });
    } catch {
      pending.push({ sessionId, tableNo: 0 });
    }
  }
  return pending;
};
export const validAttempt = (value: unknown): value is Attempt => {
  if (!value || typeof value !== "object") return false;
  const attempt = value as Record<string, unknown>;
  return (
    Array.isArray(attempt.orders) &&
    Number.isSafeInteger(attempt.tableNo) &&
    Number(attempt.tableNo) > 0 &&
    attempt.orders.length > 0 &&
    attempt.orders.every(
      (item) =>
        item &&
        Number.isSafeInteger(item.id) &&
        item.id > 0 &&
        Number.isSafeInteger(item.version) &&
        item.version > 0,
    ) &&
    typeof attempt.idempotencyKey === "string" &&
    /^[0-9a-f-]{36}$/i.test(attempt.idempotencyKey) &&
    (attempt.payType === "cash" || attempt.payType === "bank") &&
    Number.isSafeInteger(attempt.total) &&
    Number(attempt.total) >= 0 &&
    (attempt.inputMoney === undefined ||
      (Number.isSafeInteger(attempt.inputMoney) &&
        Number(attempt.inputMoney) >= 0))
  );
};
