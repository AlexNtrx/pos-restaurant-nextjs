import api from "@/lib/api";

export type OrderStatus =
  | "SUBMITTED"
  | "CONFIRMED"
  | "REJECTED"
  | "PREPARING"
  | "READY"
  | "SERVED"
  | "PAID"
  | "COMPLETED"
  | "CANCELLED";

export type StaffOrder = {
  id: number;
  channel: "COUNTER" | "QR";
  status: OrderStatus;
  version: number;
  tableNo: number | null;
  tableSessionId: number | null;
  total: number;
  submittedAt: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  paidAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  rejectionReason: string | null;
  cancellationReason: string | null;
  items: {
    name: string;
    quantity: number;
    note: string | null;
    lineTotal: number;
    modifiers: { type: string; name: string; priceAdjustment: number }[];
  }[];
};

export type StaffOrderDetail = StaffOrder & {
  history: {
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    version: number;
    reason: string | null;
    actorType: string;
    at: string;
  }[];
};

type OrderPage = {
  results: StaffOrder[];
  nextCursor: string | null;
  serverTime: string;
};

export async function fetchOrderPages(filters: {
  status?: OrderStatus;
  channel?: "COUNTER" | "QR";
  updatedAfter?: string;
  submittedFrom?: string;
  submittedBefore?: string;
  tableSessionId?: number;
}): Promise<{ results: StaffOrder[]; serverTime: string }> {
  const results: StaffOrder[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let serverTime = "";
  do {
    const page: OrderPage = (
      await api.get<OrderPage>("/orders", {
        params: { ...filters, limit: 100, ...(cursor ? { cursor } : {}) },
      })
    ).data;
    if (
      !page ||
      !Array.isArray(page.results) ||
      typeof page.serverTime !== "string" ||
      (page.nextCursor !== null && typeof page.nextCursor !== "string")
    )
      throw new Error("Palvelin palautti virheellisen tilauslistan.");
    if (!serverTime) serverTime = page.serverTime;
    results.push(...page.results);
    cursor = page.nextCursor;
    if (cursor) {
      if (cursors.has(cursor))
        throw new Error("Palvelin palautti virheellisen sivutuksen.");
      cursors.add(cursor);
    }
  } while (cursor);
  return { results, serverTime };
}

export async function fetchOrderDetail(id: number): Promise<StaffOrderDetail> {
  const response = await api.get<{ result: StaffOrderDetail }>(`/orders/${id}`);
  if (!response.data?.result || !Array.isArray(response.data.result.history))
    throw new Error("Palvelin palautti virheellisen tilauksen.");
  return response.data.result;
}

export async function changeOrderStatus(
  id: number,
  expectedVersion: number,
  nextStatus: "CONFIRMED" | "REJECTED" | "CANCELLED",
  reason?: string,
): Promise<StaffOrderDetail> {
  const response = await api.patch<{ result: StaffOrderDetail }>(
    `/orders/${id}/status`,
    { expectedVersion, nextStatus, ...(reason ? { reason } : {}) },
  );
  if (!response.data?.result || !Array.isArray(response.data.result.history))
    throw new Error("Palvelin palautti virheellisen tilaustilan.");
  return response.data.result;
}

// EN: A changed terminal Order must be removed from the active queue without losing its server snapshot.
// FI: Päättävään tilaan muuttunut tilaus poistetaan aktiivijonosta kadottamatta palvelimen tilannekuvaa.
export function mergeActiveOrders(
  current: StaffOrder[],
  changes: StaffOrder[],
): StaffOrder[] {
  const byId = new Map(current.map((order) => [order.id, order]));
  for (const order of changes) {
    if (order.status === "SUBMITTED") byId.set(order.id, order);
    else byId.delete(order.id);
  }
  return [...byId.values()].sort(
    (left, right) =>
      Date.parse(left.submittedAt) - Date.parse(right.submittedAt) ||
      left.id - right.id,
  );
}
