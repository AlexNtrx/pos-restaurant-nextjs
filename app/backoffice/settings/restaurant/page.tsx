"use client";

import {
  FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import config from "@/app/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, LoadingState } from "@/components/ui/states";
import api from "@/lib/api";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";

type Organization = {
  id: number;
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  bankNo: string;
  logo: string;
  taxCode: string;
};
type OrganizationForm = Omit<Organization, "id">;
type LoadStatus = "loading" | "ready" | "error" | "forbidden";
type ValidatedField = "name" | "address" | "phone" | "email" | "taxCode";

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

function SettingsSection({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`gap-0 rounded-[10px] py-0 shadow-none ${className}`}>
      <CardHeader className="gap-1 px-[20px] pt-[20px] pb-0 md:px-[24px] md:pt-[24px]">
        <h2 className="!m-0 !text-[20px] !leading-[24px] font-semibold text-foreground">
          {title}
        </h2>
        <p className="!m-0 text-[13px] !leading-[16px] text-muted-foreground">
          {description}
        </p>
      </CardHeader>
      <CardContent className="px-[20px] pt-[18px] pb-[20px] md:px-[24px] md:pb-[24px]">
        {children}
      </CardContent>
    </Card>
  );
}

export default function RestaurantSettingsPage() {
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

  if (status === "loading")
    return <LoadingState title="Ravintolan asetuksia ladataan" />;
  if (status === "forbidden")
    return (
      <ErrorState
        title="Ei käyttöoikeutta"
        description="Vain ylläpitäjä voi muuttaa ravintolan asetuksia."
      />
    );
  if (status === "error")
    return (
      <ErrorState
        title="Asetuksia ei voitu ladata"
        description={error}
        action={<Button onClick={() => void load()}>Yritä uudelleen</Button>}
      />
    );

  const logoUrl =
    selectedLogoPreview ||
    (form.logo ? `${config.apiServer}/uploads/${form.logo}` : "");
  const logoFileName = selectedFile?.name || form.logo;
  const logoInitials =
    form.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toLocaleUpperCase("fi-FI"))
      .join("") || "POS";
  const fieldClassName =
    "[&>label]:text-[13px] [&>label]:leading-[17px] [&>label_[aria-hidden=true]]:text-foreground [&_input]:!px-[12px]";

  return (
    <div className="restaurant-settings tw04-layout mx-auto max-w-[350px] pt-2 font-sans md:max-w-[760px] md:pt-0 xl:-mt-1 xl:max-w-[920px]">
      <PageHeader
        className="min-h-0 gap-2 sm:gap-6 [&_h1]:!m-0 [&_h1]:!text-[30px] [&_h1]:!leading-[37px] [&_p]:!m-0 [&_p]:!leading-[17px]"
        title="Ravintolan tiedot"
        description="Hallinnoi ravintolan yhteys-, yritys- ja maksutietoja."
        actions={
          <p className="!m-0 text-xs !leading-[15px] text-muted-foreground">
            * Pakollinen kenttä
          </p>
        }
      />

      <form
        className="mt-6 space-y-[18px]"
        aria-busy={isSaving}
        onInvalidCapture={() =>
          setFormError("Tarkista merkityt kentät ennen tallentamista.")
        }
        onSubmit={save}
      >
        <SettingsSection
          title="Perustiedot"
          description="Ravintolan nimi ja asiakkaiden yhteystiedot."
        >
          <div className="space-y-4">
            <FormField
              id="restaurant-name"
              label="Ravintolan nimi"
              required
              error={fieldErrors.name}
              className={fieldClassName}
            >
              <Input
                value={form.name}
                maxLength={150}
                onInvalid={(event) => {
                  event.preventDefault();
                  setInvalidField("name", "Ravintolan nimi on pakollinen.");
                }}
                onChange={(event) => setField("name", event.target.value)}
              />
            </FormField>
            <FormField
              id="restaurant-address"
              label="Osoite"
              required
              error={fieldErrors.address}
              className={fieldClassName}
            >
              <Input
                value={form.address}
                maxLength={500}
                onInvalid={(event) => {
                  event.preventDefault();
                  setInvalidField("address", "Osoite on pakollinen.");
                }}
                onChange={(event) => setField("address", event.target.value)}
              />
            </FormField>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                id="restaurant-phone"
                label="Puhelin"
                required
                error={fieldErrors.phone}
                className={fieldClassName}
              >
                <Input
                  value={form.phone}
                  maxLength={50}
                  onInvalid={(event) => {
                    event.preventDefault();
                    setInvalidField("phone", "Puhelin on pakollinen.");
                  }}
                  onChange={(event) => setField("phone", event.target.value)}
                />
              </FormField>
              <FormField
                id="restaurant-email"
                label="Sähköposti"
                error={fieldErrors.email}
                className={fieldClassName}
              >
                <Input
                  type="email"
                  value={form.email}
                  maxLength={254}
                  onInvalid={(event) => {
                    event.preventDefault();
                    setInvalidField(
                      "email",
                      "Tarkista sähköpostiosoitteen muoto.",
                    );
                  }}
                  onChange={(event) => setField("email", event.target.value)}
                />
              </FormField>
            </div>
            <FormField
              id="restaurant-website"
              label="Verkkosivusto"
              className={fieldClassName}
            >
              <Input
                inputMode="url"
                placeholder="https://example.com"
                value={form.website}
                maxLength={250}
                onChange={(event) => setField("website", event.target.value)}
              />
            </FormField>
          </div>
        </SettingsSection>

        <div className="grid gap-[18px] md:grid-cols-2">
          <SettingsSection
            title="Yritystiedot"
            description="Virallinen tunniste kuitteja varten."
            className="[&_[data-slot=card-content]]:pt-[15px] md:[&_[data-slot=card-header]]:px-[20px] md:[&_[data-slot=card-header]]:pt-[20px] md:[&_[data-slot=card-content]]:px-[20px] md:[&_[data-slot=card-content]]:pb-[20px]"
          >
            <FormField
              id="restaurant-tax"
              label="Y-tunnus / verotunnus"
              required
              error={fieldErrors.taxCode}
              className={fieldClassName}
            >
              <Input
                value={form.taxCode}
                maxLength={50}
                onInvalid={(event) => {
                  event.preventDefault();
                  setInvalidField(
                    "taxCode",
                    "Y-tunnus / verotunnus on pakollinen.",
                  );
                }}
                onChange={(event) => setField("taxCode", event.target.value)}
              />
            </FormField>
          </SettingsSection>
          <SettingsSection
            title="Maksutiedot"
            description="Ravintolan pankkitilin numero."
            className="[&_[data-slot=card-content]]:pt-[15px] md:[&_[data-slot=card-header]]:px-[20px] md:[&_[data-slot=card-header]]:pt-[20px] md:[&_[data-slot=card-content]]:px-[20px] md:[&_[data-slot=card-content]]:pb-[20px]"
          >
            <FormField
              id="restaurant-bank"
              label="Pankkitilin numero"
              className={fieldClassName}
            >
              <Input
                value={form.bankNo}
                maxLength={100}
                onChange={(event) => setField("bankNo", event.target.value)}
              />
            </FormField>
          </SettingsSection>
        </div>

        <SettingsSection
          title="Brändi / Logo"
          description="Logo näkyy ravintolan tulosteissa, kun tiedosto on käytettävissä."
          className="[&_[data-slot=card-header]]:px-[20px] [&_[data-slot=card-header]]:pt-[20px] [&_[data-slot=card-content]]:px-[20px] [&_[data-slot=card-content]]:pt-[12px] [&_[data-slot=card-content]]:pb-[20px]"
        >
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:gap-5">
            <div
              role="img"
              aria-label={
                logoFileName
                  ? `Ravintolan nykyinen logo: ${logoFileName}`
                  : "Ravintolan logon esikatselu"
              }
              className="flex h-[82px] w-[136px] shrink-0 items-center justify-center rounded-md border border-border bg-muted bg-contain bg-center bg-no-repeat font-heading text-[30px] font-semibold text-brass"
              style={
                logoUrl
                  ? { backgroundImage: `url(${JSON.stringify(logoUrl)})` }
                  : undefined
              }
            >
              {!logoUrl && logoInitials}
            </div>
            <div className="min-w-0 space-y-1">
              <p className="!m-0 truncate text-sm !leading-[17px] font-medium text-foreground">
                {logoFileName || "Logoa ei ole valittu"}
              </p>
              <p className="!m-0 text-xs !leading-[15px] text-muted-foreground">
                JPEG, PNG, WEBP tai GIF · enintään 5 MB, 24 megapikseliä ja 8000
                px/sivu
              </p>
              <label
                htmlFor="restaurant-logo"
                className="inline-flex cursor-pointer text-sm leading-[17px] font-semibold text-brass underline underline-offset-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
              >
                {logoFileName ? "Vaihda logo" : "Valitse logo"}
              </label>
              <input
                ref={fileInputRef}
                id="restaurant-logo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(event) =>
                  updateSelectedFile(event.target.files?.[0] ?? null)
                }
              />
            </div>
          </div>
        </SettingsSection>

        {formError && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-md bg-destructive/10 px-[16px] py-[12px] text-sm text-destructive"
          >
            <p className="!m-0 font-semibold">Tietoja ei voitu tallentaa</p>
            <p className="!mt-1 !mb-0">{formError}</p>
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-muted/55 p-[16px] md:flex-row md:items-center md:justify-between md:px-[20px]">
          <p className="!m-0 text-[13px] !leading-[16px] text-muted-foreground">
            {isSaving
              ? "Tallennetaan ravintolan tietoja…"
              : "Tarkista pakolliset tiedot ennen tallentamista."}
          </p>
          <Button
            type="submit"
            disabled={isSaving}
            className="h-11 w-full md:w-[184px]"
          >
            {isSaving ? "Tallennetaan…" : "Tallenna muutokset"}
          </Button>
        </div>
      </form>
    </div>
  );
}
