import type { FormEvent, ReactNode, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { OrganizationForm, ValidatedField } from "../_lib/types";
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

export function RestaurantForm({
  form,
  fieldErrors,
  fieldClassName,
  isSaving,
  formError,
  logoFileName,
  logoUrl,
  logoInitials,
  fileInputRef,
  updateSelectedFile,
  setFormError,
  setField,
  setInvalidField,
  save,
}: {
  form: OrganizationForm;
  fieldErrors: Partial<Record<ValidatedField, string>>;
  fieldClassName: string;
  isSaving: boolean;
  formError: string;
  logoFileName: string;
  logoUrl: string;
  logoInitials: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  updateSelectedFile: (file: File | null) => void;
  setFormError: (message: string) => void;
  setField: (field: keyof OrganizationForm, value: string) => void;
  setInvalidField: (field: ValidatedField, message: string) => void;
  save: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
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
              disabled={isSaving}
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
              disabled={isSaving}
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
                disabled={isSaving}
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
                disabled={isSaving}
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
              disabled={isSaving}
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
              disabled={isSaving}
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
              disabled={isSaving}
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
              disabled={isSaving}
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
  );
}
