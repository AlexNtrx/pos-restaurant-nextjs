import type { StaffOrder } from "@/lib/orders/contracts";
// EN: This is a UI hint; the backend rechecks payment, status and version when cancelling.
// FI: Tämä on käyttöliittymän vihje; palvelin tarkistaa maksun, tilan ja version uudelleen peruttaessa.
export function canCancelOrder(order: StaffOrder) {
  return (
    order.paidAt === null &&
    order.preparingAt === null &&
    ["SUBMITTED", "CONFIRMED"].includes(order.status)
  );
}
