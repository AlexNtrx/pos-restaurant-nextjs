import api from "@/lib/api";
import { fetchOrderPages } from "@/lib/orders/client";
import { type StaffOrder, type StaffOrderDetail } from "@/lib/orders/contracts";

type KitchenStatus = "CONFIRMED" | "PREPARING" | "READY";
const kitchenStatuses: readonly KitchenStatus[] = [
  "CONFIRMED",
  "PREPARING",
  "READY",
];

function isKitchenOrder(
  order: StaffOrder,
): order is StaffOrder & { status: KitchenStatus } {
  return kitchenStatuses.some((status) => status === order.status);
}

export function mergeKitchenOrders(
  current: StaffOrder[],
  changes: StaffOrder[],
): StaffOrder[] {
  const byId = new Map(current.map((order) => [order.id, order]));
  for (const order of changes) {
    if (isKitchenOrder(order)) byId.set(order.id, order);
    else byId.delete(order.id);
  }
  return [...byId.values()].sort(
    (left, right) =>
      Date.parse(left.submittedAt) - Date.parse(right.submittedAt) ||
      left.id - right.id,
  );
}

// EN: The earliest server watermark covers Orders that change status while the three columns are read.
// FI: Aikaisin palvelimen aikaleima kattaa tilaukset, joiden tila vaihtuu kolmen sarakkeen luvun aikana.
export async function fetchKitchenSnapshot(signal?: AbortSignal): Promise<{
  results: StaffOrder[];
  serverTime: string;
}> {
  const pages = await Promise.all(
    kitchenStatuses.map((status) => fetchOrderPages({ status }, signal)),
  );
  const serverTime = pages
    .map((page) => page.serverTime)
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0];
  return {
    results: mergeKitchenOrders(
      [],
      pages.flatMap((page) => page.results),
    ),
    serverTime,
  };
}

export async function changeKitchenStatus(
  id: number,
  expectedVersion: number,
  nextStatus: "PREPARING" | "READY",
): Promise<StaffOrderDetail> {
  const response = await api.patch<{ result: StaffOrderDetail }>(
    `/kitchen/orders/${id}/status`,
    { expectedVersion, nextStatus },
  );
  if (!response.data?.result || !Array.isArray(response.data.result.history))
    throw new Error("Palvelin palautti virheellisen tilaustilan.");
  return response.data.result;
}

export async function serveKitchenOrder(
  id: number,
  expectedVersion: number,
): Promise<StaffOrderDetail> {
  const response = await api.patch<{ result: StaffOrderDetail }>(
    `/orders/${id}/serve`,
    { expectedVersion },
  );
  if (!response.data?.result || !Array.isArray(response.data.result.history))
    throw new Error("Palvelin palautti virheellisen tarjoilutilan.");
  return response.data.result;
}
