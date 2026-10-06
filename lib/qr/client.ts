import "client-only";
import { publicApi } from "@/lib/api";
import { readQrCatalog } from "@/lib/catalog-reads";
import type { QrContext, QrMenu, QrOrder, QrPending } from "./contracts";
const encoded = (token: string) => encodeURIComponent(token);

export const loadQrContext = async (token: string) => {
  const response = await publicApi.get<{ result: QrContext }>(
    `/qr/${encoded(token)}/context`,
  );
  if (
    !response.data?.result ||
    !["CLOSED", "MENU_ONLY", "ORDERING"].includes(response.data.result.state) ||
    !Number.isSafeInteger(response.data.result.tableNo)
  )
    throw new Error("Invalid QR context");
  return response.data.result;
};

export const loadQrMenu = async (token: string) => {
  return readQrCatalog(token, (data) => {
    const result = (data as { result?: QrMenu })?.result;
    return Array.isArray(result?.categories) ? result! : null;
  });
};

export const submitQrOrder = async (token: string, pending: QrPending) => {
  const response = await publicApi.post<{
    result: { orderId: number; status: string; total: number };
  }>(`/qr/${encoded(token)}/orders`, pending);
  if (!Number.isSafeInteger(response.data?.result?.orderId))
    throw new Error("Invalid QR order response");
  return response.data.result;
};

export const loadQrOrder = async (
  token: string,
  orderId: number,
  signal?: AbortSignal,
) => {
  const response = await publicApi.get<{ result: QrOrder }>(
    `/qr/${encoded(token)}/orders/${orderId}`,
    { signal },
  );
  if (!Number.isSafeInteger(response.data?.result?.id))
    throw new Error("Invalid QR status response");
  return response.data.result;
};
