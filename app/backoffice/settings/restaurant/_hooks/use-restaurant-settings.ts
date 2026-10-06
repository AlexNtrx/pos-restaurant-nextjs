"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import type {
  Organization,
  OrganizationForm,
  LoadStatus,
  ValidatedField,
} from "../_lib/types";
const emptyForm: OrganizationForm = {
  name: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  bankNo: "",
  logo: "",
  taxCode: "",
};

function isOrganization(value: unknown): value is Organization {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "number" &&
    [
      "name",
      "address",
      "phone",
      "email",
      "website",
      "bankNo",
      "logo",
      "taxCode",
    ].every((key) => typeof item[key] === "string")
  );
}

// EN: Keep load, logo preview cleanup and save together so a failed upload retains the draft.
// FI: Pidä haku, logon esikatselun siivous ja tallennus yhdessä, jotta epäonnistunut lataus säilyttää luonnoksen.
export function useRestaurantSettings() {
  const [form, setForm] = useState<OrganizationForm>(emptyForm);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedLogoPreview, setSelectedLogoPreview] = useState("");
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<ValidatedField, string>>
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedLogoPreviewRef = useRef("");

  // EN: Replace temporary browser URLs atomically so local logo previews never leak across selections.
  // FI: Vaihda selaimen väliaikaiset URL-osoitteet atomisesti, jotta paikallisten logojen esikatselut eivät vuoda valintojen välillä.
  const updateSelectedFile = useCallback((file: File | null) => {
    if (
      selectedLogoPreviewRef.current &&
      typeof URL.revokeObjectURL === "function"
    ) {
      URL.revokeObjectURL(selectedLogoPreviewRef.current);
    }
    const previewUrl =
      file && typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(file)
        : "";
    selectedLogoPreviewRef.current = previewUrl;
    setSelectedLogoPreview(previewUrl);
    setSelectedFile(file);
  }, []);

  const setField = <K extends keyof OrganizationForm>(
    key: K,
    value: OrganizationForm[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormError("");
    if (key in fieldErrors) {
      setFieldErrors((current) => ({ ...current, [key]: undefined }));
    }
  };

  const setInvalidField = (field: ValidatedField, message: string) => {
    setFieldErrors((current) => ({ ...current, [field]: message }));
    setFormError("Tarkista merkityt kentät ennen tallentamista.");
  };

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const response = await api.get("/organization/info");
      const organization = response.data?.result;
      if (organization !== null && !isOrganization(organization)) {
        throw new Error("Palvelin palautti virheelliset ravintolan tiedot.");
      }
      // EN: A missing organization is the initial setup state, so keep the creation form available.
      // FI: Puuttuva ravintola tarkoittaa alkumääritystä, joten pidä luontilomake käytettävissä.
      setForm(
        organization === null
          ? { ...emptyForm }
          : {
              name: organization.name,
              address: organization.address,
              phone: organization.phone,
              email: organization.email,
              website: organization.website,
              bankNo: organization.bankNo,
              logo: organization.logo,
              taxCode: organization.taxCode,
            },
      );
      updateSelectedFile(null);
      setFieldErrors({});
      setFormError("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setStatus("ready");
    } catch (reason: unknown) {
      setError(
        getApiErrorMessage(reason, "Ravintolan asetuksia ei voitu ladata."),
      );
      setStatus(isPermissionDeniedError(reason) ? "forbidden" : "error");
    }
  }, [updateSelectedFile]);

  useEffect(() => {
    const requestId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(requestId);
  }, [load]);

  useEffect(
    () => () => {
      if (
        selectedLogoPreviewRef.current &&
        typeof URL.revokeObjectURL === "function"
      ) {
        URL.revokeObjectURL(selectedLogoPreviewRef.current);
      }
    },
    [],
  );

  const uploadLogo = async () => {
    if (!selectedFile) return form.logo;
    const data = new FormData();
    data.append("file", selectedFile);
    const response = await api.post("/organization/upload", data);
    if (
      typeof response.data?.fileName !== "string" ||
      !response.data.fileName
    ) {
      throw new Error("Palvelin palautti virheellisen logotiedoston.");
    }
    return response.data.fileName;
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      ...form,
      name: form.name.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      website: form.website.trim(),
      bankNo: form.bankNo.trim(),
      taxCode: form.taxCode.trim(),
    };
    if (
      !payload.name ||
      !payload.address ||
      !payload.phone ||
      !payload.taxCode
    ) {
      setFormError("Tarkista merkityt kentät ennen tallentamista.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    setFieldErrors({});
    try {
      const logo = await uploadLogo();
      await api.post("/organization/create", { ...payload, logo });
      setForm({ ...payload, logo });
      updateSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("Ravintolan tiedot tallennettiin.");
    } catch (reason: unknown) {
      setFormError(
        getApiErrorMessage(reason, "Ravintolan tietoja ei voitu tallentaa."),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return {
    form,
    selectedFile,
    selectedLogoPreview,
    status,
    error,
    formError,
    fieldErrors,
    isSaving,
    fileInputRef,
    updateSelectedFile,
    setFormError,
    setField,
    setInvalidField,
    save,
    load,
  };
}
