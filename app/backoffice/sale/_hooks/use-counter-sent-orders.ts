import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import api from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import { usePolling } from "@/lib/use-polling";
import {
  parseSentCounterOrders,
  type SentCounterOrder,
} from "@/lib/sale-contracts";
import type { StaffOrderDetail } from "@/lib/orders/contracts";
import type { DraftScope } from "./use-counter-draft";
import type { SentOrderView } from "../_components/counter-sent-orders-list";
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unexpected error";

export default function useCounterSentOrders(draftScope: DraftScope) {
  const [sentOrders, setSentOrders] = useState<SentCounterOrder[]>([]);
  const [sentView, setSentView] = useState<SentOrderView>("active");
  const [selectedSentOrderId, setSelectedSentOrderId] = useState<number | null>(
    null,
  );
  const [sentOrderDetail, setSentOrderDetail] =
    useState<StaffOrderDetail | null>(null);
  const [sentOrderError, setSentOrderError] = useState("");
  const [sentOrderCancelling, setSentOrderCancelling] = useState(false);
  const pendingRequestId = useRef(0);
  const sentDetailRequestId = useRef(0);
  const [sentForbidden, setSentForbidden] = useState(false);
  const readSentOrders = useCallback(
    async (scope: DraftScope, view: SentOrderView, signal: AbortSignal) => {
      const requestId = ++pendingRequestId.current;
      if (scope !== "TAKEAWAY" && (!Number.isSafeInteger(scope) || scope < 1)) {
        setSentOrders([]);
        return;
      }
      try {
        const response = await api.get("/counterOrder/sent", {
          signal,
          params:
            scope === "TAKEAWAY"
              ? { serviceType: "TAKEAWAY", view }
              : { tableNo: scope, view },
        });
        const parsed = parseSentCounterOrders(response.data);
        if (!parsed) throw new Error("Invalid sent orders response");
        if (!signal.aborted && requestId === pendingRequestId.current)
          setSentOrders(parsed);
      } catch (error: unknown) {
        if (!signal.aborted && requestId === pendingRequestId.current) {
          if (
            isAxiosError(error) &&
            [401, 403].includes(error.response?.status ?? 0)
          ) {
            setSentOrders([]);
            setSentForbidden(true);
          }
          toast.error("Unable to load sent orders", {
            description: errorMessage(error),
          });
          throw error;
        }
      }
    },
    [],
  );

  const pollSentOrders = useCallback(
    (signal: AbortSignal) => readSentOrders(draftScope, sentView, signal),
    [readSentOrders, draftScope, sentView],
  );
  const refreshSentOrders = usePolling(pollSentOrders, {
    intervalMs: 10_000,
    enabled: !sentForbidden,
  });

  const loadSentOrderDetail = async (orderId: number) => {
    const requestId = ++sentDetailRequestId.current;
    setSelectedSentOrderId(orderId);
    setSentOrderDetail(null);
    setSentOrderError("");
    try {
      const response = await api.get<{ result: StaffOrderDetail }>(
        `/counterOrder/${orderId}`,
      );
      const result = response.data?.result;
      if (!result || result.id !== orderId || !Array.isArray(result.history))
        throw new Error("Invalid sent order details response");
      if (requestId === sentDetailRequestId.current) setSentOrderDetail(result);
    } catch (error: unknown) {
      if (requestId === sentDetailRequestId.current)
        setSentOrderError(
          getApiErrorMessage(error, "Tilausta ei voitu avata."),
        );
    }
  };

  const closeSentOrderDetail = () => {
    sentDetailRequestId.current += 1;
    setSelectedSentOrderId(null);
    setSentOrderDetail(null);
    setSentOrderError("");
  };

  const cancelSentOrder = async (reason: string) => {
    if (!sentOrderDetail || sentOrderCancelling) return;
    const orderId = sentOrderDetail.id;
    setSentOrderCancelling(true);
    setSentOrderError("");
    try {
      const response = await api.patch<{ result: StaffOrderDetail }>(
        `/counterOrder/${orderId}/cancel`,
        { expectedVersion: sentOrderDetail.version, reason },
      );
      const result = response.data?.result;
      if (
        !result ||
        result.id !== orderId ||
        result.status !== "CANCELLED" ||
        !Array.isArray(result.history)
      )
        throw new Error("Invalid cancellation response");
      setSentOrderDetail(result);
      await refreshSentOrders();
      toast.success(`Tilaus #${orderId} peruttu`);
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, "Tilausta ei voitu perua.");
      await Promise.all([loadSentOrderDetail(orderId), refreshSentOrders()]);
      setSentOrderError(message);
    } finally {
      setSentOrderCancelling(false);
    }
  };

  const invalidateSentOrders = () => {
    pendingRequestId.current += 1;
  };
  return {
    sentOrders,
    sentView,
    selectedSentOrderId,
    sentOrderDetail,
    sentOrderError,
    sentOrderCancelling,
    refreshSentOrders,
    loadSentOrderDetail,
    closeSentOrderDetail,
    cancelSentOrder,
    invalidateSentOrders,
    setSentOrders,
    setSentView,
  };
}
