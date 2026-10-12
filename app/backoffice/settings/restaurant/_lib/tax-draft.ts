export type TaxDraft = {
  countryCode: "FI" | null;
  vatStatus: "UNCONFIRMED" | "REGISTERED" | "NOT_REGISTERED";
  pricingMode: "FINAL_PRICE";
  rates: { FOOD_NON_ALCOHOLIC: number | null; ALCOHOL: number | null };
  requestedEffectiveDate: string | null;
  reviewerName: string | null;
  nonRegistrationReason: string | null;
};
export type SavedTaxDraft = TaxDraft & {
  schemaVersion: 1;
  savedByUserId: number;
  savedAt: string;
};
export type TaxDraftResponse = {
  organizationConfigured: boolean;
  version: number;
  draft: SavedTaxDraft | null;
};
export type TaxDraftForm = {
  countryCode: "" | "FI";
  vatStatus: TaxDraft["vatStatus"];
  foodRate: string;
  alcoholRate: string;
  requestedEffectiveDate: string;
  reviewerName: string;
  nonRegistrationReason: string;
};
export const emptyTaxForm: TaxDraftForm = {
  countryCode: "",
  vatStatus: "UNCONFIRMED",
  foodRate: "",
  alcoholRate: "",
  requestedEffectiveDate: "",
  reviewerName: "",
  nonRegistrationReason: "",
};
export const toTaxForm = (draft: TaxDraft | null): TaxDraftForm =>
  draft
    ? {
        countryCode: draft.countryCode ?? "",
        vatStatus: draft.vatStatus,
        foodRate:
          draft.rates.FOOD_NON_ALCOHOLIC === null
            ? ""
            : String(draft.rates.FOOD_NON_ALCOHOLIC / 100),
        alcoholRate:
          draft.rates.ALCOHOL === null ? "" : String(draft.rates.ALCOHOL / 100),
        requestedEffectiveDate: draft.requestedEffectiveDate ?? "",
        reviewerName: draft.reviewerName ?? "",
        nonRegistrationReason: draft.nonRegistrationReason ?? "",
      }
    : { ...emptyTaxForm };
export function parseRate(value: string): number | null {
  if (!value.trim()) return null;
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized))
    throw new Error(
      "Anna prosentti enintään kahdella desimaalilla (yli 0, enintään 100). ",
    );
  // EN: Convert the decimal string to basis points without floating-point multiplication.
  // FI: Muunna desimaalimerkkijono korkopisteiksi ilman liukulukukertolaskua.
  const [whole, fraction = ""] = normalized.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (bps <= 0 || bps > 10000)
    throw new Error("Anna prosentti yli 0 ja enintään 100.");
  return bps;
}
export class TaxDraftInputError extends Error {
  constructor(
    public field: "foodRate" | "alcoholRate" | "requestedEffectiveDate",
    message: string,
  ) {
    super(message);
  }
}
export function fromTaxForm(form: TaxDraftForm): TaxDraft {
  const date = form.requestedEffectiveDate || null;
  if (
    date &&
    (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T00:00:00.000Z`)) ||
      new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date)
  )
    throw new TaxDraftInputError(
      "requestedEffectiveDate",
      "Tarkista toivottu päivämäärä.",
    );
  const rate = (field: "foodRate" | "alcoholRate") => {
    try {
      return parseRate(form[field]);
    } catch (error) {
      throw new TaxDraftInputError(
        field,
        error instanceof Error ? error.message : "Tarkista prosentti.",
      );
    }
  };
  return {
    countryCode: form.countryCode || null,
    vatStatus: form.vatStatus,
    pricingMode: "FINAL_PRICE",
    rates: {
      FOOD_NON_ALCOHOLIC: rate("foodRate"),
      ALCOHOL: rate("alcoholRate"),
    },
    requestedEffectiveDate: date,
    reviewerName: form.reviewerName.trim() || null,
    nonRegistrationReason: form.nonRegistrationReason.trim() || null,
  };
}
export function parseTaxResponse(value: unknown): TaxDraftResponse {
  const fail = () => {
    throw new Error("Invalid tax draft response");
  };
  if (!value || typeof value !== "object") return fail();
  const result = value as TaxDraftResponse;
  if (
    typeof result.organizationConfigured !== "boolean" ||
    !Number.isSafeInteger(result.version) ||
    result.version < 0 ||
    (!result.organizationConfigured &&
      (result.version !== 0 || result.draft !== null))
  )
    return fail();
  const d = result.draft;
  if (d === null) {
    if (result.version !== 0) return fail();
    return result;
  }
  if (
    !d ||
    typeof d !== "object" ||
    d.schemaVersion !== 1 ||
    !Number.isSafeInteger(d.savedByUserId) ||
    d.savedByUserId <= 0 ||
    typeof d.savedAt !== "string" ||
    !Number.isFinite(Date.parse(d.savedAt)) ||
    result.version < 1
  )
    return fail();
  parseTaxConfiguration(d);
  return result;
}
export function parseTaxConfiguration(value: unknown): TaxDraft {
  const fail = (): never => {
    throw new Error("Invalid tax configuration");
  };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  const d = value as TaxDraft;
  if (
    (d.countryCode !== null && d.countryCode !== "FI") ||
    !["UNCONFIRMED", "REGISTERED", "NOT_REGISTERED"].includes(d.vatStatus) ||
    d.pricingMode !== "FINAL_PRICE" ||
    !d.rates ||
    typeof d.rates !== "object" ||
    Array.isArray(d.rates)
  )
    return fail();
  for (const rate of [d.rates.FOOD_NON_ALCOHOLIC, d.rates.ALCOHOL])
    if (
      rate !== null &&
      (!Number.isSafeInteger(rate) || rate <= 0 || rate > 10000)
    )
      return fail();
  for (const [text, max] of [
    [d.reviewerName, 120],
    [d.nonRegistrationReason, 500],
  ] as const)
    if (text !== null && (typeof text !== "string" || text.length > max))
      return fail();
  if (
    d.requestedEffectiveDate !== null &&
    typeof d.requestedEffectiveDate !== "string"
  )
    return fail();
  fromTaxForm(toTaxForm(d));
  return {
    countryCode: d.countryCode,
    vatStatus: d.vatStatus,
    pricingMode: d.pricingMode,
    rates: {
      FOOD_NON_ALCOHOLIC: d.rates.FOOD_NON_ALCOHOLIC,
      ALCOHOL: d.rates.ALCOHOL,
    },
    requestedEffectiveDate: d.requestedEffectiveDate,
    reviewerName: d.reviewerName,
    nonRegistrationReason: d.nonRegistrationReason,
  };
}
export function missingTaxFields(form: TaxDraftForm): string[] {
  return [
    !form.countryCode && "maa",
    form.vatStatus === "UNCONFIRMED" && "ALV-rekisteröinti",
    form.vatStatus === "REGISTERED" && !form.foodRate.trim() && "ruoan ALV",
    form.vatStatus === "REGISTERED" &&
      !form.alcoholRate.trim() &&
      "alkoholin ALV",
    !form.requestedEffectiveDate && "toivottu päivämäärä",
    !form.reviewerName.trim() && "tarkistaja",
    form.vatStatus === "NOT_REGISTERED" &&
      !form.nonRegistrationReason.trim() &&
      "rekisteröimättömyyden peruste",
  ].filter((field): field is string => Boolean(field));
}
