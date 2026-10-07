import api from "@/lib/api";
import type { OrderStatus, StaffOrder, StaffOrderDetail } from "./contracts";

export type OrderPage = {
  results: StaffOrder[];
  nextCursor: string | null;
  serverTime: string;
  sort?: "submitted_desc";
};

type OrderFilters = {
  status?: OrderStatus;
  channel?: "COUNTER" | "QR" | "STAFF";
  updatedAfter?: string;
  submittedFrom?: string;
  submittedBefore?: string;
  tableSessionId?: number;
};

// EN: Read one bounded history page; queue consumers keep their separate full-snapshot loader.
// FI: Lue yksi rajattu historiasivu; jonojen käyttäjät säilyttävät erillisen kokonaisen tilannekuvan lataajan.
export async function fetchOrderHistoryPage(
  filters: OrderFilters,
  cursor: string | null = null,
  signal?: AbortSignal,
): Promise<OrderPage> {
  const { data } = await api.get<OrderPage>("/orders", {
    signal,
    params: {
      ...filters,
      sort: "submitted_desc",
      limit: 50,
      ...(cursor ? { cursor } : {}),
    },
  });
  if (
    !data ||
    data.sort !== "submitted_desc" ||
    !Array.isArray(data.results) ||
    data.results.length > 50 ||
    typeof data.serverTime !== "string" ||
    !Number.isFinite(Date.parse(data.serverTime)) ||
    (data.nextCursor !== null &&
      (typeof data.nextCursor !== "string" ||
        !data.nextCursor ||
        data.nextCursor === cursor))
  )
    throw new Error("Palvelin palautti virheellisen tilauslistan.");
  const ids = new Set<number>();
  for (const [index, row] of data.results.entries()) {
    const previous = data.results[index - 1];
    if (
      !row ||
      !Number.isSafeInteger(row.id) ||
      row.id <= 0 ||
      ids.has(row.id) ||
      typeof row.submittedAt !== "string" ||
      !Number.isFinite(Date.parse(row.submittedAt)) ||
      (previous &&
        (Date.parse(previous.submittedAt) < Date.parse(row.submittedAt) ||
          (previous.submittedAt === row.submittedAt && previous.id <= row.id)))
    )
      throw new Error("Palvelin palautti virheellisen tilauslistan.");
    ids.add(row.id);
  }
  return data;
}

export async function fetchOrderPages(
  filters: OrderFilters,
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
  const receipt = response.data.result.receipt;
  if (
    receipt != null &&
    (!Number.isSafeInteger(receipt.billId) ||
      receipt.billId <= 0 ||
      !Number.isSafeInteger(receipt.amount) ||
      receipt.amount < 0 ||
      !Number.isSafeInteger(receipt.orderCount) ||
      receipt.orderCount < 1 ||
      !["use", "cancelled"].includes(receipt.status))
  )
    throw new Error("Palvelin palautti virheellisen kuitin.");
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
