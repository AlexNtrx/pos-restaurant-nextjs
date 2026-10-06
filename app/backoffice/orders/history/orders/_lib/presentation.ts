import type { OrderStatus } from "@/lib/orders/contracts";
const zone = "Europe/Helsinki";
export const currency = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});
const dateTime = new Intl.DateTimeFormat("fi-FI", {
  timeZone: zone,
  dateStyle: "short",
  timeStyle: "short",
});
export const statusLabels: Record<OrderStatus, string> = {
  SUBMITTED: "Odottaa",
  CONFIRMED: "Vahvistettu",
  REJECTED: "Hylätty",
  PREPARING: "Valmistetaan",
  READY: "Valmis keittiöstä",
  SERVED: "Tarjoiltu",
  PAID: "Maksettu",
  COMPLETED: "Päätetty",
  CANCELLED: "Peruttu",
};
export const lifecycleFields = [
  ["submittedAt", "Lähetetty"],
  ["confirmedAt", "Vahvistettu"],
  ["rejectedAt", "Hylätty"],
  ["preparingAt", "Valmistus aloitettu"],
  ["readyAt", "Valmis keittiöstä"],
  ["servedAt", "Tarjoiltu"],
  ["paidAt", "Maksettu"],
  ["completedAt", "Päätetty"],
  ["cancelledAt", "Peruttu"],
] as const;

export function formatTime(value: string) {
  return dateTime.format(new Date(value));
}

export function orderStatusTone(status: OrderStatus) {
  if (status === "REJECTED" || status === "CANCELLED") return "danger";
  if (status === "COMPLETED" || status === "PAID") return "success";
  if (status === "SUBMITTED") return "warning";
  return "info";
}
