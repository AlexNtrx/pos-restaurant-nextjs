"use client";

import { useState } from "react";
import { TaxPolicyReviewPanel } from "./tax-policy-review";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useTaxDraft } from "../_hooks/use-tax-draft";
import { missingTaxFields, type TaxDraftForm } from "../_lib/tax-draft";
const statusLabels = {
  UNCONFIRMED: "Ei vahvistettu",
  REGISTERED: "ALV-rekisteröity (ehdotus)",
  NOT_REGISTERED: "Ei ALV-rekisterissä (ehdotus)",
};
const control =
  "min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50";

export function TaxSettingsDraft() {
  const [reviewBusy, setReviewBusy] = useState(false);
  const {
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
  } = useTaxDraft();
  const disabled = busy || reviewBusy || !base?.organizationConfigured;
  const missing = missingTaxFields(form);
  return (
    <Card className="mt-6 min-w-0 rounded-[10px] shadow-none">
      <CardHeader className="px-5 md:px-6">
        <h2 className="text-xl font-semibold">ALV-asetusten luonnos</h2>
        <p className="text-sm font-semibold">Luonnos – ei käytössä myynnissä</p>
        <p className="text-sm text-muted-foreground">
          Tallentaminen ei muuta hintoja, ALV-laskentaa, kuitteja tai
          raportteja. Verotiedot on vahvistettava ennen käyttöönottoa.
        </p>
      </CardHeader>
      <CardContent className="min-w-0 px-5 md:px-6">
        {!base && busy && <p role="status">Luonnosta ladataan…</p>}
        {base && !base.organizationConfigured && (
          <p className="mb-4 text-sm">
            Tallenna ensin ravintolan perustiedot yllä. Paina sitten Tarkista
            uusin luonnos.
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const element = event.currentTarget;
            void save().then((field) => {
              if (field)
                element
                  .querySelector<HTMLInputElement>(`[name="${field}"]`)
                  ?.focus();
            });
          }}
          aria-busy={busy}
          className="space-y-4"
        >
          <fieldset
            disabled={disabled}
            className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2"
          >
            <FormField id="tax-country" label="Maa">
              <select
                className={control}
                value={form.countryCode}
                onChange={(e) =>
                  edit(
                    "countryCode",
                    e.target.value as TaxDraftForm["countryCode"],
                  )
                }
              >
                <option value="">Ei valittu</option>
                <option value="FI">Suomi</option>
              </select>
            </FormField>
            <FormField id="tax-status" label="ALV-rekisteröinti">
              <select
                className={control}
                value={form.vatStatus}
                onChange={(e) =>
                  edit("vatStatus", e.target.value as TaxDraftForm["vatStatus"])
                }
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              id="tax-food"
              error={invalidField === "foodRate" ? error : undefined}
              label="Ruoka ja alkoholittomat juomat (%)"
              description="Ehdotettu positiivinen prosentti, enintään 2 desimaalia. Tyhjä = ei tiedossa."
            >
              <Input
                className="min-h-11"
                inputMode="decimal"
                value={form.foodRate}
                name="foodRate"
                onChange={(e) => edit("foodRate", e.target.value)}
              />
            </FormField>
            <FormField
              id="tax-alcohol"
              error={invalidField === "alcoholRate" ? error : undefined}
              label="Alkoholi (%)"
              description="Ehdotettu positiivinen prosentti, enintään 2 desimaalia. Tyhjä = ei tiedossa."
            >
              <Input
                className="min-h-11"
                inputMode="decimal"
                value={form.alcoholRate}
                name="alcoholRate"
                onChange={(e) => edit("alcoholRate", e.target.value)}
              />
            </FormField>
            <FormField
              id="tax-date"
              error={
                invalidField === "requestedEffectiveDate" ? error : undefined
              }
              label="Toivottu voimaantulopäivä"
              description="Vain luonnoksen tieto. Ei ajasta käyttöönottoa."
            >
              <Input
                className="min-h-11 w-full min-w-0"
                type="date"
                value={form.requestedEffectiveDate}
                name="requestedEffectiveDate"
                onChange={(e) => edit("requestedEffectiveDate", e.target.value)}
              />
            </FormField>
            <FormField id="tax-reviewer" label="Tarkistajan nimi (ehdotus)">
              <Input
                className="min-h-11"
                maxLength={120}
                value={form.reviewerName}
                onChange={(e) => edit("reviewerName", e.target.value)}
              />
            </FormField>
            <div className="min-w-0 md:col-span-2">
              <FormField
                id="tax-reason"
                label="Rekisteröimättömyyden peruste (ehdotus)"
              >
                <textarea
                  className={`${control} min-h-24 py-2`}
                  maxLength={500}
                  value={form.nonRegistrationReason}
                  onChange={(e) =>
                    edit("nonRegistrationReason", e.target.value)
                  }
                />
              </FormField>
            </div>
          </fieldset>
          <p className="text-sm text-muted-foreground">
            Hinnoittelu: kuluttajan lopullinen hinta. Luonnos ei muuta nykyisiä
            hintoja.
          </p>
          {form.vatStatus === "NOT_REGISTERED" && (
            <p className="text-sm">
              Syötetyt prosentit säilyvät luonnoksessa, mutta niitä ei sovelleta
              tähän rekisteröintiehdotukseen. Tämä ei tarkoita verovapaata tai 0
              % myyntiä.
            </p>
          )}
          <p className="text-sm">
            {missing.length
              ? `Täydennettävää: ${missing.join(", ")}. Keskeneräisen luonnoksen voi tallentaa.`
              : "Kentät täytetty. Tiedot ovat edelleen luonnos, eivät vahvistettu veropolitiikka."}
          </p>
          {base?.draft && (
            <p className="text-xs text-muted-foreground">
              Tallennettu versio {base.version} ·{" "}
              {new Date(base.draft.savedAt).toLocaleString("fi-FI")}
            </p>
          )}
          {error && !invalidField && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <p role="status" className="text-sm">
            {message}
          </p>
          {latest && (
            <div className="space-y-3 rounded-md border p-3 text-sm">
              <p className="font-semibold">
                Uusin tallennettu luonnos · versio {latest.version}
              </p>
              <p className="break-words">
                {latest.draft
                  ? `${latest.draft.countryCode ?? "Maa puuttuu"} · ${statusLabels[latest.draft.vatStatus]} · ruoka ${latest.draft.rates.FOOD_NON_ALCOHOLIC === null ? "–" : latest.draft.rates.FOOD_NON_ALCOHOLIC / 100 + " %"} · alkoholi ${latest.draft.rates.ALCOHOL === null ? "–" : latest.draft.rates.ALCOHOL / 100 + " %"}`
                  : "Ei tallennettua luonnosta."}
              </p>
              {latest.draft && (
                <dl className="space-y-1 break-words">
                  <div>
                    <dt>Päivämäärä</dt>
                    <dd>{latest.draft.requestedEffectiveDate ?? "–"}</dd>
                  </div>
                  <div>
                    <dt>Tarkistaja</dt>
                    <dd>{latest.draft.reviewerName ?? "–"}</dd>
                  </div>
                  <div>
                    <dt>Peruste</dt>
                    <dd>{latest.draft.nonRegistrationReason ?? "–"}</dd>
                  </div>
                </dl>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 whitespace-normal"
                  disabled={busy || reviewBusy}
                  onClick={() => chooseLatest(false)}
                >
                  Käytä uusinta luonnosta
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 whitespace-normal"
                  disabled={
                    busy || reviewBusy || !latest.organizationConfigured
                  }
                  onClick={() => chooseLatest(true)}
                >
                  Säilytä omat kentät
                </Button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              className="min-h-11 whitespace-normal"
              disabled={disabled || Boolean(latest)}
            >
              {busy ? "Odota…" : "Tallenna luonnos"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 whitespace-normal"
              disabled={busy || reviewBusy}
              onClick={() => void load()}
            >
              Tarkista uusin luonnos
            </Button>
          </div>
        </form>
        <TaxPolicyReviewPanel
          version={base?.version ?? null}
          blocked={
            busy ||
            !base?.organizationConfigured ||
            hasUnsavedChanges ||
            Boolean(latest)
          }
          onBusyChange={setReviewBusy}
        />
      </CardContent>
    </Card>
  );
}
