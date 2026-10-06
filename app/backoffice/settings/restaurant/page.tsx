"use client";

import config from "@/app/config";
import { Button } from "@/components/ui/button";

import { RestaurantForm } from "./_components/restaurant-form";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, LoadingState } from "@/components/ui/states";

import { useRestaurantSettings } from "./_hooks/use-restaurant-settings";
export default function RestaurantSettingsPage() {
  const {
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
  } = useRestaurantSettings();
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

      {/* EN: Keep the submitted draft stable during upload and save. */}
      {/* FI: Säilytä lähetetty luonnos muuttumattomana latauksen ja tallennuksen aikana. */}
      <RestaurantForm
        form={form}
        fieldErrors={fieldErrors}
        fieldClassName={fieldClassName}
        isSaving={isSaving}
        formError={formError}
        logoFileName={logoFileName}
        logoUrl={logoUrl}
        logoInitials={logoInitials}
        fileInputRef={fileInputRef}
        updateSelectedFile={updateSelectedFile}
        setFormError={setFormError}
        setField={setField}
        setInvalidField={setInvalidField}
        save={save}
      />
    </div>
  );
}
