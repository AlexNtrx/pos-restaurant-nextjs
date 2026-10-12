import { useCallback, useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import api from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  emptyTaxForm,
  fromTaxForm,
  parseTaxResponse,
  toTaxForm,
  TaxDraftInputError,
  type TaxDraftForm,
  type TaxDraftResponse,
} from "../_lib/tax-draft";

export function useTaxDraft() {
  const [form, setForm] = useState<TaxDraftForm>({ ...emptyTaxForm });
  const [base, setBase] = useState<TaxDraftResponse | null>(null);
  const [latest, setLatest] = useState<TaxDraftResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [invalidField, setInvalidField] = useState<
    TaxDraftInputError["field"] | null
  >(null);
  const dirtyRef = useRef(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const id = ++requestId.current;
    controller.current = new AbortController();
    setBusy(true);
    setError("");
    setInvalidField(null);
    setMessage("");
    try {
      const response = parseTaxResponse(
        (
          await api.get("/organization/tax-draft", {
            signal: controller.current.signal,
          })
        ).data,
      );
      if (!mounted.current || id !== requestId.current) return;
      // EN: A refresh never replaces unsaved inputs; the user explicitly chooses which draft to retain.
      // FI: Päivitys ei korvaa tallentamattomia kenttiä; käyttäjä valitsee säilytettävän luonnoksen.
      if (dirtyRef.current) setLatest(response);
      else {
        setBase(response);
        setForm(toTaxForm(response.draft));
        setLatest(null);
      }
    } catch (err) {
      if (mounted.current && id === requestId.current)
        setError(
          getApiErrorMessage(
            err,
            "ALV-luonnosta ei voitu ladata. Kentät säilyvät.",
          ),
        );
    } finally {
      if (mounted.current && id === requestId.current) {
        setBusy(false);
        inFlight.current = false;
      }
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      controller.current?.abort();
      inFlight.current = false;
    };
  }, [load]);
  const edit = <K extends keyof TaxDraftForm>(
    key: K,
    value: TaxDraftForm[K],
  ) => {
    dirtyRef.current = true;
    setHasUnsavedChanges(true);
    setForm((previous) => ({ ...previous, [key]: value }));
    setMessage("");
    setError("");
    setInvalidField(null);
  };
  const save = async () => {
    if (inFlight.current || !base?.organizationConfigured || latest) return;
    let draft;
    try {
      draft = fromTaxForm(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tarkista kentät.");
      if (err instanceof TaxDraftInputError) {
        setInvalidField(err.field);
        return err.field;
      }
      return;
    }
    inFlight.current = true;
    const id = ++requestId.current;
    controller.current = new AbortController();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = parseTaxResponse(
        (
          await api.put(
            "/organization/tax-draft",
            { expectedVersion: base.version, draft },
            { signal: controller.current.signal },
          )
        ).data,
      );
      if (!mounted.current || id !== requestId.current) return;
      setBase(response);
      setForm(toTaxForm(response.draft));
      dirtyRef.current = false;
      setHasUnsavedChanges(false);
      setMessage("Luonnos tallennettu. Ei käytössä myynnissä.");
    } catch (err) {
      if (!mounted.current || id !== requestId.current) return;
      const code = isAxiosError(err) ? err.response?.data?.code : undefined;
      setError(
        code === "TAX_DRAFT_CONFLICT"
          ? "Toinen välilehti muutti luonnosta. Kenttäsi säilyvät. Tarkista uusin luonnos ennen tallentamista."
          : code === "RESTAURANT_SETUP_REQUIRED"
            ? "Tallenna ensin ravintolan perustiedot ja tarkista uusin luonnos."
            : getApiErrorMessage(
                err,
                "Luonnosta ei voitu tallentaa. Kentät säilyvät. Tarkista uusin luonnos ennen uutta yritystä.",
              ),
      );
    } finally {
      if (mounted.current && id === requestId.current) {
        setBusy(false);
        inFlight.current = false;
      }
    }
  };
  const chooseLatest = (keepMine: boolean) => {
    if (!latest) return;
    setBase(latest);
    if (!keepMine) {
      setForm(toTaxForm(latest.draft));
      dirtyRef.current = false;
      setHasUnsavedChanges(false);
    }
    setLatest(null);
    setError("");
    setMessage(
      keepMine
        ? "Omat kentät säilytetty. Tallenna erikseen korvataksesi uusimman luonnoksen."
        : "Uusin luonnos ladattu.",
    );
  };
  return {
    form,
    base,
    latest,
    busy,
    error,
    message,
    invalidField,
    hasUnsavedChanges,
    edit,
    save,
    load,
    chooseLatest,
  };
}
