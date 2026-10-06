import type { OrderStatus } from "@/lib/orders/contracts";
export type ActionStatus = "CONFIRMED" | "REJECTED" | "CANCELLED";
export const currency = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});
export const localTime = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  dateStyle: "short",
  timeStyle: "short",
});
export const actionText: Record<ActionStatus, string> = {
  CONFIRMED: "Vahvista",
  REJECTED: "Hylkää",
  CANCELLED: "Peruuta",
};
export const statusText: Partial<Record<OrderStatus, string>> = {
  SUBMITTED: "Odottaa",
  CONFIRMED: "Vahvistettu",
  REJECTED: "Hylätty",
  CANCELLED: "Peruttu",
};
