"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { changeOrderStatus } from "@/lib/orders/client";
import { getApiErrorMessage } from "@/lib/api-error";
import { isMutationRejected } from "@/lib/mutation-outcome";
import {
  assertPendingOwner,
  clearPendingRequest,
  pendingRequestKey,
  readPendingRequest,
  savePendingRequest,
} from "@/lib/pending-request";
import type { StaffOrderDetail } from "@/lib/orders/contracts";

type Cancellation = { expectedVersion: number; reason: string };
const parseCancellation = (value: unknown): Cancellation | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as Cancellation;
  return Number.isSafeInteger(item.expectedVersion) &&
    item.expectedVersion > 0 &&
    typeof item.reason === "string" &&
    item.reason.length >= 3 &&
    item.reason.length <= 500
    ? item
    : null;
};

export function OrderCancellation({
  order,
  onChanged,
}: {
  order: StaffOrderDetail;
  onChanged: () => Promise<void>;
}) {
  const resource = `cancel:${order.id}`;
  const [initial] = useState(() => {
    try {
      return {
        saved: readPendingRequest(resource, parseCancellation),
        error: "",
      };
    } catch (cause) {
      return {
        saved: null,
        error: getApiErrorMessage(
          cause,
          "Tallennettua peruutusta ei voitu lukea.",
        ),
      };
    }
  });
  const [reason, setReason] = useState(initial.saved?.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initial.error);
  const [pending, setPending] = useState(Boolean(initial.saved));
  const request = useRef<Cancellation | null>(initial.saved);
  const inFlight = useRef(false);
  const owner = useRef(pendingRequestKey(resource));

  useEffect(() => {
    const saved = request.current;
    if (
      saved &&
      order.status === "CANCELLED" &&
      order.version === saved.expectedVersion + 1 &&
      order.cancellationReason === saved.reason
    ) {
      // EN: The refreshed Order confirms the exact cancellation after a lost response; never infer success from a timeout.
      // FI: Päivitetty tilaus vahvistaa täsmällisen peruutuksen kadonneen vastauksen jälkeen; aikakatkaisu ei todista onnistumista.
      try {
        clearPendingRequest(resource, owner.current);
        request.current = null;
      } catch {
        // EN: Keep the original account's request if storage or identity changed; never clear another account's recovery.
        // FI: Säilytä alkuperäisen käyttäjän pyyntö tallennuksen tai käyttäjän muuttuessa; älä tyhjennä toisen käyttäjän palautusta.
      }
    }
  }, [order.status, order.version, order.cancellationReason, resource]);

  const cancel = async () => {
    if (inFlight.current || initial.error) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const intent = request.current ?? {
        expectedVersion: order.version,
        reason: reason.trim(),
      };
      savePendingRequest(resource, intent, owner.current);
      request.current = intent;
      setPending(true);
      const result = await changeOrderStatus(
        order.id,
        intent.expectedVersion,
        "CANCELLED",
        intent.reason,
      );
      assertPendingOwner(resource, owner.current);
      if (
        result.id !== order.id ||
        result.status !== "CANCELLED" ||
        result.version !== intent.expectedVersion + 1
      )
        throw new Error("Palvelin palautti virheellisen peruutuksen.");
      clearPendingRequest(resource, owner.current);
      request.current = null;
      setPending(false);
      await onChanged();
    } catch (cause) {
      if (
        isMutationRejected(cause) &&
        pendingRequestKey(resource) === owner.current
      ) {
        try {
          clearPendingRequest(resource, owner.current);
          request.current = null;
          setPending(false);
        } catch (storageError) {
          setError(
            getApiErrorMessage(
              storageError,
              "Tallennettua peruutusta ei voitu tyhjentää. Tarkista tilauksen tila.",
            ),
          );
          await onChanged();
          return;
        }
      }
      setError(
        getApiErrorMessage(
          cause,
          "Peruutusta ei voitu vahvistaa. Päivitä tilauksen tiedot ennen uutta yritystä.",
        ),
      );
      await onChanged();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (
    order.paidAt !== null ||
    order.receipt ||
    order.preparingAt !== null ||
    !["SUBMITTED", "CONFIRMED"].includes(order.status)
  )
    return null;
  return (
    <section
      className="space-y-3 rounded-lg border border-border p-4"
      aria-busy={busy}
    >
      <h3 className="font-semibold">Tilauksen peruutus</h3>
      <p>Tilausta ei ole maksettu. Peruutus ei edellytä rahan palautusta.</p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {pending && (
        <p>
          Tarkistetaan aiempaa peruutusta. Uusinta käyttää samaa syytä ja
          tilausversiota.
        </p>
      )}
      <label className="block">
        Peruutuksen syy
        <textarea
          className="block w-full rounded border p-2"
          maxLength={500}
          disabled={busy || pending}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <Button
        variant="destructive"
        disabled={busy || Boolean(initial.error) || reason.trim().length < 3}
        onClick={() => void cancel()}
      >
        Peruuta tilaus
      </Button>
    </section>
  );
}
