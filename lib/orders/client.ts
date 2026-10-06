import api from "@/lib/api";
import type { OrderStatus, StaffOrder, StaffOrderDetail } from "./contracts";

type OrderPage = {
  results: StaffOrder[];
  nextCursor: string | null;
  serverTime: string;
};

export async function fetchOrderPages(
  filters: {
    status?: OrderStatus;
    channel?: "COUNTER" | "QR" | "STAFF";
    updatedAfter?: string;
    submittedFrom?: string;
    submittedBefore?: string;
    tableSessionId?: number;
  },
  signal?: AbortSignal,
): Promise<{ results: StaffOrder[]; serverTime: string }> {
  const results: StaffOrder[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let serverTime = "";
  do {
    const page: OrderPage = (
      await api.get<OrderPage>("/orders", {
        signal,
        params: { ...filters, limit: 100, ...(cursor ? { cursor } : {}) },
      })
    ).data;
    if (
      !page ||
      !Array.isArray(page.results) ||
      typeof page.serverTime !== "string" ||
      !Number.isFinite(Date.parse(page.serverTime)) ||
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
