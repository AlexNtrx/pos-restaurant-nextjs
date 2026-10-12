import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaxSettingsDraft } from "@/app/backoffice/settings/restaurant/_components/tax-settings-draft";
import {
  emptyTaxForm,
  fromTaxForm,
  parseRate,
  parseTaxResponse,
  type TaxDraftResponse,
} from "@/app/backoffice/settings/restaurant/_lib/tax-draft";
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api }));
const response = (version = 0, reviewer = ""): TaxDraftResponse => ({
  organizationConfigured: true,
  version,
  draft: version
    ? {
        ...fromTaxForm({ ...emptyTaxForm, reviewerName: reviewer }),
        schemaVersion: 1,
        savedByUserId: 1,
        savedAt: "2026-10-11T12:00:00.000Z",
      }
    : null,
});
beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockResolvedValue({ data: response() });
  api.put.mockResolvedValue({ data: response(1, "Reviewer") });
});
afterEach(cleanup);
describe("tax draft", () => {
  it("focuses the invalid percentage, keeps its input and does not send a mutation", async () => {
    const user = userEvent.setup();
    render(<TaxSettingsDraft />);
    const input = screen.getByLabelText("Ruoka ja alkoholittomat juomat (%)");
    await waitFor(() => expect(input.matches(":disabled")).toBe(false));
    await user.type(input, "0");
    await user.click(screen.getByRole("button", { name: "Tallenna luonnos" }));
    await screen.findByRole("alert");
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect((input as HTMLInputElement).value).toBe("0");
    expect(api.put).not.toHaveBeenCalled();
  });
  it("parses integer basis points, nullable unknowns and rejects unsafe responses", () => {
    expect(parseRate("13,50")).toBe(1350);
    expect(parseRate("0.01")).toBe(1);
    expect(parseRate("100")).toBe(10000);
    expect(parseRate(" ")).toBeNull();
    for (const value of ["0", "100.01", "13.555", "1e2", "-1"])
      expect(() => parseRate(value)).toThrow();
    expect(fromTaxForm(emptyTaxForm).vatStatus).toBe("UNCONFIRMED");
    expect(() =>
      fromTaxForm({ ...emptyTaxForm, requestedEffectiveDate: "2026-02-29" }),
    ).toThrow();
    expect(() => parseTaxResponse({ ...response(), version: 3 })).toThrow();
    expect(() =>
      parseTaxResponse({
        ...response(1),
        draft: { ...response(1).draft, savedByUserId: "1" },
      }),
    ).toThrow();
  });
  it("saves incomplete draft without client metadata or activation", async () => {
    const user = userEvent.setup();
    render(<TaxSettingsDraft />);
    const input = await screen.findByLabelText("Tarkistajan nimi (ehdotus)");
    await waitFor(() => expect(input.matches(":disabled")).toBe(false));
    await user.type(input, "Reviewer");
    await user.click(screen.getByRole("button", { name: "Tallenna luonnos" }));
    await screen.findByText("Luonnos tallennettu. Ei käytössä myynnissä.");
    expect(api.put.mock.calls[0][1]).toEqual({
      expectedVersion: 0,
      draft: { ...fromTaxForm(emptyTaxForm), reviewerName: "Reviewer" },
    });
    expect(screen.getByText("Luonnos – ei käytössä myynnissä")).toBeTruthy();
  });
  it("retains dirty fields through conflict and requires an explicit latest-version choice", async () => {
    const user = userEvent.setup();
    render(<TaxSettingsDraft />);
    const input = screen.getByLabelText("Tarkistajan nimi (ehdotus)");
    await waitFor(() => expect(input.matches(":disabled")).toBe(false));
    await user.type(input, "Mine");
    api.put.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { code: "TAX_DRAFT_CONFLICT" } },
    });
    await user.click(screen.getByRole("button", { name: "Tallenna luonnos" }));
    await screen.findByText(/Toinen välilehti/);
    expect((input as HTMLInputElement).value).toBe("Mine");
    api.get.mockResolvedValue({ data: response(2, "Other tab") });
    await user.click(
      screen.getByRole("button", { name: "Tarkista uusin luonnos" }),
    );
    await screen.findByText("Other tab");
    expect((input as HTMLInputElement).value).toBe("Mine");
    expect(
      screen
        .getByRole("button", { name: "Tallenna luonnos" })
        .matches(":disabled"),
    ).toBe(true);
    await user.click(
      screen.getByRole("button", { name: "Säilytä omat kentät" }),
    );
    expect((input as HTMLInputElement).value).toBe("Mine");
    expect(api.put).toHaveBeenCalledTimes(1);
    api.put.mockResolvedValue({ data: response(3, "Mine") });
    await user.click(screen.getByRole("button", { name: "Tallenna luonnos" }));
    await screen.findByText("Luonnos tallennettu. Ei käytössä myynnissä.");
    expect(api.put.mock.calls[1][1].expectedVersion).toBe(2);
  });
  it("offers server replacement separately and preserves fields after transport or permission errors", async () => {
    const user = userEvent.setup();
    render(<TaxSettingsDraft />);
    const input = screen.getByLabelText("Tarkistajan nimi (ehdotus)");
    await waitFor(() => expect(input.matches(":disabled")).toBe(false));
    await user.type(input, "Mine");
    for (const error of [
      new Error("timeout"),
      { isAxiosError: true, response: { status: 403, data: {} } },
    ]) {
      api.put.mockRejectedValueOnce(error);
      await user.click(
        screen.getByRole("button", { name: "Tallenna luonnos" }),
      );
      await screen.findByRole("alert");
      await waitFor(() => expect(input.matches(":disabled")).toBe(false));
      expect((input as HTMLInputElement).value).toBe("Mine");
    }
    api.get.mockResolvedValue({ data: response(2, "Server") });
    await user.click(
      screen.getByRole("button", { name: "Tarkista uusin luonnos" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Käytä uusinta luonnosta" }),
    );
    expect((input as HTMLInputElement).value).toBe("Server");
  });
  it("guards rapid saves and does not discard edits on a failed refresh", async () => {
    const user = userEvent.setup();
    render(<TaxSettingsDraft />);
    const input = screen.getByLabelText("Tarkistajan nimi (ehdotus)");
    await waitFor(() => expect(input.matches(":disabled")).toBe(false));
    await user.type(input, "Mine");
    api.get.mockRejectedValueOnce(new Error("network"));
    await user.click(
      screen.getByRole("button", { name: "Tarkista uusin luonnos" }),
    );
    await screen.findByRole("alert");
    expect((input as HTMLInputElement).value).toBe("Mine");
    api.put.mockImplementation(() => new Promise(() => {}));
    const button = screen.getByRole("button", { name: "Tallenna luonnos" });
    fireEvent.submit(button.closest("form")!);
    fireEvent.submit(button.closest("form")!);
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(input.matches(":disabled")).toBe(true);
  });
  it("blocks missing restaurant and recovers after restaurant setup", async () => {
    api.get.mockResolvedValueOnce({
      data: { organizationConfigured: false, draft: null, version: 0 },
    });
    const user = userEvent.setup();
    render(<TaxSettingsDraft />);
    await screen.findByText(/Tallenna ensin ravintolan perustiedot yllä/);
    expect(
      screen
        .getByRole("button", { name: "Tallenna luonnos" })
        .matches(":disabled"),
    ).toBe(true);
    await user.click(
      screen.getByRole("button", { name: "Tarkista uusin luonnos" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Maa").matches(":disabled")).toBe(false),
    );
  });
});
