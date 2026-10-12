"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { isMutationRejected } from "@/lib/mutation-outcome";
import { pathFor } from "./qr-navigation";
import {
  qrErrorText,
  readQrPending,
  submitQrOrder,
  writeLastQrOrder,
  writeQrCart,
  writeQrPending,
} from "@/lib/qr-customer";

export function QrPendingRecovery({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(() => readQrPending(token));
  const [busy, setBusy] = useState(false);
  const [confirmedOrderId, setConfirmedOrderId] = useState<number | null>(null);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  if (!pending)
    return error ? (
      <p role="alert" className="mt-4 text-sm text-destructive">
        {error}
      </p>
    ) : null;
  const retry = async () => {
    if (inFlight.current || (confirmedOrderId && !error)) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    let receivedOrderId = confirmedOrderId;
    try {
      const result = await submitQrOrder(token, pending);
      receivedOrderId = result.orderId;
      setConfirmedOrderId(result.orderId);
      writeLastQrOrder(token, result.orderId);
      writeQrCart(token, []);
      writeQrPending(token, null);
      router.replace(pathFor(token, `/confirmation?orderId=${result.orderId}`));
    } catch (failure) {
      // EN: Local cleanup failure does not undo a confirmed Order; retain its request for an exact retry.
      // FI: Paikallisen siivouksen epäonnistuminen ei peru vahvistettua tilausta; säilytä pyyntö samanlaisena uudelleenyritystä varten.
      setError(
        receivedOrderId
          ? "Tilauksen vahvistusta ei voitu viimeistellä tällä laitteella. Yritä samaa tilausta uudelleen tai pyydä henkilökuntaa tarkistamaan tilaus."
          : isMutationRejected(failure)
            ? `Tilausta ei hyväksytty. ${qrErrorText(failure)}`
            : qrErrorText(failure),
      );
      if (!receivedOrderId && isMutationRejected(failure)) {
        writeQrPending(token, null);
        setPending(null);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="mt-6 rounded-lg border border-border bg-surface p-5">
      <p role="status" className="text-sm">
        {busy
          ? "Tarkistetaan tilausta… Odota vahvistusta."
          : confirmedOrderId
            ? `Tilaus #${confirmedOrderId} vastaanotettu.`
            : "Edellisen lähetyksen tulos on epäselvä. Tarkista sama tilaus ilman muutoksia."}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        className="mt-4 h-12 w-full"
        disabled={busy || (confirmedOrderId !== null && !error)}
        onClick={retry}
      >
        {busy
          ? "Tarkistetaan…"
          : confirmedOrderId && !error
            ? "Tilaus vastaanotettu"
            : "Tarkista edellinen tilaus"}
      </Button>
    </div>
  );
}
