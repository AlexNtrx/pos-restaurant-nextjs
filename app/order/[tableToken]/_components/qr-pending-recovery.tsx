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
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  if (!pending)
    return error ? (
      <p role="alert" className="mt-4 text-sm text-destructive">
        {error}
      </p>
    ) : null;
  const retry = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await submitQrOrder(token, pending);
      writeLastQrOrder(token, result.orderId);
      writeQrCart(token, []);
      writeQrPending(token, null);
      router.replace(pathFor(token, `/confirmation?orderId=${result.orderId}`));
    } catch (failure) {
      setError(qrErrorText(failure));
      if (isMutationRejected(failure)) {
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
      <p className="text-sm">
        Edellisen lähetyksen tulos on epäselvä. Tarkista sama tilaus ilman
        muutoksia.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button className="mt-4 h-12 w-full" disabled={busy} onClick={retry}>
        {busy ? "Tarkistetaan…" : "Tarkista edellinen tilaus"}
      </Button>
    </div>
  );
}
