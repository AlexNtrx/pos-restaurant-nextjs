"use client";

import { useCallback, useState } from "react";
import { usePolling } from "@/lib/use-polling";
import { isAxiosError } from "axios";
import { Button } from "@/components/ui/button";
import {
  loadCurrentServiceCall,
  requestServiceCall,
  serviceCallErrorText,
  type ServiceCall,
} from "@/lib/service-calls";

const COOLDOWN_MS = 60_000;

export default function ServiceCallCard({ token }: { token: string }) {
  const [call, setCall] = useState<ServiceCall | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const [unavailable, setUnavailable] = useState(false);

  const poll = useCallback(
    async (signal: AbortSignal) => {
      try {
        const current = await loadCurrentServiceCall(token, signal);
        if (signal.aborted) return;
        setCall(current);
        setNow(Date.now());
        setError("");
      } catch (failure) {
        if (signal.aborted) return;
        if (
          isAxiosError(failure) &&
          [403, 404, 410].includes(failure.response?.status ?? 0)
        ) {
          setCall(null);
          setUnavailable(true);
        }
        setError(serviceCallErrorText(failure));
        throw failure;
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [token],
  );

  const refresh = usePolling(poll, { enabled: !unavailable });

  const active =
    call?.status === "REQUESTED" || call?.status === "ACKNOWLEDGED";
  const coolingDown =
    call?.status === "RESOLVED" &&
    call.resolvedAt !== null &&
    now < Date.parse(call.resolvedAt) + COOLDOWN_MS;

  const request = async () => {
    setSubmitting(true);
    setError("");
    try {
      setCall(await requestServiceCall(token));
      await refresh();
    } catch (failure) {
      await refresh();
      setError(serviceCallErrorText(failure));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mb-7 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Tarvitsetko apua?</h2>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {call?.status === "REQUESTED"
              ? "Kutsu lähetetty. Henkilökunta näkee pöytäsi."
              : call?.status === "ACKNOWLEDGED"
                ? "Henkilökunta on tulossa pöytääsi."
                : call?.status === "RESOLVED"
                  ? "Edellinen pyyntö on hoidettu."
                  : "Kutsu henkilökunta pöytääsi."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-12"
          disabled={
            loading || submitting || active || coolingDown || Boolean(error)
          }
          onClick={() => void request()}
        >
          {submitting
            ? "Lähetetään…"
            : active
              ? "Kutsu lähetetty"
              : coolingDown
                ? "Odota hetki"
                : "Kutsu henkilökunta"}
        </Button>
      </div>
      {error && (
        <div
          className="mt-3 flex items-center justify-between gap-3 text-sm text-destructive"
          role="alert"
        >
          <span>{error}</span>
          <Button type="button" variant="ghost" onClick={() => void refresh()}>
            Yritä uudelleen
          </Button>
        </div>
      )}
    </section>
  );
}
