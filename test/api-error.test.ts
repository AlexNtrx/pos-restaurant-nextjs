import { describe, expect, it } from "vitest";
import { AxiosError } from "axios";
import { getApiErrorMessage, getBlobApiErrorMessage } from "@/lib/api-error";
import { isMutationRejected } from "@/lib/mutation-outcome";

const errorFor = (status: number, data: unknown) =>
  Object.assign(new AxiosError("Request failed"), {
    response: { status, data },
  });
const fallback = "Toimintoa ei voitu suorittaa.";

describe("Finnish API error guidance", () => {
  it.each([
    { code: "RECEIPT_SETUP_REQUIRED" },
    {
      error:
        "Receipt setup is incomplete; ask an administrator to check restaurant settings before payment",
    },
  ])(
    "gives receipt setup recovery for draft/table and legacy payments",
    (data) => {
      const error = errorFor(409, data);
      expect(isMutationRejected(error)).toBe(true);
      expect(getApiErrorMessage(error, fallback)).toContain("ylläpitäjää");
      expect(getApiErrorMessage(error, fallback)).toContain(
        "Maksua ei tallennettu",
      );
    },
  );
  it("translates a stale price without changing mutation classification or the original error", () => {
    const error = errorFor(409, {
      code: "QUOTE_CHANGED",
      error: "Price changed",
    });
    const response = error.response;
    expect(getApiErrorMessage(error, fallback)).toContain("Hinta on muuttunut");
    expect(error.response).toBe(response);
    expect(error.message).toBe("Request failed");
    expect(isMutationRejected(error)).toBe(true);
  });
  it.each(["IDEMPOTENCY_CONFLICT", "TABLE_SESSION_INACTIVE"])(
    "keeps %s recovery uncertain and discourages a new attempt",
    (code) => {
      const error = errorFor(409, { code });
      expect(isMutationRejected(error)).toBe(false);
      expect(getApiErrorMessage(error, fallback)).toMatch(/aiem|Aiem/);
    },
  );
  it("uses connection guidance without asserting a failed or successful payment", () => {
    const error = new AxiosError("timeout of 10000ms exceeded", "ECONNABORTED");
    const message = getApiErrorMessage(
      error,
      "Tarkista aiempi maksu samalla yrityksellä.",
    );
    expect(message).toContain("Tarkista aiempi maksu samalla yrityksellä");
    expect(message).toContain("Tarkista verkkoyhteys");
    expect(message).not.toContain("10000ms");
    expect(isMutationRejected(error)).toBe(false);
  });
  it.each([401, 403, 429, 500])(
    "gives Finnish recovery guidance for HTTP %i without leaking raw errors",
    (status) => {
      const message = getApiErrorMessage(
        errorFor(status, { error: "Private diagnostic text" }),
        fallback,
      );
      expect(message).not.toContain("Private diagnostic");
      expect(message).not.toBe(fallback);
    },
  );
  it.each(["unknown code", "toString", "__proto__"])(
    "falls back safely for %s",
    (code) => {
      expect(
        getApiErrorMessage(
          errorFor(418, { code, error: "<html>raw error</html>" }),
          fallback,
        ),
      ).toBe(fallback);
      expect(
        getApiErrorMessage(new Error("Invalid QR context"), fallback),
      ).toBe(fallback);
    },
  );
  it("decodes bounded PDF errors and preserves actionable restaurant setup guidance", async () => {
    const error = errorFor(
      500,
      new Blob([JSON.stringify({ error: "Organization is not configured" })]),
    );
    const message = await getBlobApiErrorMessage(error, fallback);
    expect(message).toContain("Asetukset → Ravintolan tiedot");
    error.message = message;
    expect(getApiErrorMessage(error, fallback)).toBe(message);
    for (const body of ["<html>private</html>", "x".repeat(65537)])
      expect(
        await getBlobApiErrorMessage(errorFor(500, new Blob([body])), fallback),
      ).toBe(fallback);
  });
});
