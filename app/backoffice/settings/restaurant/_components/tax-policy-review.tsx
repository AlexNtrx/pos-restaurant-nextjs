"use client";
import { Button } from "@/components/ui/button";
import { useTaxPolicy } from "../_hooks/use-tax-policy";
import { useTaxPublicationReadiness } from "../_hooks/use-tax-publication-readiness";
import { TaxPublicationReadinessReport } from "./tax-publication-readiness";
import { policyFieldLabels } from "../_lib/tax-policy";
import { TaxPolicyPreview as Preview } from "./tax-policy-preview";
import { useTaxApproval } from "../_hooks/use-tax-approval";
import { TaxApprovalPanel } from "./tax-approval-panel";
export function TaxPolicyReviewPanel({
  version,
  blocked,
  onBusyChange,
}: {
  version: number | null;
  blocked: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const state = useTaxPolicy(version, blocked, onBusyChange);
  const readiness = useTaxPublicationReadiness(onBusyChange);
  const approval = useTaxApproval(onBusyChange);
  const busy = state.busy || readiness.busy || approval.busy;
  const mismatch = state.review && state.review.draftVersion !== version;
  return (
    <section
      className="mt-6 min-w-0 space-y-4 border-t pt-6"
      aria-labelledby="tax-review-title"
      aria-busy={busy}
    >
      <h3 id="tax-review-title" className="text-lg font-semibold">
        ALV-luonnoksen tarkistus
      </h3>
      <p className="text-sm font-semibold">
        Tarkistusta varten – ei käytössä myynnissä
      </p>
      <p className="text-sm text-muted-foreground">
        Tarkistus koskee tallennettua luonnosta. Se ei vahvista verotietojen
        oikeellisuutta. Päivämäärä ja tarkistajan nimi ovat ehdotuksia.
        Tallennus ottaa kopion palvelimella olevista ravintolan tiedoista;
        versioita ei voi muokata jälkikäteen.
      </p>
      {blocked && (
        <p className="text-sm">
          Tallenna tai palauta luonnos ensin. Odota keskeneräisen toiminnon
          valmistumista.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="min-h-11 whitespace-normal"
          variant="outline"
          disabled={blocked || busy}
          onClick={() => void state.inspect()}
        >
          Tarkista tallennettu luonnos
        </Button>
        <Button
          type="button"
          className="min-h-11 whitespace-normal"
          variant="outline"
          disabled={busy}
          onClick={() => void state.loadHistory()}
        >
          Näytä versiohistoria
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {(mismatch || state.mustRefresh) && (
        <p className="text-sm">
          Tarkista tallennettu luonnos uudelleen. Jos versiot eroavat, tarkista
          myös uusin luonnos yllä.
        </p>
      )}
      {state.review && (
        <div className="min-w-0 space-y-4 rounded-md border p-4">
          <p className="font-medium">
            Tarkistettu luonnos v{state.review.draftVersion}
          </p>
          {state.review.configuration && (
            <Preview
              configuration={state.review.configuration}
              seller={state.review.sellerSnapshot}
            />
          )}
          {state.review.issues.length > 0 && (
            <div className="text-sm">
              <p className="font-medium">Korjaa ennen version tallentamista:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {state.review.issues.map((issue) => (
                  <li key={`${issue.code}-${issue.field}`}>
                    {policyFieldLabels[issue.field] ?? "Luonnoksen tiedot"}:{" "}
                    {issue.code === "RATE_MUST_BE_EMPTY"
                      ? "tyhjennä prosentti, jos ei ALV-rekisterissä"
                      : "täydennä tai tarkista tieto"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {state.review.existingRevisionId && (
            <div className="space-y-2">
              <p className="text-sm">
                Tästä luonnoksesta on jo versio #
                {state.review.existingRevisionId}. Se säilyttää alkuperäiset
                myyjätiedot. Tallenna luonnos uudeksi versioksi ennen uuden
                kopion luomista. Lue alkuperäinen kopio versiohistoriasta.
              </p>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 whitespace-normal"
                disabled={busy}
                aria-label={`Tarkista nykyisen version #${state.review.existingRevisionId} julkaisun edellytykset`}
                onClick={() =>
                  void readiness.inspect(state.review!.existingRevisionId!)
                }
              >
                Tarkista julkaisun edellytykset
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 whitespace-normal"
                disabled={
                  busy ||
                  Boolean(approval.pending) ||
                  approval.blockedStorage ||
                  approval.attempts.length > 0
                }
                aria-label={`Kirjaa nykyisen version #${state.review.existingRevisionId} tarkistuksen hyväksyntä`}
                onClick={() =>
                  approval.select({
                    id: state.review!.existingRevisionId!,
                    sourceDraftVersion: state.review!.draftVersion,
                    configuration: state.review!.configuration!,
                    sellerSnapshot: state.review!.sellerSnapshot!,
                  })
                }
              >
                Kirjaa tarkistuksen hyväksyntä
              </Button>
            </div>
          )}
          <Button
            type="button"
            className="min-h-11 whitespace-normal"
            disabled={!state.canCreate || readiness.busy || approval.busy}
            onClick={() => void state.create()}
          >
            Tallenna versio tarkistettavaksi
          </Button>
        </div>
      )}
      {state.saved && (
        <div className="space-y-2">
          <p role="status" className="text-sm">
            Versio #{state.saved.id} tallennettu luonnoksesta v
            {state.saved.sourceDraftVersion} —{" "}
            {new Date(state.saved.createdAt).toLocaleString("fi-FI")}. Ei
            käytössä myynnissä.
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 whitespace-normal"
            disabled={busy}
            aria-label={`Tarkista tallennetun version #${state.saved.id} julkaisun edellytykset`}
            onClick={() => void readiness.inspect(state.saved!.id)}
          >
            Tarkista julkaisun edellytykset
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 whitespace-normal"
            disabled={
              busy ||
              Boolean(approval.pending) ||
              approval.blockedStorage ||
              approval.attempts.length > 0
            }
            aria-label={`Kirjaa tallennetun version #${state.saved.id} tarkistuksen hyväksyntä`}
            onClick={() => approval.select(state.saved!)}
          >
            Kirjaa tarkistuksen hyväksyntä
          </Button>
        </div>
      )}
      {state.history && (
        <div className="min-w-0 space-y-3">
          <h4 className="font-semibold">
            Versiohistoria ({state.history.totalCount})
          </h4>
          {!state.history.results.length && (
            <p className="text-sm">Ei versioita tällä sivulla.</p>
          )}
          {state.history.results.map((revision) => (
            <details
              key={revision.id}
              className="min-w-0 rounded-md border p-3"
            >
              <summary className="min-h-11 cursor-pointer break-words py-2 text-sm [overflow-wrap:anywhere]">
                Versio #{revision.id} · luonnos v{revision.sourceDraftVersion} ·{" "}
                {new Date(revision.createdAt).toLocaleString("fi-FI")} ·{" "}
                {revision.createdByName}
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-sm">
                  Tallennettu tarkistusta varten. Ei käytössä myynnissä.
                </p>
                <Preview
                  configuration={revision.configuration}
                  seller={revision.sellerSnapshot}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 whitespace-normal"
                  disabled={busy}
                  aria-label={`Tarkista version #${revision.id} julkaisun edellytykset`}
                  onClick={() => void readiness.inspect(revision.id)}
                >
                  Tarkista julkaisun edellytykset
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 whitespace-normal"
                  disabled={
                    busy ||
                    Boolean(approval.pending) ||
                    approval.blockedStorage ||
                    approval.attempts.length > 0
                  }
                  aria-label={`Kirjaa version #${revision.id} tarkistuksen hyväksyntä`}
                  onClick={() => approval.select(revision)}
                >
                  Kirjaa tarkistuksen hyväksyntä
                </Button>
              </div>
            </details>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy || state.history.page <= 1}
              onClick={() => void state.loadHistory(state.history!.page - 1)}
            >
              Edellinen
            </Button>
            <span className="text-sm">
              Sivu {state.history.page} / {Math.max(1, state.history.pageCount)}
            </span>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy || state.history.page >= state.history.pageCount}
              onClick={() => void state.loadHistory(state.history!.page + 1)}
            >
              Seuraava
            </Button>
          </div>
        </div>
      )}
      <TaxPublicationReadinessReport
        selectedId={readiness.selectedId}
        report={readiness.report}
        busy={busy}
        error={readiness.error}
        version={version}
        refresh={() => {
          if (readiness.selectedId)
            void readiness.inspect(readiness.selectedId);
        }}
      />
      <TaxApprovalPanel
        state={approval}
        disabled={state.busy || readiness.busy}
        allowed={
          !blocked &&
          !state.mustRefresh &&
          Boolean(
            approval.source &&
            approval.source.sourceDraftVersion === version &&
            (state.saved?.id === approval.source.id ||
              (state.review?.existingRevisionId === approval.source.id &&
                state.review.draftVersion === version)),
          )
        }
      />
    </section>
  );
}
