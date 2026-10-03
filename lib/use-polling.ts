"use client";

import { useCallback, useEffect, useRef } from "react";

type Poll = (signal: AbortSignal, reconcile: boolean) => Promise<void>;

// EN: Poll only after the previous round settles. Callers must ignore aborted results and rethrow failures for backoff.
// FI: Kysy vasta edellisen kierroksen päätyttyä. Kutsujan pitää ohittaa keskeytetyt tulokset ja heittää virheet uudelleen odotusajan kasvattamiseksi.
export function usePolling(
  poll: Poll,
  { intervalMs = 5_000, enabled = true } = {},
) {
  const runner = useRef<(() => Promise<void>) | null>(null);
  const refresh = useCallback(
    () => runner.current?.() ?? Promise.resolve(),
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let timer: number | undefined;
    let active: AbortController | null = null;
    let running: Promise<void> | null = null;
    let queued = false;
    let reconcileNext = true;
    let failures = 0;
    const available = () =>
      !disposed && document.visibilityState !== "hidden" && navigator.onLine;
    const clearTimer = () => window.clearTimeout(timer);

    const run = (reconcile: boolean): Promise<void> => {
      reconcileNext ||= reconcile;
      clearTimer();
      if (!available()) return Promise.resolve();
      if (running) {
        // EN: Coalesce manual/action/resume refreshes and discard the older read before it can undo a saved mutation.
        // FI: Yhdistä manuaaliset, toiminnon jälkeiset ja paluun päivitykset; hylkää vanha luku ennen tallennetun muutoksen kumoamista.
        if (reconcile) {
          queued = true;
          active?.abort();
        }
        return running;
      }
      running = Promise.resolve()
        .then(async () => {
          do {
            queued = false;
            if (!available()) break;
            const full = reconcileNext;
            reconcileNext = false;
            const request = new AbortController();
            active = request;
            try {
              await poll(request.signal, full);
              if (!request.signal.aborted) failures = 0;
            } catch {
              if (!request.signal.aborted) {
                failures += 1;
                reconcileNext = true;
              }
            } finally {
              request.abort();
              active = null;
            }
          } while (queued);
        })
        .finally(() => {
          running = null;
          if (available()) {
            const delay = Math.min(
              intervalMs * 2 ** Math.min(failures, 6),
              60_000,
            );
            timer = window.setTimeout(() => void run(false), delay);
          }
        });
      return running;
    };

    const resume = () => {
      if (available()) void run(true);
      else {
        clearTimer();
        reconcileNext = true;
        queued = false;
        active?.abort();
      }
    };
    const manual = () => run(true);
    runner.current = manual;
    timer = window.setTimeout(() => void run(true), 0);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    return () => {
      disposed = true;
      clearTimer();
      active?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
      if (runner.current === manual) runner.current = null;
    };
  }, [poll, intervalMs, enabled]);

  return refresh;
}
