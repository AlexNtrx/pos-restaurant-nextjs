import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  parseTaxPublicationReadiness,
  type TaxPublicationReadiness,
} from "../_lib/tax-publication-readiness";
export function useTaxPublicationReadiness(
  onBusyChange: (busy: boolean) => void,
) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [report, setReport] = useState<TaxPublicationReadiness | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const mounted = useRef(false),
    requestId = useRef(0),
    activeId = useRef<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  const inspect = async (revisionId: number) => {
    if (activeId.current === revisionId) return;
    controller.current?.abort();
    controller.current = new AbortController();
    const id = ++requestId.current;
    activeId.current = revisionId;
    setSelectedId(revisionId);
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const result = parseTaxPublicationReadiness(
        (
          await api.get("/organization/tax-policy-publication-readiness", {
            params: { revisionId },
            signal: controller.current.signal,
          })
        ).data,
        revisionId,
      );
      // EN: A result always belongs to its explicitly selected revision; an older request cannot replace a newer selection.
      // FI: Tulos kuuluu aina nimenomaisesti valittuun versioon; vanhempi pyyntö ei voi korvata uudempaa valintaa.
      if (mounted.current && id === requestId.current) setReport(result);
    } catch (err) {
      if (mounted.current && id === requestId.current)
        setError(
          getApiErrorMessage(
            err,
            "Tarkistusta ei voitu ladata. Aiempi tulos säilyy ja voi olla vanhentunut.",
          ),
        );
    } finally {
      if (mounted.current && id === requestId.current) {
        activeId.current = null;
        setBusy(false);
        onBusyChange(false);
      }
    }
  };
  return { selectedId, report, busy, error, inspect };
}
