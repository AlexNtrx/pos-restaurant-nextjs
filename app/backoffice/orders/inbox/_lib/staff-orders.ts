import type { StaffOrder } from "@/lib/orders/contracts";

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
