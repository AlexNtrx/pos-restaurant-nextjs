"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useRef } from "react";
import { TaxPolicyPreview } from "./tax-policy-preview";
import { attestationLabels, type Attestation } from "../_lib/tax-approval";
import type { useTaxApproval } from "../_hooks/use-tax-approval";
export function TaxApprovalPanel({
  state,
  allowed,
  disabled,
}: {
  state: ReturnType<typeof useTaxApproval>;
  allowed: boolean;
  disabled: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.invalidField && !state.busy && !disabled)
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
  }, [state.invalidField, state.busy, disabled]);
  if (state.ownerChanged)
    return (
      <p role="alert" className="text-sm text-destructive">
        Käyttäjä vaihtui. Kirjaudu alkuperäisellä käyttäjällä tarkistaaksesi
        pyynnön.
      </p>
    );
  const locked =
    state.busy ||
    disabled ||
    Boolean(state.pending) ||
    Boolean(state.saved) ||
    state.blockedStorage;
  return (
    <section
      className="min-w-0 space-y-4 border-t pt-5"
      aria-labelledby="tax-approval-title"
      aria-busy={state.busy}
    >
      <h4 id="tax-approval-title" className="text-lg font-semibold">
        Tarkistuksen hyväksynnät
      </h4>
      <p className="text-sm">
        Kirjaa vain todellinen tarkistus ja tositeviite. Luonnoksen ehdotettu
        tarkistaja ja päivämäärä eivät ole hyväksynnän todiste. Kirjaus ei muuta
        myyntiä tai ota ALV-käytäntöä käyttöön.
      </p>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 whitespace-normal"
        disabled={state.busy || disabled}
        onClick={() => void state.loadHistory()}
      >
        Näytä hyväksyntähistoria
      </Button>
      {state.busy && (
        <p role="status" className="text-sm">
          Hyväksyntää käsitellään…
        </p>
      )}
      {state.error && (
        <p role="alert" className="break-words text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.attempts.length > 0 &&
        (!state.pending || state.attempts.length > 1) && (
          <div className="space-y-2">
            <p className="text-sm">
              Tarkista kaikki aiemmat yritykset ennen uutta kirjausta.
            </p>
            <div className="flex flex-wrap gap-2">
              {state.attempts.map((attempt) => (
                <Button
                  key={attempt.payload.idempotencyKey}
                  type="button"
                  variant="outline"
                  className="min-h-11 whitespace-normal"
                  disabled={state.busy || disabled}
                  onClick={() => state.choosePending(attempt)}
                >
                  Tarkista aiempi yritys · versio #{attempt.source.id}
                </Button>
              ))}
            </div>
          </div>
        )}
      {state.source && (
        <div className="min-w-0 space-y-4 rounded-md border p-4">
          <p className="font-medium">
            Valittu versio #{state.source.id} · luonnos v
            {state.source.sourceDraftVersion}
          </p>
          <details>
            <summary className="min-h-11 cursor-pointer py-2 text-sm">
              Näytä tarkistettava käytäntö ja myyjätiedot
            </summary>
            <TaxPolicyPreview
              configuration={state.source.configuration}
              seller={state.source.sellerSnapshot}
            />
          </details>
          {!allowed && !state.pending && !state.saved && (
            <p className="text-sm">
              Tallenna tai palauta luonnos ja tarkista tallennettu luonnos
              uudelleen. Valitun version on vastattava nykyistä tarkistettua
              luonnosta.
            </p>
          )}
          {state.pending && (
            <p className="text-sm font-medium">
              Aiemman yrityksen tulos on tarkistettava. Tiedot ja pyyntöavain
              säilyvät samoina, vaikka luonnos olisi muuttunut.
            </p>
          )}
          <form
            ref={formRef}
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              void state.submit(allowed)?.then(() => {
                // EN: Focus follows the first invalid evidence field; request failures preserve the original inputs.
                // FI: Kohdistus siirtyy ensimmäiseen virheelliseen tositekenttään; pyyntövirheet säilyttävät alkuperäiset syötteet.
                form
                  .querySelector<HTMLElement>('[aria-invalid="true"]')
                  ?.focus();
              });
            }}
            className="min-w-0 space-y-4"
            noValidate
          >
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="approval-reviewer"
                  className="text-sm font-medium"
                >
                  Todellisen tarkistajan nimi
                </label>
                <Input
                  id="approval-reviewer"
                  name="reviewedByName"
                  className="min-h-11"
                  value={state.form.reviewedByName}
                  maxLength={150}
                  disabled={locked}
                  aria-invalid={state.invalidField === "reviewedByName"}
                  onChange={(e) =>
                    state.edit({
                      ...state.form,
                      reviewedByName: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="approval-date" className="text-sm font-medium">
                  Tarkistuspäivä
                </label>
                <Input
                  id="approval-date"
                  name="reviewedOn"
                  type="date"
                  className="min-h-11 w-full min-w-0"
                  value={state.form.reviewedOn}
                  disabled={locked}
                  aria-invalid={state.invalidField === "reviewedOn"}
                  onChange={(e) =>
                    state.edit({ ...state.form, reviewedOn: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="approval-reference"
                className="text-sm font-medium"
              >
                Tarkistuksen tositeviite
              </label>
              <textarea
                id="approval-reference"
                name="evidenceReference"
                rows={3}
                className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                value={state.form.evidenceReference}
                maxLength={500}
                disabled={locked}
                aria-invalid={state.invalidField === "evidenceReference"}
                onChange={(e) =>
                  state.edit({
                    ...state.form,
                    evidenceReference: e.target.value,
                  })
                }
              />
              <p className="text-sm text-muted-foreground">
                Esimerkiksi tarkistusasiakirjan viite. Liitteitä ei lähetetä
                tässä.
              </p>
            </div>
            <fieldset disabled={locked} className="min-w-0 space-y-2">
              <legend className="mb-2 text-sm font-medium">
                Vahvista vain tarkistetut asiat
              </legend>
              {(
                Object.entries(attestationLabels) as [Attestation, string][]
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name={key}
                    className="size-5 shrink-0"
                    checked={state.form.attestations[key]}
                    aria-invalid={state.invalidField === key}
                    onChange={(e) =>
                      state.edit({
                        ...state.form,
                        attestations: {
                          ...state.form.attestations,
                          [key]: e.target.checked,
                        },
                      })
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                className="min-h-11 whitespace-normal"
                disabled={
                  state.busy ||
                  disabled ||
                  state.blockedStorage ||
                  (!state.pending && (!allowed || Boolean(state.saved)))
                }
              >
                {state.pending
                  ? "Tarkista aiemman yrityksen tulos"
                  : "Kirjaa hyväksyntä"}
              </Button>
              {state.mayEdit && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 whitespace-normal"
                  disabled={state.busy || disabled}
                  onClick={state.editAfterFailure}
                >
                  Muokkaa tietoja ennen uutta yritystä
                </Button>
              )}
            </div>
          </form>
        </div>
      )}
      {state.saved && (
        <p role="status" className="text-sm">
          Hyväksyntä #{state.saved.id} kirjattu versiosta #
          {state.saved.sourceRevisionId}. Hyväksyntä kirjattu – ei käytössä
          myynnissä.
        </p>
      )}
      {state.history && (
        <div className="min-w-0 space-y-3">
          <h5 className="font-semibold">
            Hyväksyntähistoria ({state.history.totalCount})
          </h5>
          {!state.history.results.length && (
            <p className="text-sm">Ei kirjattuja hyväksyntöjä tällä sivulla.</p>
          )}
          {state.history.results.map((approval) => (
            <details
              key={approval.id}
              className="min-w-0 rounded-md border p-3"
            >
              <summary className="min-h-11 cursor-pointer break-words py-2 text-sm [overflow-wrap:anywhere]">
                Hyväksyntä #{approval.id} · versio #{approval.sourceRevisionId}{" "}
                · {new Date(approval.recordedAt).toLocaleString("fi-FI")}
              </summary>
              <div className="mt-3 min-w-0 space-y-3">
                <p className="text-sm font-medium">
                  Hyväksyntä kirjattu – ei käytössä myynnissä
                </p>
                <dl className="space-y-2 break-words text-sm [overflow-wrap:anywhere]">
                  <div>
                    <dt className="text-muted-foreground">
                      Todellinen tarkistaja
                    </dt>
                    <dd>{approval.reviewEvidence.reviewedByName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Tarkistuspäivä</dt>
                    <dd>{approval.reviewEvidence.reviewedOn}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Tositeviite</dt>
                    <dd>{approval.reviewEvidence.evidenceReference}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Kirjaaja</dt>
                    <dd>{approval.recordedByName}</dd>
                  </div>
                </dl>
                <ul className="space-y-1 text-sm">
                  {Object.values(attestationLabels).map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
                <TaxPolicyPreview
                  configuration={approval.configuration}
                  seller={approval.sellerSnapshot}
                />
              </div>
            </details>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={state.busy || disabled || state.history.page <= 1}
              onClick={() => void state.loadHistory(state.history!.page - 1)}
            >
              Edelliset hyväksynnät
            </Button>
            <span className="text-sm">
              Sivu {state.history.page} / {Math.max(1, state.history.pageCount)}
            </span>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={
                state.busy ||
                disabled ||
                state.history.page >= state.history.pageCount
              }
              onClick={() => void state.loadHistory(state.history!.page + 1)}
            >
              Seuraavat hyväksynnät
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
