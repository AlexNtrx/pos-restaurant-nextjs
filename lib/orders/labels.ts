import type { StaffOrder } from "./contracts";

export function orderChannelLabel(channel: StaffOrder["channel"]) {
  return channel === "QR" ? "QR" : channel === "STAFF" ? "Tarjoilija" : "Kassa";
}
