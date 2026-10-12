import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaxApprovalPanel } from "@/app/backoffice/settings/restaurant/_components/tax-approval-panel";
import { TaxPolicyReviewPanel } from "@/app/backoffice/settings/restaurant/_components/tax-policy-review";
import { useTaxApproval } from "@/app/backoffice/settings/restaurant/_hooks/use-tax-approval";
import {
  attestationLabels,
  evidenceFromForm,
  emptyEvidence,
  parseApprovalPage,
  parseCreatedApproval,
  parseSavedApproval,
  type ApprovalRequest,
  type TaxApproval,
  type ApprovalSource,
  type SavedApprovalRequest,
} from "@/app/backoffice/settings/restaurant/_lib/tax-approval";
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api }));
const source = (id = 1): ApprovalSource => ({
  id,
  sourceDraftVersion: id,
  configuration: {
    countryCode: "FI",
    vatStatus: "REGISTERED",
    pricingMode: "FINAL_PRICE",
    rates: { FOOD_NON_ALCOHOLIC: 1350, ALCOHOL: 2550 },
    requestedEffectiveDate: "2030-01-01",
    reviewerName: "Proposed reviewer",
    nonRegistrationReason: null,
  },
  sellerSnapshot: {
    name: "Original seller",
    address: "Seller street 1",
    phone: "123",
    email: "",
    website: "",
    bankNo: "",
    taxCode: "TEST",
  },
});
const evidence = () =>
  evidenceFromForm({
    ...emptyEvidence(),
    reviewedByName: "Actual reviewer",
    reviewedOn: "2026-01-01",
    evidenceReference: "Evidence reference",
    attestations: {
      merchantIdentityConfirmed: true,
      taxTreatmentConfirmed: true,
      categoryMappingConfirmed: true,
      roundingConfirmed: true,
    },
  });
const approval = (request: ApprovalRequest): TaxApproval => ({
  id: request.sourceRevisionId,
  organizationId: 1,
  sourceRevisionId: request.sourceRevisionId,
  sourceDraftVersion: request.expectedDraftVersion,
  schemaVersion: 1,
  configuration: source().configuration,
  sellerSnapshot: source().sellerSnapshot,
  reviewEvidence: request.reviewEvidence,
  recordedAt: "2026-10-12T00:00:00.000Z",
  recordedByUserId: 7,
  recordedByName: "Original admin",
});
const saved = (id = 1): SavedApprovalRequest => ({
  schemaVersion: 1,
  source: source(id),
  payload: {
    sourceRevisionId: id,
    expectedDraftVersion: id,
    idempotencyKey: crypto.randomUUID(),
    reviewEvidence: evidence(),
  },
});
const storedKey = (attempt: SavedApprovalRequest, owner = "7") =>
  `pending-request:v1:${owner}:tax-approval:${attempt.payload.idempotencyKey}`;
const busyChange = vi.fn();
function Harness({ allowed = true }: { allowed?: boolean }) {
  const state = useTaxApproval(busyChange);
  return (
    <>
      <button onClick={() => state.select(source())}>Select A</button>
      <button onClick={() => state.select(source(2))}>Select B</button>
      <TaxApprovalPanel state={state} allowed={allowed} disabled={false} />
    </>
  );
}
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("mytokenfornextjsproject", "test-token");
  localStorage.setItem("next_name", "Admin");
  localStorage.setItem("next_user_id", "7");
  vi.resetAllMocks();
  api.post.mockImplementation((_path: string, request: ApprovalRequest) =>
    Promise.resolve({
      data: {
        created: true,
        approval: approval(request),
        canActivate: false,
        commercialReady: false,
      },
    }),
  );
  api.get.mockResolvedValue({
    data: {
      results: [],
      totalCount: 0,
      page: 1,
      pageSize: 10,
      pageCount: 0,
      canActivate: false,
      commercialReady: false,
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function fillEvidence() {
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("Todellisen tarkistajan nimi"),
    "Actual reviewer",
  );
  fireEvent.change(screen.getByLabelText("Tarkistuspäivä"), {
    target: { value: "2026-01-01" },
  });
  await user.type(
    screen.getByLabelText("Tarkistuksen tositeviite"),
    "Evidence reference",
  );
  for (const label of Object.values(attestationLabels))
    await user.click(screen.getByRole("checkbox", { name: label }));
  return user;
}
it("parses only bounded, complete immutable approvals and validates explicit evidence", () => {
  const pending = saved(),
    dto = approval(pending.payload);
  expect(parseSavedApproval(pending)).toEqual(pending);
  expect(() => evidenceFromForm(emptyEvidence())).toThrow();
  expect(() =>
    evidenceFromForm({
      ...emptyEvidence(),
      ...evidence(),
      reviewedOn: "2026-02-30",
    }),
  ).toThrow();
  expect(
    parseSavedApproval({
      ...pending,
      payload: { ...pending.payload, expectedDraftVersion: 2 },
    }),
  ).toBeNull();
  expect(
    parseSavedApproval({
      ...pending,
      payload: { ...pending.payload, active: true },
    }),
  ).toBeNull();
  for (const result of [
    { created: true, approval: dto, canActivate: true, commercialReady: false },
    {
      created: true,
      approval: { ...dto, sourceRevisionId: 2 },
      canActivate: false,
      commercialReady: false,
    },
    {
      created: true,
      approval: {
        ...dto,
        reviewEvidence: {
          ...dto.reviewEvidence,
          attestations: {
            ...dto.reviewEvidence.attestations,
            roundingConfirmed: false,
          },
        },
      },
      canActivate: false,
      commercialReady: false,
    },
  ])
    expect(() => parseCreatedApproval(result, pending.payload)).toThrow();
  for (const page of [
    {
      results: [dto],
      totalCount: 0,
      page: 1,
      pageSize: 10,
      pageCount: 0,
      canActivate: false,
      commercialReady: false,
    },
    {
      results: [],
      totalCount: 0,
      page: 1,
      pageSize: 51,
      pageCount: 0,
      canActivate: false,
      commercialReady: false,
    },
  ])
    expect(() => parseApprovalPage(page)).toThrow();
});
it("leaves actual evidence blank, focuses the missing field and never substitutes proposed reviewer/date", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Select A" }));
  expect(
    (screen.getByLabelText("Todellisen tarkistajan nimi") as HTMLInputElement)
      .value,
  ).toBe("");
  expect(
    (screen.getByLabelText("Tarkistuspäivä") as HTMLInputElement).value,
  ).toBe("");
  expect(
    screen
      .getAllByRole("checkbox")
      .every((element) => !(element as HTMLInputElement).checked),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Kirjaa hyväksyntä" }));
  await screen.findByRole("alert");
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByLabelText("Todellisen tarkistajan nimi"),
    ),
  );
  expect(api.post).not.toHaveBeenCalled();
});
it("persists before send, rejects a rapid duplicate and removes only the successful request", async () => {
  let resolve!: (value: unknown) => void;
  api.post.mockImplementation((_path: string, request: ApprovalRequest) => {
    const value = [...Array(localStorage.length)]
      .map((_, i) => localStorage.key(i))
      .find((key) => key?.endsWith(request.idempotencyKey));
    expect(value).toBeTruthy();
    return new Promise((done) => {
      resolve = done;
    });
  });
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Select A" }));
  await fillEvidence();
  const submit = screen.getByRole("button", {
    name: "Kirjaa hyväksyntä",
  });
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(api.post).toHaveBeenCalledTimes(1);
  const request = api.post.mock.calls[0][1];
  await act(async () =>
    resolve({
      data: {
        created: true,
        approval: approval(request),
        canActivate: false,
        commercialReady: false,
      },
    }),
  );
  await screen.findByText(/Hyväksyntä #1 kirjattu/);
  expect(
    localStorage.getItem(
      `pending-request:v1:7:tax-approval:${request.idempotencyKey}`,
    ),
  ).toBeNull();
  expect(api.put).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", {
      name: /^(Julkaise|Ota käyttöön|Aloita tauko)$/,
    }),
  ).toBeNull();
});
it("preserves an uncertain original payload through reload and retries it even when the VAT draft changed", async () => {
  api.post.mockRejectedValueOnce(new Error("Lost response"));
  const user = userEvent.setup(),
    view = render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Select A" }));
  await fillEvidence();
  await user.click(screen.getByRole("button", { name: "Kirjaa hyväksyntä" }));
  await screen.findByRole("alert");
  const original = structuredClone(api.post.mock.calls[0][1]);
  expect(
    (screen.getByLabelText("Todellisen tarkistajan nimi") as HTMLInputElement)
      .disabled,
  ).toBe(true);
  view.unmount();
  render(<Harness allowed={false} />);
  await screen.findByText(/Aiemman yrityksen tulos on tarkistettava/);
  await user.click(
    screen.getByRole("button", { name: "Tarkista aiemman yrityksen tulos" }),
  );
  await screen.findByText(/Hyväksyntä #1 kirjattu/);
  expect(api.post.mock.calls[1][1]).toEqual(original);
  expect(
    (screen.getByLabelText("Todellisen tarkistajan nimi") as HTMLInputElement)
      .value,
  ).toBe("Actual reviewer");
  expect(
    (screen.getByLabelText("Todellisen tarkistajan nimi") as HTMLInputElement)
      .disabled,
  ).toBe(true);
});
it("definite conflict requires explicit editing and retains all evidence fields", async () => {
  api.post.mockRejectedValueOnce({
    isAxiosError: true,
    response: { status: 409, data: { code: "TAX_APPROVAL_SOURCE_CHANGED" } },
  });
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Select A" }));
  await fillEvidence();
  await user.click(screen.getByRole("button", { name: "Kirjaa hyväksyntä" }));
  await screen.findByRole("alert");
  expect(
    (screen.getByLabelText("Todellisen tarkistajan nimi") as HTMLInputElement)
      .disabled,
  ).toBe(true);
  await user.click(
    screen.getByRole("button", {
      name: "Muokkaa tietoja ennen uutta yritystä",
    }),
  );
  expect(
    (screen.getByLabelText("Todellisen tarkistajan nimi") as HTMLInputElement)
      .value,
  ).toBe("Actual reviewer");
  expect(
    (screen.getByLabelText("Tarkistuksen tositeviite") as HTMLTextAreaElement)
      .value,
  ).toBe("Evidence reference");
  await user.click(screen.getByRole("button", { name: "Kirjaa hyväksyntä" }));
  await screen.findByText(/Hyväksyntä #1 kirjattu/);
  expect(api.post.mock.calls[1][1].idempotencyKey).not.toBe(
    api.post.mock.calls[0][1].idempotencyKey,
  );
});
it("inaccessible storage sends nothing and keeps editable evidence; malformed pending blocks fresh creation", async () => {
  const user = userEvent.setup(),
    view = render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Select A" }));
  await fillEvidence();
  const write = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
  await user.click(screen.getByRole("button", { name: "Kirjaa hyväksyntä" }));
  await screen.findByRole("alert");
  expect(api.post).not.toHaveBeenCalled();
  expect(
    (screen.getByLabelText("Todellisen tarkistajan nimi") as HTMLInputElement)
      .value,
  ).toBe("Actual reviewer");
  write.mockRestore();
  view.unmount();
  localStorage.setItem(
    "pending-request:v1:7:tax-approval:broken",
    "broken JSON",
  );
  render(<Harness />);
  await screen.findByText(/Tallennettu pyyntö on virheellinen/);
  await user.click(screen.getByRole("button", { name: "Select A" }));
  expect(screen.queryByLabelText("Todellisen tarkistajan nimi")).toBeNull();
});
it("keeps separate original attempts from two tabs and exposes the remaining request after the first succeeds", async () => {
  const first = saved(),
    second = saved(2);
  localStorage.setItem(storedKey(first), JSON.stringify(first));
  localStorage.setItem(storedKey(second), JSON.stringify(second));
  const user = userEvent.setup();
  render(<Harness />);
  await screen.findByText(/Tarkista kaikki aiemmat yritykset/);
  await user.click(
    screen.getByRole("button", { name: "Tarkista aiemman yrityksen tulos" }),
  );
  await screen.findByText(/Hyväksyntä #1 kirjattu/);
  expect(localStorage.getItem(storedKey(second))).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: "Tarkista aiempi yritys · versio #2" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Tarkista aiemman yrityksen tulos" }),
  );
  await screen.findByText(/Hyväksyntä #2 kirjattu/);
  expect(api.post.mock.calls[1][1]).toEqual(second.payload);
});
it("ignores an unmounted response and leaves the original pending record for recovery", async () => {
  let resolve!: (value: unknown) => void;
  api.post.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const user = userEvent.setup(),
    view = render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Select A" }));
  await fillEvidence();
  await user.click(screen.getByRole("button", { name: "Kirjaa hyväksyntä" }));
  const request = api.post.mock.calls[0][1];
  view.unmount();
  expect(api.post.mock.calls[0][2].signal.aborted).toBe(true);
  await act(async () =>
    resolve({
      data: {
        created: true,
        approval: approval(request),
        canActivate: false,
        commercialReady: false,
      },
    }),
  );
  expect(
    localStorage.getItem(
      `pending-request:v1:7:tax-approval:${request.idempotencyKey}`,
    ),
  ).toBeTruthy();
});
it("account change hides evidence and prevents late results from clearing the original owner's pending record", async () => {
  const original = saved();
  localStorage.setItem(storedKey(original), JSON.stringify(original));
  let resolve!: (value: unknown) => void;
  api.post.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const user = userEvent.setup();
  render(<Harness />);
  await screen.findByText(/Aiemman yrityksen tulos/);
  await user.click(
    screen.getByRole("button", { name: "Tarkista aiemman yrityksen tulos" }),
  );
  await act(async () => {
    localStorage.setItem("next_user_id", "8");
    localStorage.setItem("mytokenfornextjsproject", "other-token");
    window.dispatchEvent(new StorageEvent("storage"));
  });
  expect(screen.queryByLabelText("Todellisen tarkistajan nimi")).toBeNull();
  await act(async () =>
    resolve({
      data: {
        created: true,
        approval: approval(original.payload),
        canActivate: false,
        commercialReady: false,
      },
    }),
  );
  expect(localStorage.getItem(storedKey(original))).toBeTruthy();
  expect(screen.queryByText(/Hyväksyntä #1 kirjattu/)).toBeNull();
});
it("changing candidate selection preserves unsubmitted evidence per candidate and manual history errors preserve original copies", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Select A" }));
  await user.type(
    screen.getByLabelText("Todellisen tarkistajan nimi"),
    "Draft witness",
  );
  await user.click(screen.getByRole("button", { name: "Select B" }));
  await user.click(screen.getByRole("button", { name: "Select A" }));
  expect(
    (screen.getByLabelText("Todellisen tarkistajan nimi") as HTMLInputElement)
      .value,
  ).toBe("Draft witness");
  const row = approval(saved().payload);
  api.get.mockResolvedValueOnce({
    data: {
      results: [row],
      totalCount: 1,
      page: 1,
      pageSize: 10,
      pageCount: 1,
      canActivate: false,
      commercialReady: false,
    },
  });
  await user.click(
    screen.getByRole("button", { name: "Näytä hyväksyntähistoria" }),
  );
  await screen.findByText("Hyväksyntähistoria (1)");
  api.get.mockRejectedValueOnce(new Error("Offline"));
  await user.click(
    screen.getByRole("button", { name: "Näytä hyväksyntähistoria" }),
  );
  await screen.findByRole("alert");
  expect(screen.getByText("Hyväksyntähistoria (1)")).toBeTruthy();
});
it("the integrated form blocks new approval until a clean current saved candidate has been reviewed", async () => {
  api.get.mockImplementation((path: string) =>
    Promise.resolve({
      data: path.endsWith("tax-policy-review")
        ? {
            organizationConfigured: true,
            draftVersion: 1,
            canCreateRevision: false,
            commercialReady: false,
            issues: [],
            existingRevisionId: 1,
            configuration: source().configuration,
            sellerSnapshot: source().sellerSnapshot,
          }
        : {
            results: [],
            totalCount: 0,
            page: 1,
            pageSize: 10,
            pageCount: 0,
            canActivate: false,
            commercialReady: false,
          },
    }),
  );
  const user = userEvent.setup(),
    view = render(
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
    screen.getByRole("button", {
      name: "Kirjaa nykyisen version #1 tarkistuksen hyväksyntä",
    }),
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Kirjaa hyväksyntä",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  view.rerender(
    <TaxPolicyReviewPanel
      version={1}
      blocked={true}
      onBusyChange={busyChange}
    />,
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Kirjaa hyväksyntä",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(api.post).not.toHaveBeenCalled();
});
