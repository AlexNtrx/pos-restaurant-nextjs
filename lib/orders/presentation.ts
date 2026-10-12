import type { OrderStatus } from "./contracts";

// EN: Staff distinguish kitchen readiness from a completed Order; customer/kitchen task headings remain contextual.
// FI: Henkilökunta erottaa keittiön valmiin ruoan päättyneestä tilauksesta; asiakkaan ja keittiön tehtäväotsikot säilyvät asiayhteyden mukaisina.
export const staffOrderStatusLabels: Record<OrderStatus, string> = {
  SUBMITTED: "Lähetetty",
  CONFIRMED: "Vahvistettu",
  REJECTED: "Hylätty",
  PREPARING: "Valmistetaan",
  READY: "Valmis keittiöstä",
  SERVED: "Tarjoiltu",
  PAID: "Maksettu",
  COMPLETED: "Päätetty",
  CANCELLED: "Peruttu",
};
