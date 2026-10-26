import { useCallback, useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { getApiErrorMessage } from "@/lib/api-error";
import { fetchOrderPages } from "@/lib/orders/client";
import type { StaffOrder } from "@/lib/orders/contracts";
import { notifyReadyOrdersChanged } from "@/lib/ready-orders";
import { usePolling } from "@/lib/use-polling";
import { mergeWaiterOrders, serveWaiterOrder } from "@/lib/waiter-orders";

const activeStatuses = [
  "SUBMITTED",
  "CONFIRMED",
  "PREPARING",
  "READY",
] as const;
type Snapshot = {
  orders: StaffOrder[];
  error: string;
};

export function useQrSentOrders(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const denied = useRef(false);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const serving = useRef(false);
  const mounted = useRef(false);
  const servedVersions = useRef(new Map<number, number>());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reportError = useCallback((cause: unknown) => {
    const blocked =
      isAxiosError(cause) && [401, 403].includes(cause.response?.status ?? 0);
    if (blocked) {
      denied.current = true;
      setForbidden(true);
    }
    setSnapshot((current) => ({
      orders: !blocked ? (current?.orders ?? []) : [],
      error: getApiErrorMessage(
        cause,
        "QR-tilauksia ei voitu päivittää. Tarkista tilaus ja yritä uudelleen.",
      ),
    }));
  }, []);

  const poll = useCallback(
    async (signal: AbortSignal) => {
      try {
        // EN: Read every active stage and cursor page across tables; historical orders belong to Tilaushistoria.
        // FI: Lue kaikki aktiiviset tilat ja kohdistinsivut kaikista pöydistä; aiemmat tilaukset kuuluvat Tilaushistoriaan.
        const pages = await Promise.all(
          activeStatuses.map((status) =>
            fetchOrderPages({ channel: "QR", status }, signal),
          ),
        );
        const rows = mergeWaiterOrders(
          [],
          pages.flatMap((page) => page.results),
        );
        if (signal.aborted || denied.current) return;
        if (rows.some((row) => row.channel !== "QR"))
          throw new Error("Virheellinen QR-tilauslista.");
        const orders = rows.filter(
          (row) => (servedVersions.current.get(row.id) ?? 0) < row.version,
        );
        setSnapshot({ orders, error: "" });
      } catch (cause) {
        if (signal.aborted) return;
        reportError(cause);
        throw cause;
      }
    },
    [reportError],
  );
  const refresh = usePolling(poll, {
    enabled: enabled && !forbidden,
  });

  const serve = async (order: StaffOrder) => {
    if (
      !enabled ||
      denied.current ||
      serving.current ||
      order.status !== "READY"
    )
      return;
    serving.current = true;
    setWorkingId(order.id);
    try {
      const served = await serveWaiterOrder(order);
      notifyReadyOrdersChanged();
      if (!mounted.current || denied.current) return;
      // EN: Prevent an older polling response from restoring a READY row after the confirmed serve.
      // FI: Estä vanhaa kyselyvastausta palauttamasta READY-riviä vahvistetun tarjoilun jälkeen.
      servedVersions.current.set(order.id, served.version);
      setSnapshot((state) =>
        state
          ? {
              ...state,
              orders: state.orders.filter((row) => row.id !== order.id),
              error: "",
            }
          : state,
      );
      await refresh();
    } catch (cause) {
      if (!mounted.current) return;
      if (!(
        isAxiosError(cause) && [401, 403].includes(cause.response?.status ?? 0)
      ))
        await refresh();
      reportError(cause);
    } finally {
      serving.current = false;
      if (mounted.current) setWorkingId(null);
    }
  };
  return {
    orders: forbidden ? [] : (snapshot?.orders ?? []),
    loading: !forbidden && !snapshot,
    error:
      snapshot?.error ??
      (forbidden ? "Pääsy estetty. Kirjaudu uudelleen." : ""),
    refresh,
    serve,
    workingId,
  };
}
