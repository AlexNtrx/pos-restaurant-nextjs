"use client";

import { useCallback, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { usePolling } from "@/lib/use-polling";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import api from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  changeOrderStatus,
  fetchOrderPages,
  orderChannelLabel,
  type StaffOrder,
} from "@/app/backoffice/orders/inbox/_lib/staff-orders";
import TableSessionCheckout from "@/app/backoffice/settings/tables/_components/table-session-checkout";

type OpenTable = {
  tableNo: number;
  openSession: { id: number } | null;
};
type PendingAction = {
  order: StaffOrder;
  status: "REJECTED" | "CANCELLED";
};

const active = (order: StaffOrder) =>
  !["REJECTED", "CANCELLED", "PAID", "COMPLETED"].includes(order.status);
const euros = (value: number) =>
  new Intl.NumberFormat("fi-FI", {
    style: "currency",
    currency: "EUR",
  }).format(value);

export default function QrTableOrders({ tableNo }: { tableNo: number }) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkoutSessionId, setCheckoutSessionId] = useState<number | null>(
    null,
  );
  const [action, setAction] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const requestId = useRef(0);
  const [forbidden, setForbidden] = useState(false);

  const poll = useCallback(
    async (signal: AbortSignal) => {
      const currentRequest = ++requestId.current;
      if (!Number.isSafeInteger(tableNo) || tableNo < 1) {
        setSessionId(null);
        setOrders([]);
        setError("");
        return;
      }
      try {
        const response = await api.get<{ results: OpenTable[] }>("/tables", {
          signal,
        });
        if (signal.aborted) return;
        const tables = response.data?.results;
        if (!Array.isArray(tables)) throw new Error("Invalid table response");
        const session = tables.find(
          (row) => row.tableNo === tableNo,
        )?.openSession;
        const id = session?.id ?? null;
        if (id !== null && (!Number.isSafeInteger(id) || id < 1))
          throw new Error("Invalid table session");
        const page = id
          ? await fetchOrderPages({ tableSessionId: id }, signal)
          : null;
        if (page?.results.some((order) => order.tableSessionId !== id))
          throw new Error("Invalid table orders");
        if (signal.aborted || currentRequest !== requestId.current) return;
        setSessionId(id);
        setOrders(page?.results.filter(active) ?? []);
        setError("");
      } catch (cause) {
        if (!signal.aborted && currentRequest === requestId.current) {
          if (
            isAxiosError(cause) &&
            [401, 403].includes(cause.response?.status ?? 0)
          ) {
            setSessionId(null);
            setOrders([]);
            setForbidden(true);
          }
          setError(
            getApiErrorMessage(cause, "Pöydän tilauksia ei voitu ladata."),
          );
          throw cause;
        }
      }
    },
    [tableNo],
  );

  const refresh = usePolling(poll, {
    enabled: !forbidden && Number.isSafeInteger(tableNo) && tableNo > 0,
  });

  const confirm = async (order: StaffOrder) => {
    if (busy) return;
    setBusy(true);
    try {
      await changeOrderStatus(order.id, order.version, "CONFIRMED");
      await refresh();
    } catch (cause) {
      await refresh();
      setError(getApiErrorMessage(cause, "Tilausta ei voitu vahvistaa."));
    } finally {
      setBusy(false);
    }
  };

  const submitReason = async () => {
    if (
      !action ||
      busy ||
      reason.trim().length < 3 ||
      reason.trim().length > 500
    )
      return;
    setBusy(true);
    try {
      await changeOrderStatus(
        action.order.id,
        action.order.version,
        action.status,
        reason.trim(),
      );
      setAction(null);
      setReason("");
      await refresh();
    } catch (cause) {
      await refresh();
      setError(getApiErrorMessage(cause, "Tilausta ei voitu päivittää."));
    } finally {
      setBusy(false);
    }
  };

  if (!Number.isSafeInteger(tableNo) || tableNo < 1) return null;
  return (
    <section
      className="mt-6 border-t border-border pt-4"
      aria-label="Table orders"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Pöydän tilaukset</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void refresh()}
        >
          Päivitä
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {!sessionId ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Pöydässä ei ole avointa istuntoa.
        </p>
      ) : orders.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Ei avoimia tilauksia.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {orders.map((order) => (
            <article
              key={order.id}
              className="rounded-md border border-border p-3 text-xs"
            >
              <div className="flex justify-between gap-2 font-semibold">
                <span>
                  {orderChannelLabel(order.channel)} #{order.id} ·{" "}
                  {order.status}
                </span>
                <span>{euros(order.total)}</span>
              </div>
              <p className="mt-1 text-muted-foreground">
                {order.items
                  .map((item) => `${item.quantity} × ${item.name}`)
                  .join(", ")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {order.status === "SUBMITTED" && (
                  <>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void confirm(order)}
                    >
                      Vahvista keittiöön
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setAction({ order, status: "REJECTED" })}
                    >
                      Hylkää
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setAction({ order, status: "CANCELLED" })}
                >
                  Peruuta
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {sessionId && (
        <Button
          className="mt-3 w-full"
          size="sm"
          variant="outline"
          onClick={() => setCheckoutSessionId(sessionId)}
        >
          Maksa pöytäistunto
        </Button>
      )}
      {checkoutSessionId !== null && (
        <TableSessionCheckout
          key={checkoutSessionId}
          sessionId={checkoutSessionId}
          tableNo={tableNo}
          onClose={() => setCheckoutSessionId(null)}
          onSettled={refresh}
        />
      )}
      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.status === "REJECTED" ? "Hylkää" : "Peruuta"} QR-tilaus #
              {action?.order.id}
            </DialogTitle>
            <DialogDescription>
              Kirjaa syy, jotta muutos näkyy tilaushistoriassa.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1 text-sm">
            <span>Syy (3–500 merkkiä)</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-border bg-surface p-2"
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              Takaisin
            </Button>
            <Button
              variant="destructive"
              disabled={busy || reason.trim().length < 3}
              onClick={() => void submitReason()}
            >
              {action?.status === "REJECTED" ? "Hylkää" : "Peruuta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
