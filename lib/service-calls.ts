import "client-only";

import { isAxiosError } from "axios";
import api, { publicApi } from "@/lib/api";

export type ServiceCallStatus = "REQUESTED" | "ACKNOWLEDGED" | "RESOLVED";

export type ServiceCall = {
  id: number;
  tableNo: number;
  status: ServiceCallStatus;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
};

export type StaffServiceCall = ServiceCall & { version: number };

const isServiceCall = (value: unknown): value is ServiceCall => {
  if (!value || typeof value !== "object") return false;
  const call = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(call.id) &&
    Number.isSafeInteger(call.tableNo) &&
    ["REQUESTED", "ACKNOWLEDGED", "RESOLVED"].includes(String(call.status)) &&
    typeof call.createdAt === "string" &&
    (call.acknowledgedAt === null || typeof call.acknowledgedAt === "string") &&
    (call.resolvedAt === null || typeof call.resolvedAt === "string")
  );
};

const isStaffServiceCall = (value: unknown): value is StaffServiceCall =>
  isServiceCall(value) &&
  Number.isSafeInteger((value as StaffServiceCall).version);

const qrPath = (token: string) =>
  `/qr/${encodeURIComponent(token)}/service-call`;

export async function loadCurrentServiceCall(token: string) {
  const { data } = await publicApi.get<{ result: unknown }>(qrPath(token));
  if (data?.result !== null && !isServiceCall(data?.result))
    throw new Error("Invalid service call response");
  return data.result as ServiceCall | null;
}

export async function requestServiceCall(token: string) {
  const { data } = await publicApi.post<{ result: unknown }>(qrPath(token), {});
  if (!isServiceCall(data?.result))
    throw new Error("Invalid service call response");
  return data.result;
}

export async function loadStaffServiceCalls() {
  const { data } = await api.get<{ results: unknown }>("/service-calls");
  if (!Array.isArray(data?.results) || !data.results.every(isStaffServiceCall))
    throw new Error("Invalid staff service call response");
  return data.results as StaffServiceCall[];
}

export async function changeServiceCallStatus(
  call: StaffServiceCall,
  nextStatus: "ACKNOWLEDGED" | "RESOLVED",
) {
  const { data } = await api.patch<{ result: unknown }>(
    `/service-calls/${call.id}/status`,
    { expectedVersion: call.version, nextStatus },
  );
  if (!isStaffServiceCall(data?.result))
    throw new Error("Invalid staff service call response");
  return data.result;
}

export function serviceCallErrorText(error: unknown) {
  const code = isAxiosError(error) ? error.response?.data?.code : null;
  if (code === "SERVICE_CALL_COOLDOWN")
    return "Odota hetki ennen uutta kutsua.";
  if (code === "QR_INVALID" || code === "SERVICE_UNAVAILABLE")
    return "Pöydän QR-kutsu ei ole enää käytettävissä.";
  if (code === "SERVICE_CALL_CONFLICT")
    return "Pyyntö muuttui toisella laitteella. Lista päivitetään.";
  return "Yhteys epäonnistui. Yritä uudelleen.";
}
