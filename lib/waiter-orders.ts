import api from "@/lib/api";
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

export async function loadWaiterSetup() {
  const [tables, menu] = await Promise.all([
    api.get<{ results: WaiterTable[] }>("/tables"),
    api.get<{ result: { categories: WaiterCategory[] } }>("/waiter/menu"),
  ]);
  if (
    !Array.isArray(tables.data?.results) ||
    !Array.isArray(menu.data?.result?.categories)
  )
    throw new Error("Palvelin palautti virheelliset tarjoilijan tiedot.");
  return {
    tables: tables.data.results,
    categories: menu.data.result.categories,
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

export async function loadWaiterOrders() {
  const pages = await Promise.all([
    fetchOrderPages({ status: "SUBMITTED" }),
    fetchOrderPages({ status: "CONFIRMED" }),
    fetchOrderPages({ status: "PREPARING" }),
    fetchOrderPages({ status: "READY" }),
  ]);
  // EN: Parallel stage reads can overlap during a transition; keep the latest version once per order.
  // FI: Rinnakkaiset tilahaut voivat limittyä tilan muuttuessa; säilytä vain tilauksen uusin versio.
  const orders = new Map<number, StaffOrder>();
  for (const page of pages) {
    for (const order of page.results) {
      if (order.serviceType !== "DINE_IN") continue;
      const current = orders.get(order.id);
      if (!current || order.version > current.version)
        orders.set(order.id, order);
    }
  }
  return [...orders.values()]
    .filter((order) =>
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
