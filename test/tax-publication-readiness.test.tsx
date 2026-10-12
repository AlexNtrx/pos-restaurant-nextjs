import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaxPolicyReviewPanel } from "@/app/backoffice/settings/restaurant/_components/tax-policy-review";
import { TaxPublicationReadinessReport } from "@/app/backoffice/settings/restaurant/_components/tax-publication-readiness";
import { useTaxPublicationReadiness } from "@/app/backoffice/settings/restaurant/_hooks/use-tax-publication-readiness";
import {
  parseTaxPublicationReadiness,
  readinessChecks,
  type TaxPublicationReadiness,
} from "@/app/backoffice/settings/restaurant/_lib/tax-publication-readiness";
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api }));
const configuration = {
  countryCode: "FI" as const,
  vatStatus: "REGISTERED" as const,
  pricingMode: "FINAL_PRICE" as const,
  rates: { FOOD_NON_ALCOHOLIC: 1350, ALCOHOL: 2550 },
  requestedEffectiveDate: "2030-01-01",
  reviewerName: "Proposed reviewer",
  nonRegistrationReason: null,
};
const sellerSnapshot = {
  name: "Original seller",
  address: "Seller street 1",
  phone: "123",
  email: "",
  website: "",
  bankNo: "",
  taxCode: "TEST",
};
const revision = (id = 1) => ({
  id,
  organizationId: 1,
  sourceDraftVersion: id,
  schemaVersion: 1,
  configuration,
  sellerSnapshot,
  createdAt: "2026-10-12T00:00:00.000Z",
  createdByName: "Original admin",
  createdByUserId: 9,
});
const response = (id = 1): TaxPublicationReadiness => ({
  revision: revision(id),
  currentDraftVersion: id,
  candidateMatchesCurrentDraft: true,
  sellerMatchesCurrent: true,
  observedAt: "2026-10-12T01:00:00.000Z",
  catalog: { activeItems: 2, unclassifiedItems: 0, unsupportedItems: 0 },
  outstanding: {
    unpaidOrders: 0,
    paidOpenOrders: 0,
    legacyCartLines: 0,
    openTableSessions: 0,
    pendingRefunds: 0,
    failedRefunds: 0,
  },
  checks: Object.entries(readinessChecks)
    .filter(
      ([code]) =>
        !["CANDIDATE_FIELD_REQUIRED", "CANDIDATE_RATE_MUST_BE_EMPTY"].includes(
          code,
        ),
    )
    .map(([code, [, scope]]) => ({
      code: code as keyof typeof readinessChecks,
      scope,
      state:
        scope === "EXTERNAL"
          ? "UNVERIFIED"
          : scope === "RUNTIME"
            ? "BLOCKED"
            : "PASS",
    })),
  technicalChecksPassed: true,
  canPublish: false,
  canActivate: false,
  commercialReady: false,
});
const busyChange = vi.fn();
function Harness({ version = 1 }: { version?: number }) {
  const state = useTaxPublicationReadiness(busyChange);
  return (
    <>
      <button onClick={() => void state.inspect(1)}>Inspect A</button>
      <button onClick={() => void state.inspect(2)}>Inspect B</button>
      <TaxPublicationReadinessReport
        {...state}
        version={version}
        refresh={() => void state.inspect(state.selectedId!)}
      />
    </>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockResolvedValue({ data: response() });
});
afterEach(cleanup);
describe("readiness response boundary", () => {
  it("accepts technical success while publication remains explicitly unavailable", () => {
    const parsed = parseTaxPublicationReadiness(response(), 1);
    expect(parsed.technicalChecksPassed).toBe(true);
    expect([
      parsed.canPublish,
      parsed.canActivate,
      parsed.commercialReady,
    ]).toEqual([false, false, false]);
  });
  it("rejects malformed identifiers, counts, timestamps and activation flags", () => {
    const changes = [
      { canPublish: true },
      { canActivate: true },
      { commercialReady: true },
      { currentDraftVersion: 0 },
      { observedAt: "2026-02-30T00:00:00.000Z" },
      {
        catalog: { activeItems: 1, unclassifiedItems: 2, unsupportedItems: 0 },
      },
      { outstanding: { ...response().outstanding, failedRefunds: -1 } },
      {
        outstanding: { ...response().outstanding, pendingRefunds: 2147483648 },
      },
    ];
    for (const changed of changes)
      expect(() =>
        parseTaxPublicationReadiness({ ...response(), ...changed }, 1),
      ).toThrow();
    expect(() => parseTaxPublicationReadiness(response(2), 1)).toThrow();
  });
  it("rejects missing, duplicated, unknown, inconsistent and unverified technical checks", () => {
    const baseline = response();
    for (const checks of [
      baseline.checks.slice(1),
      [...baseline.checks, baseline.checks[0]],
      [...baseline.checks, { code: "toString", scope: "DATA", state: "PASS" }],
      baseline.checks.map((check) =>
        check.code === "UNPAID_ORDERS" ? { ...check, state: "BLOCKED" } : check,
      ),
      baseline.checks.map((check) =>
        check.code === "SELLER_MATCH"
          ? { ...check, state: "UNVERIFIED" }
          : check,
      ),
      baseline.checks.map((check) =>
        check.scope === "EXTERNAL" ? { ...check, state: "PASS" } : check,
      ),
    ])
      expect(() =>
        parseTaxPublicationReadiness({ ...baseline, checks }, 1),
      ).toThrow();
    expect(() =>
      parseTaxPublicationReadiness(
        { ...baseline, technicalChecksPassed: false },
        1,
      ),
    ).toThrow();
  });
});
describe("explicit read-only inspection", () => {
  it("does not fetch on mount; keyboard action reads the selected version without writes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(api.get).not.toHaveBeenCalled();
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Inspect A" }),
    );
    await user.keyboard("{Enter}");
    await screen.findByText(
      "Tekniset tarkistukset kunnossa. Julkaisu ja käyttöönotto eivät ole vielä käytettävissä.",
    );
    expect(api.get.mock.calls[0][0]).toBe(
      "/organization/tax-policy-publication-readiness",
    );
    expect(api.get.mock.calls[0][1].params).toEqual({ revisionId: 1 });
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /^(Julkaise|Ota käyttöön)$/ }),
    ).toBeNull();
  });
  it("retains and labels previous results after failure, then refreshes successfully", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Inspect A" }));
    await screen.findByText(/Tarkistettu versio #1/);
    api.get.mockRejectedValueOnce({ response: { status: 403 } });
    await user.click(
      screen.getByRole("button", { name: "Päivitä julkaisun tarkistus" }),
    );
    await screen.findByRole("alert");
    expect(
      screen.getByText(/Näytetään aiempi tarkistus versiosta #1/),
    ).toBeTruthy();
    expect(screen.getByText(/Tarkistettu versio #1/)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Päivitä julkaisun tarkistus" }),
    );
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.queryByText(/Näytetään aiempi tarkistus/)).toBeNull();
  });
  it("a newer saved draft marks the retained report stale without automatically fetching or promoting it", async () => {
    const user = userEvent.setup();
    const view = render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Inspect A" }));
    await screen.findByText(/Tarkistettu versio #1/);
    view.rerender(<Harness version={2} />);
    expect(
      screen.getByText(/Näytetään aiempi tarkistus versiosta #1/),
    ).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(1);
  });
  it("supersedes late responses, deduplicates the same pending selection and aborts on unmount", async () => {
    let resolveA!: (value: unknown) => void,
      resolveB!: (value: unknown) => void;
    api.get
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveB = resolve;
          }),
      );
    const user = userEvent.setup(),
      view = render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Inspect A" }));
    await user.click(screen.getByRole("button", { name: "Inspect A" }));
    expect(api.get).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Inspect B" }));
    expect(api.get.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => resolveB({ data: response(2) }));
    await act(async () => resolveA({ data: response(1) }));
    expect(screen.getByText(/Tarkistettu versio #2/)).toBeTruthy();
    expect(screen.queryByText(/Tarkistettu versio #1/)).toBeNull();
    let finish!: (value: unknown) => void;
    api.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await user.click(screen.getByRole("button", { name: "Inspect A" }));
    view.unmount();
    expect(api.get.mock.calls[2][1].signal.aborted).toBe(true);
    const busyCalls = busyChange.mock.calls.length;
    await act(async () => finish({ data: response(1) }));
    expect(busyChange.mock.calls.length).toBe(busyCalls);
  });
  it("history selection still reads an explicit old candidate while the draft is dirty", async () => {
    api.get.mockImplementation((path: string) =>
      Promise.resolve({
        data: path.endsWith("tax-policy-revisions")
          ? {
              results: [revision(1), revision(2)],
              totalCount: 2,
              page: 1,
              pageSize: 10,
              pageCount: 1,
            }
          : response(1),
      }),
    );
    const user = userEvent.setup();
    render(
      <TaxPolicyReviewPanel
        version={2}
        blocked={true}
        onBusyChange={busyChange}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Tarkista tallennettu luonnos" })
        .matches(":disabled"),
    ).toBe(true);
    await user.click(
      screen.getByRole("button", { name: "Näytä versiohistoria" }),
    );
    await screen.findByText(/Versio #1/);
    await user.click(screen.getByText(/Versio #1/));
    await user.click(
      screen.getByRole("button", {
        name: "Tarkista version #1 julkaisun edellytykset",
      }),
    );
    await screen.findByText(/Tarkistettu versio #1/);
    expect(api.get.mock.calls[1][1].params).toEqual({ revisionId: 1 });
    expect(
      screen.getByText(/Lomakkeen tallentamattomat muutokset/),
    ).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });
});
