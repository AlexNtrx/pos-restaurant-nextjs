import api from "@/lib/api";
import { readStaffCatalog } from "@/lib/catalog-reads";
import {
  changeOrderStatus,
  fetchOrderPages,
  type StaffOrder,
} from "@/app/backoffice/orders/inbox/_lib/staff-orders";

export type WaiterTable = {
  id: number;
  tableNo: number;
  name: string | null;
  openSession: { id: number } | null;
};

export type WaiterCategory = {
  id: number;
  name: string;
  food: { id: number; name: string; price: number; foodTypeId: number }[];
  foodSizes: { id: number; name: string; moneyAdded: number }[];
  tastes: { id: number; name: string }[];
};

export type WaiterItem = {
  foodId: number;
  foodSizeId: number | null;
  tasteId: number | null;
  quantity: number;
  note: string;
};

export async function loadWaiterTables(signal?: AbortSignal) {
  const { data } = await api.get<{ results: WaiterTable[] }>("/tables", {
    signal,
  });
  if (!Array.isArray(data?.results))
    throw new Error("Palvelin palautti virheelliset pöytätiedot.");
  return data.results;
}

export async function loadWaiterSetup(signal?: AbortSignal) {
  const [tables, menu] = await Promise.all([
    loadWaiterTables(signal),
    readStaffCatalog(
      "/waiter/menu",
      (data) => {
        const result = (data as { result?: { categories?: WaiterCategory[] } })
          ?.result;
        return Array.isArray(result?.categories) ? result.categories : null;
      },
      signal,
    ),
  ]);
  return {
    tables,
    categories: menu,
  };
}

export async function openWaiterTable(tableId: number): Promise<number> {
  const response = await api.post<{ result: { session: { id: number } } }>(
    `/tables/${tableId}/sessions`,
  );
  const id = response.data?.result?.session?.id;
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new Error("Pöytäistuntoa ei voitu avata.");
  return id;
}

export async function sendWaiterOrder(
  tableSessionId: number,
  items: WaiterItem[],
  idempotencyKey: string,
  expectedTotal: number,
) {
  const response = await api.post<{ result: StaffOrder }>("/waiter/orders", {
    tableSessionId,
    idempotencyKey,
    expectedTotal,
    items,
  });
  if (!response.data?.result?.id)
    throw new Error("Palvelin palautti virheellisen tilauksen.");
  return response.data.result;
}

export async function loadWaiterSnapshot(signal?: AbortSignal) {
  const pages = await Promise.all([
    fetchOrderPages({ status: "SUBMITTED" }, signal),
    fetchOrderPages({ status: "CONFIRMED" }, signal),
    fetchOrderPages({ status: "PREPARING" }, signal),
    fetchOrderPages({ status: "READY" }, signal),
  ]);
  // EN: Use the earliest stage watermark so transitions during parallel reads are caught by the next incremental round.
  // FI: Käytä aikaisinta tilakohtaista aikaleimaa, jotta rinnakkaisten hakujen aikana muuttuneet tilat löytyvät seuraavalla päivityskierroksella.
  return {
    results: mergeWaiterOrders(
      [],
      pages.flatMap((page) => page.results),
    ),
    serverTime: pages
      .map((page) => page.serverTime)
      .sort((left, right) => Date.parse(left) - Date.parse(right))[0],
  };
}

export async function loadWaiterOrders() {
  return (await loadWaiterSnapshot()).results;
}

export function mergeWaiterOrders(
  current: StaffOrder[],
  changes: StaffOrder[],
) {
  // EN: Parallel stage reads can overlap during a transition; keep the latest version once per order.
  // FI: Rinnakkaiset tilahaut voivat limittyä tilan muuttuessa; säilytä vain tilauksen uusin versio.
  const orders = new Map(current.map((order) => [order.id, order]));
  for (const order of changes) {
    const previous = orders.get(order.id);
    if (!previous || order.version > previous.version)
      orders.set(order.id, order);
  }
  return [...orders.values()]
    .filter(
      (order) =>
        order.serviceType === "DINE_IN" &&
        ["SUBMITTED", "CONFIRMED", "PREPARING", "READY"].includes(order.status),
    )
    .sort((left, right) => left.id - right.id);
}

export async function cancelWaiterOrder(order: StaffOrder, reason: string) {
  return changeOrderStatus(order.id, order.version, "CANCELLED", reason.trim());
}

export async function serveWaiterOrder(order: StaffOrder) {
  const response = await api.patch<{ result: StaffOrder }>(
    `/orders/${order.id}/serve`,
    { expectedVersion: order.version },
  );
  if (
    response.data?.result?.id !== order.id ||
    !Number.isSafeInteger(response.data.result.version) ||
    response.data.result.version <= order.version ||
    !["SERVED", "COMPLETED"].includes(response.data.result.status)
  )
    throw new Error("Palvelin palautti virheellisen tilaustilan.");
  return response.data.result;
}
