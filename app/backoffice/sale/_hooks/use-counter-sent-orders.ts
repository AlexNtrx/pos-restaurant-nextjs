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
import { fetchOrderDetail } from "@/lib/orders/client";
import { notifyReadyOrdersChanged } from "@/lib/ready-orders";
import type { DraftScope } from "./use-counter-draft";

export default function useCounterSentOrders(
  draftScope: DraftScope,
  enabled = true,
) {
  const [sentOrders, setSentOrders] = useState<SentCounterOrder[]>([]);
  const [sentLoading, setSentLoading] = useState(true);
  const [sentListError, setSentListError] = useState("");
  const [selectedSentOrderId, setSelectedSentOrderId] = useState<number | null>(
    null,
  );
  const [sentOrderDetail, setSentOrderDetail] =
    useState<StaffOrderDetail | null>(null);
  const [sentOrderError, setSentOrderError] = useState("");
  const [sentOrderCancelling, setSentOrderCancelling] = useState(false);
  const [sentOrderServing, setSentOrderServing] = useState(false);
  const serveInFlight = useRef(false);
  const pendingRequestId = useRef(0);
  const sentDetailRequestId = useRef(0);
  const [sentForbidden, setSentForbidden] = useState(false);
  const readSentOrders = useCallback(
    async (scope: DraftScope, signal: AbortSignal) => {
      const requestId = ++pendingRequestId.current;
      if (scope !== "TAKEAWAY" && (!Number.isSafeInteger(scope) || scope < 1)) {
        setSentOrders([]);
        setSentLoading(false);
        setSentListError("Valitse kelvollinen pöytänumero.");
        return;
      }
      try {
        setSentLoading(true);
        const response = await api.get("/counterOrder/sent", {
          signal,
          params:
            scope === "TAKEAWAY"
              ? { serviceType: "TAKEAWAY", view: "active" }
              : { tableNo: scope, view: "active" },
        });
        const parsed = parseSentCounterOrders(response.data);
        if (!parsed) throw new Error("Invalid sent orders response");
        if (!signal.aborted && requestId === pendingRequestId.current) {
          setSentOrders(parsed);
          setSentListError("");
        }
      } catch (error: unknown) {
        if (!signal.aborted && requestId === pendingRequestId.current) {
          if (
            isAxiosError(error) &&
            [401, 403].includes(error.response?.status ?? 0)
          ) {
            setSentOrders([]);
            setSentForbidden(true);
          }
          setSentListError(
            getApiErrorMessage(
              error,
              "Tilauksia ei voitu ladata. Yritä päivittää lista.",
            ),
          );
          throw error;
        }
      } finally {
        if (!signal.aborted && requestId === pendingRequestId.current)
          setSentLoading(false);
      }
    },
    [],
  );

  const pollSentOrders = useCallback(
    (signal: AbortSignal) => readSentOrders(draftScope, signal),
    [readSentOrders, draftScope],
  );
  const refreshSentOrders = usePolling(pollSentOrders, {
    intervalMs: 10_000,
    enabled: enabled && !sentForbidden,
  });

  const loadSentOrderDetail = async (
    orderId: number,
    preserveDetail = false,
  ) => {
    const requestId = ++sentDetailRequestId.current;
    setSelectedSentOrderId(orderId);
    if (!preserveDetail) setSentOrderDetail(null);
    setSentOrderError("");
    try {
      const response = await api.get<{ result: StaffOrderDetail }>(
        `/counterOrder/${orderId}`,
      );
      const result = response.data?.result;
      if (!result || result.id !== orderId || !Array.isArray(result.history))
        throw new Error("Invalid sent order details response");
      // EN: Keep the owned Counter lookup, then read original receipt metadata through the shared cashier detail API.
      // FI: Säilytä oman kassatilauksen haku ja lue sitten alkuperäisen kuitin tiedot yhteisestä kassatyöntekijän tarkenne-API:sta.
      const detail = result.paidAt ? await fetchOrderDetail(orderId) : result;
      if (detail.id !== orderId)
        throw new Error("Invalid order details response");
      if (requestId === sentDetailRequestId.current) setSentOrderDetail(detail);
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

  // EN: Keep the refund component mounted while refreshing so its pending request and manual confirmation remain intact.
  // FI: Pidä palautuskomponentti asennettuna päivityksen ajan, jotta odottava pyyntö ja käsin tehtävä vahvistus säilyvät.
  const refreshSelectedSentOrder = async () => {
    if (selectedSentOrderId === null) return;
    await Promise.all([
      loadSentOrderDetail(selectedSentOrderId, true),
      refreshSentOrders(),
    ]);
  };

  const cancelSentOrder = async (reason: string) => {
    if (!sentOrderDetail || sentOrderCancelling || serveInFlight.current)
      return;
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

  // EN: Serve the saved version once and reread after errors instead of guessing an uncertain outcome.
  // FI: Tarjoile tallennettu versio kerran ja lue tiedot virheen jälkeen uudelleen epävarman tuloksen arvaamisen sijaan.
  const serveSentOrder = async (
    selectedOrder: Pick<
      SentCounterOrder,
      "id" | "version" | "status"
    > | null = sentOrderDetail,
  ) => {
    if (
      !selectedOrder ||
      selectedOrder.status !== "READY" ||
      sentOrderCancelling ||
      serveInFlight.current
    )
      return;
    // EN: A row action sends its displayed version; the server rejects stale stages or versions.
    // FI: Rivitoiminto lähettää näytetyn version; palvelin hylkää vanhentuneet tilat tai versiot.
    const order = selectedOrder;
    serveInFlight.current = true;
    setSentOrderServing(true);
    setSentOrderError("");
    try {
      const response = await api.patch<{ result: StaffOrderDetail }>(
        `/orders/${order.id}/serve`,
        { expectedVersion: order.version },
      );
      const result = response.data?.result;
      if (
        !result ||
        result.id !== order.id ||
        !Number.isSafeInteger(result.version) ||
        result.version <= order.version ||
        !["SERVED", "COMPLETED"].includes(result.status) ||
        !Array.isArray(result.history)
      )
        throw new Error("Palvelin palautti virheellisen tarjoilutilan.");
      // EN: Serving a prepaid Counter order also completes it; only the server decides the saved status.
      // FI: Ennakkoon maksetun kassatilauksen tarjoilu myös päättää sen; vain palvelin päättää tallennetun tilan.
      pendingRequestId.current += 1;
      if (selectedSentOrderId === order.id) setSentOrderDetail(result);
      setSentOrders((current) =>
        current.flatMap((item) =>
          item.id !== order.id
            ? [item]
            : result.status === "COMPLETED"
              ? []
              : [{ ...item, status: result.status, version: result.version }],
        ),
      );
      toast.success(`Tilaus #${order.id} merkitty tarjoilluksi`);
      notifyReadyOrdersChanged();
    } catch (error: unknown) {
      await loadSentOrderDetail(order.id);
      setSentOrderError(
        getApiErrorMessage(
          error,
          "Tarjoilua ei voitu vahvistaa. Tarkista tilauksen tila.",
        ),
      );
    } finally {
      serveInFlight.current = false;
      setSentOrderServing(false);
      void refreshSentOrders();
    }
  };

  return {
    sentOrders,
    sentLoading,
    sentListError,
    selectedSentOrderId,
    sentOrderDetail,
    sentOrderError,
    sentOrderCancelling,
    sentOrderServing,
    refreshSentOrders,
    loadSentOrderDetail,
    refreshSelectedSentOrder,
    closeSentOrderDetail,
    cancelSentOrder,
    serveSentOrder,
    invalidateSentOrders,
    setSentOrders,
  };
}
