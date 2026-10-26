"use client";

import { useCallback, useState } from "react";
import { isAxiosError } from "axios";
import { usePolling } from "@/lib/use-polling";
import {
  changeServiceCallStatus,
  loadStaffServiceCalls,
  serviceCallErrorText,
  type StaffServiceCall,
} from "@/lib/service-calls";

// EN: The button indicator and open dialog share one queue and polling stream so acknowledging a call updates both.
// FI: Painikkeen merkki ja avoin dialogi jakavat saman jonon ja kyselyvirran, jotta kutsun vastaanotto päivittää molemmat.
export function useStaffServiceCalls({ enabled = true } = {}) {
  const [calls, setCalls] = useState<StaffServiceCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const poll = useCallback(async (signal: AbortSignal) => {
    try {
      const results = await loadStaffServiceCalls(signal);
      if (signal.aborted) return;
      setCalls(results);
      setError("");
    } catch (failure) {
      if (signal.aborted) return;
      if (
        isAxiosError(failure) &&
        [401, 403].includes(failure.response?.status ?? 0)
      ) {
        setCalls([]);
        setForbidden(true);
      }
      setError(serviceCallErrorText(failure));
      throw failure;
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);
  const refresh = usePolling(poll, { enabled: enabled && !forbidden });
  const advance = async (call: StaffServiceCall) => {
    setWorkingId(call.id);
    try {
      await changeServiceCallStatus(
        call,
        call.status === "REQUESTED" ? "ACKNOWLEDGED" : "RESOLVED",
      );
      await refresh();
    } catch (failure) {
      await refresh();
      setError(serviceCallErrorText(failure));
    } finally {
      setWorkingId(null);
    }
  };
  return { calls, loading, error, workingId, refresh, advance };
}

export type StaffServiceCallsState = ReturnType<typeof useStaffServiceCalls>;
