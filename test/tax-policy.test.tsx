import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaxPolicyReviewPanel } from "@/app/backoffice/settings/restaurant/_components/tax-policy-review";
import { TaxSettingsDraft } from "@/app/backoffice/settings/restaurant/_components/tax-settings-draft";
import {
  parseTaxPolicyPage,
  parseTaxPolicyReview,
  parseTaxPolicyRevision,
  type TaxPolicyReview,
  type TaxPolicyRevision,
} from "@/app/backoffice/settings/restaurant/_lib/tax-policy";
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
  email: "test@example.invalid",
  website: "example.invalid",
  bankNo: "TEST BANK",
  taxCode: "TEST",
};
const review = (): TaxPolicyReview => ({
  organizationConfigured: true,
  draftVersion: 1,
  canCreateRevision: true,
  commercialReady: false,
  issues: [],
  existingRevisionId: null,
  configuration,
  sellerSnapshot,
});
const revision = (id = 1): TaxPolicyRevision => ({
  id,
  organizationId: 1,
  sourceDraftVersion: id,
  schemaVersion: 1,
  configuration,
  sellerSnapshot,
  createdAt: "2026-10-11T12:00:00.000Z",
  createdByUserId: 9,
  createdByName: "Original admin",
});
const page = (number = 1) => ({
  results:
    number === 1
      ? Array.from({ length: 10 }, (_, i) => revision(11 - i))
      : [revision()],
  totalCount: 11,
  page: number,
  pageSize: 10,
  pageCount: 2,
});
const busyChange = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockImplementation(
    (path: string, options?: { params?: { page: number } }) =>
      Promise.resolve({
        data:
          path === "/organization/tax-policy-review"
            ? review()
            : path === "/organization/tax-draft"
              ? {
                  organizationConfigured: true,
                  version: 1,
                  draft: {
                    ...configuration,
                    schemaVersion: 1,
                    savedByUserId: 9,
                    savedAt: "2026-10-11T12:00:00.000Z",
                  },
                }
              : page(options?.params?.page),
      }),
  );
  api.post.mockResolvedValue({ data: { created: true, revision: revision() } });
});
afterEach(cleanup);
describe("review candidates", () => {
  it("requires saved clean draft review, shows every field and sends only its reviewed version", async () => {
    const user = userEvent.setup();
    render(
      <TaxPolicyReviewPanel
        version={1}
        blocked={false}
        onBusyChange={busyChange}
      />,
    );
    expect(api.get).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Tarkista tallennettu luonnos" }),
    );
    await screen.findByText("Tarkistettu luonnos v1");
    for (const text of [
      "13.5 %",
      "25.5 %",
      "2030-01-01",
      "Proposed reviewer",
      "Original seller",
      "TEST BANK",
    ])
      expect(screen.getByText(text)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Tallenna versio tarkistettavaksi" }),
    );
    await screen.findByRole("status");
    expect(api.post.mock.calls[0][1]).toEqual({ expectedDraftVersion: 1 });
    expect(
      screen
        .getByRole("button", { name: "Tallenna versio tarkistettavaksi" })
        .matches(":disabled"),
    ).toBe(true);
    expect(
      screen.getByText("Tarkistusta varten – ei käytössä myynnissä"),
    ).toBeTruthy();
  });
  it("blocks creation during dirty draft editing and after its saved version changes", async () => {
    const user = userEvent.setup();
    render(<TaxSettingsDraft />);
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Tarkista tallennettu luonnos" })
          .matches(":disabled"),
      ).toBe(false),
    );
    await user.click(
      screen.getByRole("button", { name: "Tarkista tallennettu luonnos" }),
    );
    await screen.findByText("Tarkistettu luonnos v1");
    await user.type(
      screen.getByLabelText("Tarkistajan nimi (ehdotus)"),
      " changed",
    );
    expect(
      screen
        .getByRole("button", { name: "Tallenna versio tarkistettavaksi" })
        .matches(":disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Tarkista tallennettu luonnos" })
        .matches(":disabled"),
    ).toBe(true);
    api.put.mockResolvedValue({
      data: {
        organizationConfigured: true,
        version: 2,
        draft: {
          ...configuration,
          reviewerName: "Proposed reviewer changed",
          schemaVersion: 1,
          savedByUserId: 9,
          savedAt: "2026-10-11T12:00:00.000Z",
        },
      },
    });
    await user.click(screen.getByRole("button", { name: "Tallenna luonnos" }));
    await screen.findByText("Luonnos tallennettu. Ei käytössä myynnissä.");
    expect(
      screen
        .getByRole("button", { name: "Tallenna versio tarkistettavaksi" })
        .matches(":disabled"),
    ).toBe(true);
    expect(api.post).not.toHaveBeenCalled();
  });
  it("shows conflicting non-registration rates without clearing draft values", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({
      data: {
        ...review(),
        canCreateRevision: false,
        configuration: { ...configuration, vatStatus: "NOT_REGISTERED" },
        issues: [{ code: "RATE_MUST_BE_EMPTY", field: "rates.ALCOHOL" }],
      },
    });
    render(
      <TaxPolicyReviewPanel
        version={1}
        blocked={false}
        onBusyChange={busyChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Tarkista tallennettu luonnos" }),
    );
    await screen.findByText(/tyhjennä prosentti/);
    expect(screen.getByText("25.5 %")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Tallenna versio tarkistettavaksi" })
        .matches(":disabled"),
    ).toBe(true);
  });
  it("keeps preview after conflict and requires explicit review before another create", async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { code: "TAX_DRAFT_CONFLICT" } },
    });
    render(
      <TaxPolicyReviewPanel
        version={1}
        blocked={false}
        onBusyChange={busyChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Tarkista tallennettu luonnos" }),
    );
    await screen.findByText("Tarkistettu luonnos v1");
    await user.click(
      screen.getByRole("button", { name: "Tallenna versio tarkistettavaksi" }),
    );
    await screen.findByRole("alert");
    expect(screen.getByText("Original seller")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Tallenna versio tarkistettavaksi" })
        .matches(":disabled"),
    ).toBe(true);
    await user.click(
      screen.getByRole("button", { name: "Tarkista tallennettu luonnos" }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Tallenna versio tarkistettavaksi" })
          .matches(":disabled"),
      ).toBe(false),
    );
  });
  it("uses the exact same version after an ambiguous network failure", async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValueOnce(new Error("Network failed"));
    api.post.mockResolvedValueOnce({
      data: { created: false, revision: revision() },
    });
    render(
      <TaxPolicyReviewPanel
        version={1}
        blocked={false}
        onBusyChange={busyChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Tarkista tallennettu luonnos" }),
    );
    await screen.findByText("Tarkistettu luonnos v1");
    await user.click(
      screen.getByRole("button", { name: "Tallenna versio tarkistettavaksi" }),
    );
    await screen.findByRole("alert");
    await user.click(
      screen.getByRole("button", { name: "Tallenna versio tarkistettavaksi" }),
    );
    await screen.findByRole("status");
    expect(api.post.mock.calls.map((call) => call[1])).toEqual([
      { expectedDraftVersion: 1 },
      { expectedDraftVersion: 1 },
    ]);
  });
  it("reads paginated original copies and blocks duplicate creation of an existing revision", async () => {
    const user = userEvent.setup();
    api.get.mockImplementation(
      (path: string, options?: { params?: { page: number } }) =>
        Promise.resolve({
          data: path.endsWith("review")
            ? { ...review(), canCreateRevision: false, existingRevisionId: 1 }
            : page(options?.params?.page),
        }),
    );
    render(
      <TaxPolicyReviewPanel
        version={1}
        blocked={false}
        onBusyChange={busyChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Tarkista tallennettu luonnos" }),
    );
    await screen.findByText(/alkuperäiset myyjätiedot/);
    expect(
      screen
        .getByRole("button", { name: "Tallenna versio tarkistettavaksi" })
        .matches(":disabled"),
    ).toBe(true);
    await user.click(
      screen.getByRole("button", { name: "Näytä versiohistoria" }),
    );
    await screen.findByText("Sivu 1 / 2");
    await user.click(screen.getByRole("button", { name: "Seuraava" }));
    await screen.findByText("Sivu 2 / 2");
    const summary = screen.getByText(/Versio #1 ·/);
    await user.click(summary);
    expect(screen.getAllByText("Original seller").length).toBe(2);
    expect(api.get.mock.calls.at(-1)?.[1].params).toEqual({
      page: 2,
      limit: 10,
    });
  });
  it("rejects malformed, unbounded or commercially active responses", () => {
    expect(parseTaxPolicyReview(review()).commercialReady).toBe(false);
    for (const value of [
      { ...review(), commercialReady: true },
      { ...review(), issues: [{}] },
      { ...review(), sellerSnapshot: null },
      {
        ...review(),
        configuration: {
          ...configuration,
          rates: { ALCOHOL: 0, FOOD_NON_ALCOHOLIC: 1350 },
        },
      },
    ])
      expect(() => parseTaxPolicyReview(value)).toThrow();
    expect(() =>
      parseTaxPolicyRevision({ ...revision(), createdByUserId: "1" }),
    ).toThrow();
    expect(() =>
      parseTaxPolicyPage({ ...page(), results: Array(11).fill(revision()) }, 1),
    ).toThrow();
    expect(() => parseTaxPolicyPage(page(2), 1)).toThrow();
  });
});
