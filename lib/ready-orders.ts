import api from "@/lib/api";

export type ReadyOrderScope = "orders" | "waiter";
export const READY_ORDERS_CHANGED = "ready-orders-changed";

export function notifyReadyOrdersChanged() {
  window.dispatchEvent(new Event(READY_ORDERS_CHANGED));
}

export async function hasReadyOrders(
  scope: ReadyOrderScope,
  signal: AbortSignal,
) {
  if (scope === "orders") {
    const { data } = await api.get("/counterOrder/ready-summary", { signal });
    if (typeof data?.result?.hasReady !== "boolean")
      throw new Error("Invalid ready Order summary");
    return data.result.hasReady;
  }
  // EN: One ready row is enough for the waiter indicator; do not fetch the full queue or its later pages.
  // FI: Yksi valmis rivi riittää tarjoilijan merkkiin; älä hae koko jonoa tai sen seuraavia sivuja.
  const { data } = await api.get("/orders", {
    signal,
    params: { status: "READY", limit: 1 },
  });
  if (
    !Array.isArray(data?.results) ||
    data.results.length > 1 ||
    data.results.some(
      (order: { id?: number; status?: string; serviceType?: string }) =>
        !Number.isSafeInteger(order?.id) ||
        order.id! <= 0 ||
        order.status !== "READY" ||
        !["DINE_IN", "TAKEAWAY"].includes(order.serviceType ?? ""),
    )
  )
    throw new Error("Invalid ready Order summary");
  return data.results.length > 0;
}
