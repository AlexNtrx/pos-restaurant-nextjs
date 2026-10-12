import { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import api from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  parseTaxPolicyReview,
  parseTaxPolicyPage,
  parseTaxPolicyRevision,
  type TaxPolicyReview,
  type TaxPolicyPage,
  type TaxPolicyRevision,
} from "../_lib/tax-policy";
export function useTaxPolicy(
  version: number | null,
  blocked: boolean,
  onBusyChange: (busy: boolean) => void,
) {
  const [review, setReview] = useState<TaxPolicyReview | null>(null);
  const [history, setHistory] = useState<TaxPolicyPage | null>(null);
  const [saved, setSaved] = useState<TaxPolicyRevision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mustRefresh, setMustRefresh] = useState(false);
  const inFlight = useRef(false),
    mounted = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    controller.current = new AbortController();
    try {
      await action(controller.current.signal);
    } catch (err) {
      if (mounted.current) {
        if (isAxiosError(err) && err.response?.status === 409)
          setMustRefresh(true);
        setError(
          getApiErrorMessage(
            err,
            "Toiminto epäonnistui. Näytetyt tiedot säilyvät. Tarkista tallennettu luonnos ennen jatkamista.",
          ),
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  };
  const inspect = () => {
    if (blocked) return;
    return run(async (signal) => {
      const result = parseTaxPolicyReview(
        (await api.get("/organization/tax-policy-review", { signal })).data,
      );
      if (mounted.current) {
        setReview(result);
        setMustRefresh(false);
        setSaved(null);
      }
    });
  };
  const canCreate = Boolean(
    !blocked &&
    !busy &&
    !mustRefresh &&
    !saved &&
    review?.canCreateRevision &&
    review.draftVersion === version,
  );
  const create = () => {
    if (!canCreate || !review) return;
    const expectedDraftVersion = review.draftVersion;
    return run(async (signal) => {
      // EN: Keep the reviewed version for exact retry; never promote a newer draft after a failed request.
      // FI: Säilytä tarkistettu versio täsmällistä uusintaa varten; älä vaihda uudempaan luonnokseen epäonnistuneen pyynnön jälkeen.
      const data = (
        await api.post(
          "/organization/tax-policy-revisions",
          { expectedDraftVersion },
          { signal },
        )
      ).data;
      if (!data || typeof data.created !== "boolean")
        throw new Error("Invalid revision response");
      const revision = parseTaxPolicyRevision(data.revision);
      if (revision.sourceDraftVersion !== expectedDraftVersion)
        throw new Error("Invalid revision version");
      if (mounted.current) {
        setSaved(revision);
        setHistory(null);
      }
    });
  };
  const loadHistory = (page = 1) =>
    run(async (signal) => {
      const result = parseTaxPolicyPage(
        (
          await api.get("/organization/tax-policy-revisions", {
            params: { page, limit: 10 },
            signal,
          })
        ).data,
        page,
      );
      if (mounted.current) setHistory(result);
    });
  return {
    review,
    history,
    saved,
    busy,
    error,
    mustRefresh,
    canCreate,
    inspect,
    create,
    loadHistory,
  };
}
