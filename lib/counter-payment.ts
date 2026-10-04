import {
  parseSentCounterOrders,
  type SentCounterOrder,
} from "@/lib/sale-contracts";
import { pendingResources, readPendingRequest } from "@/lib/pending-request";

export type CounterPaymentAttempt = {
  expectedVersion: number;
  idempotencyKey: string;
  payType: "cash" | "bank";
  inputMoney?: number;
};
export type SavedCounterPayment = {
  order: SentCounterOrder;
  payload: CounterPaymentAttempt;
};
export function parseCounterPayment(
  value: unknown,
): SavedCounterPayment | null {
  if (!value || typeof value !== "object") return null;
  const saved = value as Partial<SavedCounterPayment>;
  const order = parseSentCounterOrders({ results: [saved.order] })?.[0];
  const payload = saved.payload;
  if (
    !order ||
    !payload ||
    !Number.isSafeInteger(payload.expectedVersion) ||
    payload.expectedVersion < 1 ||
    typeof payload.idempotencyKey !== "string" ||
    !payload.idempotencyKey ||
    !["cash", "bank"].includes(payload.payType) ||
    (payload.inputMoney !== undefined &&
      (!Number.isSafeInteger(payload.inputMoney) || payload.inputMoney < 0))
  )
    return null;
  return { order, payload };
}
export function listPendingCounterPayments() {
  return pendingResources("counter-order:")
    .map((resource) => {
      const saved = readPendingRequest(resource, parseCounterPayment);
      if (saved && resource !== `counter-order:${saved.order.id}`)
        throw new Error("Tallennettu maksupyyntö kuuluu toiselle tilaukselle.");
      return saved;
    })
    .filter((value): value is SavedCounterPayment => value !== null);
}
