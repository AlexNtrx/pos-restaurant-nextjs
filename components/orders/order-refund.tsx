"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import { isMutationRejected } from "@/lib/mutation-outcome";
import {
  readPendingRequest,
  savePendingRequest,
  clearPendingRequest,
  pendingRequestKey,
  assertPendingOwner,
} from "@/lib/pending-request";
import type { StaffOrderDetail } from "@/lib/orders/contracts";

type Refund = {
  id: number;
  amount: number;
  method: "cash" | "bank";
  status: "PENDING" | "FAILED" | "COMPLETED";
  idempotencyKey: string;
  reference: string | null;
  failureReason: string | null;
};
type Reservation = {
  expectedVersion: number;
  idempotencyKey: string;
  reason: string;
  method: "cash" | "bank";
};
const parseReservation = (value: unknown): Reservation | null => {
  if (!value || typeof value !== "object") return null;
  const saved = value as Reservation;
  return Number.isSafeInteger(saved.expectedVersion) &&
    saved.expectedVersion > 0 &&
    typeof saved.idempotencyKey === "string" &&
    !!saved.idempotencyKey &&
    typeof saved.reason === "string" &&
    saved.reason.length >= 3 &&
    saved.reason.length <= 500 &&
    ["cash", "bank"].includes(saved.method)
    ? saved
    : null;
};
const currency = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});
function parseRefund(value: unknown): Refund {
  if (!value || typeof value !== "object")
    throw new Error("Palvelin palautti virheellisen palautuksen.");
  const item = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(item.id) ||
    typeof item.amount !== "number" ||
    !Number.isSafeInteger(item.amount) ||
    item.amount < 0 ||
    !["cash", "bank"].includes(String(item.method)) ||
    !["PENDING", "FAILED", "COMPLETED"].includes(String(item.status)) ||
    typeof item.idempotencyKey !== "string" ||
    !item.idempotencyKey ||
    !(item.reference === null || typeof item.reference === "string") ||
    !(item.failureReason === null || typeof item.failureReason === "string")
  )
    throw new Error("Palvelin palautti virheellisen palautuksen.");
  return value as Refund;
}

// EN: This component is used on the admin history page; the API independently verifies current admin authority.
// FI: Komponenttia käytetään ylläpitäjän historiasivulla; API tarkistaa ylläpitäjän nykyisen oikeuden erikseen.
export function OrderRefund({
  order,
  onChanged,
}: {
  order: StaffOrderDetail;
  onChanged: () => Promise<void>;
}) {
  const [refund, setRefund] = useState<Refund | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<"cash" | "bank">("cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reservationRequested, setReservationRequested] = useState(false);
  const request = useRef<Reservation | null>(null);
  const inFlight = useRef(false);
  const resource = `refund:${order.id}`;
  const ownerKeyRef = useRef(pendingRequestKey(resource));
  useEffect(() => {
    if (
      !order.paidAt ||
      !["SUBMITTED", "CONFIRMED", "CANCELLED"].includes(order.status)
    )
      return;
    let active = true;
    api
      .get<{ result: Refund | null }>(`/orders/${order.id}/refund`)
      .then((response) => {
        if (active) {
          assertPendingOwner(resource, ownerKeyRef.current);
          setRefund(
            response.data.result === null
              ? null
              : parseRefund(response.data.result),
          );
          const saved = readPendingRequest(resource, parseReservation);
          if (saved && response.data.result === null) {
            request.current = saved;
            setReason(saved.reason);
            setMethod(saved.method);
            setReservationRequested(true);
          } else if (
            saved &&
            response.data.result?.idempotencyKey === saved.idempotencyKey
          )
            clearPendingRequest(resource);
          setLoaded(true);
        }
      })
      .catch((cause) => {
        if (active)
          setError(getApiErrorMessage(cause, "Palautusta ei voitu ladata."));
      });
    return () => {
      active = false;
    };
  }, [order.id, order.paidAt, order.status, resource]);
  async function act(action: "reserve" | "complete" | "fail") {
    if (inFlight.current || !loaded) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const ownerKey = ownerKeyRef.current;
    try {
      // EN: Keep the exact reservation request after an uncertain response; a retry cannot create a second refund.
      // FI: Säilytä täsmällinen varauspyyntö epävarman vastauksen jälkeen; uusinta ei voi luoda toista palautusta.
      if (action === "reserve") {
        const payload = request.current ?? {
          expectedVersion: order.version,
          idempotencyKey: crypto.randomUUID(),
          reason: reason.trim(),
          method,
        };
        savePendingRequest(resource, payload, ownerKey);
        request.current = payload;
        setReservationRequested(true);
      }
      assertPendingOwner(resource, ownerKey);
      const response = await api.post<{ result: Refund }>(
        `/orders/${order.id}/refund${action === "reserve" ? "" : `/${action}`}`,
        action === "reserve"
          ? request.current
          : {
              idempotencyKey: refund!.idempotencyKey,
              ...(action === "complete"
                ? { reference: reference.trim() }
                : { reason: reference.trim() }),
            },
      );
      const result = parseRefund(response.data.result);
      assertPendingOwner(resource, ownerKey);
      if (action === "reserve") clearPendingRequest(resource, ownerKey);
      setRefund(result);
      await onChanged();
    } catch (cause) {
      if (
        action === "reserve" &&
        isMutationRejected(cause) &&
        pendingRequestKey(resource) === ownerKey
      ) {
        clearPendingRequest(resource, ownerKey);
        request.current = null;
        setReservationRequested(false);
      }
      setError(
        getApiErrorMessage(
          cause,
          "Palautusta ei voitu tallentaa. Tarkista tila ennen uutta yritystä.",
        ),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const canReserve =
    order.paidAt !== null &&
    order.preparingAt === null &&
    ["SUBMITTED", "CONFIRMED"].includes(order.status);
  if (!canReserve && !refund && !error) return null;
  return (
    <section
      className="space-y-3 rounded-lg border border-border p-4"
      aria-busy={busy}
    >
      <h3 className="font-semibold">Peruutus ja rahan palautus</h3>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {loaded && !refund && canReserve && (
        <>
          <p>
            Varaa peruutus ennen valmistusta. Varaus pysäyttää tilauksen, mutta
            rahat eivät vielä palaudu.
          </p>
          <label className="block">
            Peruutuksen syy
            <textarea
              className="block w-full rounded border p-2"
              maxLength={500}
              value={reason}
              disabled={busy || reservationRequested}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className="block">
            Palautustapa
            <select
              className="ml-2 rounded border p-2"
              value={method}
              disabled={busy || reservationRequested}
              onChange={(event) =>
                setMethod(event.target.value as "cash" | "bank")
              }
            >
              <option value="cash">Käteinen</option>
              <option value="bank">Pankki</option>
            </select>
          </label>
          <Button
            disabled={busy || reason.trim().length < 3}
            onClick={() => void act("reserve")}
          >
            Varaa peruutus ja palautus
          </Button>
        </>
      )}
      {refund && (
        <>
          <p>
            {currency.format(refund.amount)} ·{" "}
            {refund.method === "cash" ? "Käteinen" : "Pankki"} ·{" "}
            {refund.status === "COMPLETED"
              ? "Palautus vahvistettu"
              : refund.status === "FAILED"
                ? "Palautus epäonnistui"
                : "Palautus kesken"}
          </p>
          {refund.reference && <p>Tosite / viite: {refund.reference}</p>}
          {refund.failureReason && (
            <p className="text-destructive">{refund.failureReason}</p>
          )}
          {refund.status !== "COMPLETED" && (
            <>
              <p>
                Palauta rahat erikseen. Vahvista vasta, kun koko summa on
                palautettu. Tämä toiminto kirjaa palautuksen eikä siirrä rahaa.
              </p>
              <label className="block">
                Tosite / viite tai epäonnistumisen syy
                <textarea
                  className="block w-full rounded border p-2"
                  maxLength={500}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  disabled={busy}
                />
              </label>
              <Button
                disabled={busy || reference.trim().length < 3}
                onClick={() => void act("complete")}
              >
                Vahvista rahat palautetuiksi
              </Button>
              <Button
                variant="outline"
                disabled={busy || reference.trim().length < 3}
                onClick={() => void act("fail")}
              >
                Kirjaa palautuksen epäonnistuminen
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}
