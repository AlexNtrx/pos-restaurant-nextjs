import { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import api from "@/lib/api";
import { readAuthSession } from "@/lib/auth-session";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  pendingRequestKey,
  pendingResources,
  readPendingRequest,
  savePendingRequest,
  clearPendingRequest,
  assertPendingOwner,
} from "@/lib/pending-request";
import {
  ApprovalInputError,
  emptyEvidence,
  evidenceFromForm,
  parseApprovalPage,
  parseCreatedApproval,
  parseSavedApproval,
  type ApprovalSource,
  type EvidenceForm,
  type SavedApprovalRequest,
  type TaxApproval,
  type TaxApprovalPage,
} from "../_lib/tax-approval";
const PREFIX = "tax-approval:";
const resource = (attempt: SavedApprovalRequest) =>
  `${PREFIX}${attempt.payload.idempotencyKey}`;
const definitive = new Set([
  "INVALID_TAX_APPROVAL_REQUEST",
  "TAX_APPROVAL_SOURCE_CHANGED",
  "TAX_APPROVAL_INCOMPLETE",
  "TAX_POLICY_APPROVAL_ALREADY_EXISTS",
  "TAX_POLICY_REVISION_NOT_FOUND",
  "TAX_POLICY_REVISION_INVALID",
  "TAX_POLICY_DRAFT_INVALID",
]);
export function useTaxApproval(onBusyChange: (busy: boolean) => void) {
  const [source, setSource] = useState<ApprovalSource | null>(null),
    [forms, setForms] = useState<Record<number, EvidenceForm>>({});
  const [attempts, setAttempts] = useState<SavedApprovalRequest[]>([]),
    [pending, setPending] = useState<SavedApprovalRequest | null>(null);
  const [history, setHistory] = useState<TaxApprovalPage | null>(null),
    [saved, setSaved] = useState<TaxApproval | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [invalidField, setInvalidField] = useState("");
  const [blockedStorage, setBlockedStorage] = useState(false),
    [ownerChanged, setOwnerChanged] = useState(false),
    [mayEdit, setMayEdit] = useState(false);
  const mounted = useRef(false),
    initialized = useRef(false),
    inFlight = useRef(false),
    owner = useRef<{ key: string | null; token: string | null }>({
      key: null,
      token: null,
    });
  const controller = useRef<AbortController | null>(null);
  const owns = () => {
    try {
      return (
        owner.current.key !== null &&
        pendingRequestKey(PREFIX) === owner.current.key &&
        readAuthSession()?.token === owner.current.token
      );
    } catch {
      return false;
    }
  };
  const syncPending = () => {
    const resources = pendingResources(PREFIX);
    if (resources.length > 100)
      throw new Error("Too many pending review requests");
    return resources.map((key) => {
      const attempt = readPendingRequest(key, parseSavedApproval);
      if (!attempt || key !== resource(attempt))
        throw new Error("Invalid pending review request");
      return attempt;
    });
  };
  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    // EN: Restore browser state after hydration; cancelled mounts never restore another session's evidence.
    // FI: Palauta selaimen tila hydraation jälkeen; perutut liitokset eivät palauta toisen istunnon tositteita.
    queueMicrotask(() => {
      if (disposed) return;
      try {
        owner.current = {
          key: pendingRequestKey(PREFIX),
          token: readAuthSession()?.token ?? null,
        };
        if (owner.current.key) {
          const existing = syncPending();
          setAttempts(existing);
          if (existing.length) {
            setPending(existing[0]);
            setSource(existing[0].source);
          }
        }
      } catch {
        setBlockedStorage(true);
        setError(
          "Tallennettu pyyntö on virheellinen tai tallennus ei ole käytettävissä. Tarkista hyväksyntähistoria ennen uutta yritystä.",
        );
      } finally {
        initialized.current = true;
      }
    });
    const checkOwner = () => {
      if (owner.current.key && !owns()) {
        setOwnerChanged(true);
        controller.current?.abort();
      }
    };
    window.addEventListener("storage", checkOwner);
    window.addEventListener("focus", checkOwner);
    return () => {
      disposed = true;
      mounted.current = false;
      controller.current?.abort();
      window.removeEventListener("storage", checkOwner);
      window.removeEventListener("focus", checkOwner);
    };
  }, []);
  const form = pending
    ? {
        ...pending.payload.reviewEvidence,
        attestations: pending.payload.reviewEvidence.attestations,
      }
    : source
      ? (forms[source.id] ?? emptyEvidence())
      : emptyEvidence();
  const select = (next: ApprovalSource) => {
    if (
      !initialized.current ||
      inFlight.current ||
      pending ||
      blockedStorage ||
      attempts.length
    )
      return;
    if (!owns()) {
      setOwnerChanged(true);
      return;
    }
    setSource(next);
    setError("");
    setInvalidField("");
    setSaved(null);
  };
  const edit = (next: EvidenceForm) => {
    if (source && !pending && !inFlight.current && owns())
      setForms((old) => ({ ...old, [source.id]: next }));
  };
  const run = async (action: () => Promise<void>) => {
    if (!initialized.current || inFlight.current) return;
    if (!owns()) {
      setOwnerChanged(true);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    controller.current = new AbortController();
    try {
      await action();
    } catch (cause) {
      if (mounted.current && owns())
        setError(
          getApiErrorMessage(
            cause,
            "Tarkistuksen hyväksyntää ei voitu käsitellä. Tiedot säilyvät.",
          ),
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        if (!owns()) setOwnerChanged(true);
        setBusy(false);
        onBusyChange(false);
      }
    }
  };
  const loadHistory = (page = 1) =>
    run(async () => {
      const result = parseApprovalPage(
        (
          await api.get("/organization/tax-policy-approvals", {
            params: { page, limit: 10 },
            signal: controller.current!.signal,
          })
        ).data,
      );
      if (mounted.current && owns()) setHistory(result);
    });
  const submit = (allowed: boolean) => {
    if (blockedStorage || (!pending && !allowed)) return;
    return run(async () => {
      let attempt = pending;
      if (!attempt) {
        if (!source) return;
        setInvalidField("");
        let reviewEvidence;
        try {
          reviewEvidence = evidenceFromForm(form);
        } catch (cause) {
          if (cause instanceof ApprovalInputError) {
            setInvalidField(cause.field);
            setError(cause.message);
          } else throw cause;
          return;
        }
        const existing = syncPending();
        if (existing.length) {
          setAttempts(existing);
          setPending(existing[0]);
          setSource(existing[0].source);
          setError(
            "Toisessa välilehdessä on aiempi yritys. Tarkista sen tulos ensin.",
          );
          return;
        }
        attempt = {
          schemaVersion: 1,
          source,
          payload: {
            sourceRevisionId: source.id,
            expectedDraftVersion: source.sourceDraftVersion,
            idempotencyKey: crypto.randomUUID(),
            reviewEvidence,
          },
        };
        // EN: Persist each original intent under its own key before sending; competing tabs cannot overwrite another pending request.
        // FI: Tallenna jokainen alkuperäinen pyyntö omalle avaimelleen ennen lähetystä; kilpailevat välilehdet eivät voi korvata toista keskeneräistä pyyntöä.
        const key = pendingRequestKey(resource(attempt));
        try {
          savePendingRequest(resource(attempt), attempt, key);
        } catch {
          setError(
            "Tallennettu pyyntö ei voitu säilyttää. Mitään ei lähetetty. Tarkista selaimen tallennus ennen jatkamista.",
          );
          return;
        }
        setPending(attempt);
        setAttempts(syncPending());
      }
      setMayEdit(false);
      const current = attempt,
        key = pendingRequestKey(resource(current));
      assertPendingOwner(resource(current), key);
      try {
        const result = parseCreatedApproval(
          (
            await api.post(
              "/organization/tax-policy-approvals",
              current.payload,
              { signal: controller.current!.signal },
            )
          ).data,
          current.payload,
        );
        if (!mounted.current || !owns()) return;
        if (result.recordedByUserId !== Number(readAuthSession()?.userId))
          throw new Error("Invalid approval actor");
        setSaved(result);
        setForms((old) => ({
          ...old,
          [current.source.id]: { ...result.reviewEvidence },
        }));
        clearPendingRequest(resource(current), key);
        setPending(null);
        setAttempts(syncPending());
      } catch (cause) {
        if (
          mounted.current &&
          owns() &&
          isAxiosError<{ code?: string }>(cause) &&
          definitive.has(cause.response?.data?.code ?? "")
        )
          setMayEdit(true);
        throw cause;
      }
    });
  };
  const editAfterFailure = () => {
    if (!pending || !mayEdit || inFlight.current || !owns()) return;
    try {
      clearPendingRequest(
        resource(pending),
        pendingRequestKey(resource(pending)),
      );
      setForms((old) => ({
        ...old,
        [pending.source.id]: { ...pending.payload.reviewEvidence },
      }));
      setPending(null);
      setAttempts(syncPending());
      setMayEdit(false);
      setError("");
      setSaved(null);
    } catch {
      setError(
        "Tallennettu pyyntö ei voitu poistaa. Tarkista aiempi tulos ennen uutta yritystä.",
      );
    }
  };
  const choosePending = (attempt: SavedApprovalRequest) => {
    if (!inFlight.current && owns()) {
      setPending(attempt);
      setSource(attempt.source);
      setMayEdit(false);
      setError("");
      setSaved(null);
    }
  };
  return {
    source,
    form,
    attempts,
    pending,
    history,
    saved,
    busy,
    error,
    invalidField,
    blockedStorage,
    ownerChanged,
    mayEdit,
    select,
    edit,
    loadHistory,
    submit,
    editAfterFailure,
    choosePending,
  };
}
