"use client";

import { RefreshButton } from "@/components/ui/refresh-button";
import {
  readinessChecks,
  type TaxPublicationReadiness,
} from "../_lib/tax-publication-readiness";
import { policyFieldLabels } from "../_lib/tax-policy";
const scopes = {
  DATA: "Tiedot ja ruokalista",
  OPERATIONAL: "Avoimet työt",
  EXTERNAL: "Vahvistettavat asiat",
  RUNTIME: "Käyttöönotto",
};
const states = {
  PASS: "Kunnossa",
  BLOCKED: "Korjattavaa",
  UNVERIFIED: "Ei vahvistettu",
};
export function TaxPublicationReadinessReport({
  selectedId,
  report,
  busy,
  error,
  version,
  refresh,
}: {
  selectedId: number | null;
  report: TaxPublicationReadiness | null;
  busy: boolean;
  error: string;
  version: number | null;
  refresh: () => void;
}) {
  if (selectedId === null) return null;
  const stale = Boolean(
    error || (report && report.currentDraftVersion < (version ?? 0)),
  );
  return (
    <section
      aria-labelledby="publication-readiness-title"
      aria-busy={busy}
      className="min-w-0 space-y-4 rounded-md border p-4"
    >
      <h4 id="publication-readiness-title" className="text-lg font-semibold">
        Julkaisun edellytykset · versio #{selectedId}
      </h4>
      <p className="text-sm font-semibold">
        Julkaisun valmistelu – ei käytössä myynnissä
      </p>
      <p className="text-sm text-muted-foreground">
        Tarkistus koskee valittua tallennettua versiota. Lomakkeen
        tallentamattomat muutokset eivät sisälly tulokseen. Tarkistus ei muuta
        tietoja, sulje pöytiä tai julkaise verokäytäntöä.
      </p>
      {busy && (
        <p role="status" className="text-sm">
          Tarkistetaan…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {report && (
        <>
          {(stale || report.revision.id !== selectedId) && (
            <p className="text-sm font-medium">
              Näytetään aiempi tarkistus versiosta #{report.revision.id}. Tulos
              voi olla vanhentunut. Päivitä tarkistus.
            </p>
          )}
          <p className="text-sm">
            Tarkistettu versio #{report.revision.id} · lähdeluonnos v
            {report.revision.sourceDraftVersion} · nykyinen tallennettu luonnos
            v{report.currentDraftVersion}
          </p>
          <p className="text-sm">
            Tarkistettu {new Date(report.observedAt).toLocaleString("fi-FI")} ·
            myyjä:{" "}
            <span className="break-words [overflow-wrap:anywhere]">
              {report.revision.sellerSnapshot.name}
            </span>
          </p>
          {version !== null && report.currentDraftVersion > version && (
            <p className="text-sm">
              Lomakkeen luonnosversio eroaa tarkistuksesta. Tarkista uusin
              luonnos yllä.
            </p>
          )}
          <p className="text-sm font-medium">
            {report.technicalChecksPassed
              ? "Tekniset tarkistukset kunnossa. Julkaisu ja käyttöönotto eivät ole vielä käytettävissä."
              : "Teknisissä tarkistuksissa on korjattavaa."}
          </p>
          {(!report.candidateMatchesCurrentDraft ||
            !report.sellerMatchesCurrent) && (
            <p className="text-sm">
              Tarkista ravintolan tiedot ja tallenna tarvittaessa uusi luonnos
              ja versio. Vanhan version tietoja ei muuteta.
            </p>
          )}
          <dl className="grid min-w-0 grid-cols-1 gap-3 text-sm md:grid-cols-2">
            {[
              ["Aktiiviset tuotteet", report.catalog.activeItems],
              ["Tuotteet ilman ALV-luokkaa", report.catalog.unclassifiedItems],
              [
                "Tuotteet, joiden ALV-luokka ei ole tuettu",
                report.catalog.unsupportedItems,
              ],
              [
                "Maksamattomat avoimet tilaukset",
                report.outstanding.unpaidOrders,
              ],
              [
                "Maksetut tilaukset, joiden palvelu on kesken",
                report.outstanding.paidOpenOrders,
              ],
              [
                "Tallennetut ostoskoririvit",
                report.outstanding.legacyCartLines,
              ],
              ["Avoimet pöytäistunnot", report.outstanding.openTableSessions],
              ["Keskeneräiset palautukset", report.outstanding.pendingRefunds],
              [
                "Epäonnistuneet palautukset, jotka on selvitettävä",
                report.outstanding.failedRefunds,
              ],
            ].map(([label, count]) => (
              <div key={label} className="min-w-0">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium">{count}</dd>
              </div>
            ))}
          </dl>
          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
            {Object.entries(scopes).map(([scope, label]) => (
              <div key={scope} className="min-w-0 space-y-2">
                <h5 className="font-semibold">{label}</h5>
                <ul className="space-y-2 text-sm">
                  {report.checks
                    .filter((check) => check.scope === scope)
                    .map((check) => (
                      <li
                        key={`${check.code}:${check.field ?? ""}`}
                        className="break-words [overflow-wrap:anywhere]"
                      >
                        <span className="font-medium">
                          {states[check.state]}
                        </span>{" "}
                        · {readinessChecks[check.code][0]}
                        {check.field
                          ? `: ${policyFieldLabels[check.field] ?? "Version tiedot"}`
                          : ""}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Tietokannan tarkistus ei näytä kaikkien laitteiden keskeneräisiä
            pyyntöjä eikä vahvista ulkopuolisia maksuja tai ravintolan
            verotietoja. Tyhjät työjonot eivät yksin riitä käyttöönottoon.
          </p>
        </>
      )}
      <RefreshButton
        type="button"
        className="whitespace-normal"
        disabled={busy}
        onClick={refresh}
      >
        Päivitä julkaisun tarkistus
      </RefreshButton>
    </section>
  );
}
