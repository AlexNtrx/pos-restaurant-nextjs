"use client";

import { useCallback, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { usePolling } from "@/lib/use-polling";
import {
  hasReadyOrders,
  READY_ORDERS_CHANGED,
  type ReadyOrderScope,
} from "@/lib/ready-orders";

export function useReadyOrders(scope: ReadyOrderScope | null) {
  const [snapshot, setSnapshot] = useState<{
    scope: ReadyOrderScope;
    ready: boolean;
  } | null>(null);
  const [blockedScope, setBlockedScope] = useState<ReadyOrderScope | null>(
    null,
  );
  const poll = useCallback(
    async (signal: AbortSignal) => {
      if (scope === null) return;
      try {
        const ready = await hasReadyOrders(scope, signal);
        if (!signal.aborted) setSnapshot({ scope, ready });
      } catch (error) {
        if (signal.aborted) return;
        if (
          isAxiosError(error) &&
          [401, 403].includes(error.response?.status ?? 0)
        ) {
          setSnapshot(null);
          setBlockedScope(scope);
        }
        // EN: Keep the last confirmed indicator on transient failures; the shared scheduler retries with backoff.
        // FI: Säilytä viimeksi vahvistettu merkki tilapäisessä virheessä; yhteinen ajastin yrittää uudelleen kasvavalla viiveellä.
        throw error;
      }
    },
    [scope],
  );
  const refresh = usePolling(poll, {
    enabled: scope !== null && scope !== blockedScope,
  });
  useEffect(() => {
    const changed = () => void refresh();
    window.addEventListener(READY_ORDERS_CHANGED, changed);
    return () => window.removeEventListener(READY_ORDERS_CHANGED, changed);
  }, [refresh]);
  return snapshot?.scope === scope && snapshot.ready;
}
