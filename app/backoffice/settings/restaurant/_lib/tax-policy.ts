import { parseTaxConfiguration, type TaxDraft } from "./tax-draft";
export type SellerSnapshot = {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  bankNo: string;
  taxCode: string;
};
export type TaxPolicyReview = {
  organizationConfigured: boolean;
  draftVersion: number;
  canCreateRevision: boolean;
  commercialReady: false;
  issues: { code: string; field: string }[];
  existingRevisionId: number | null;
  configuration: TaxDraft | null;
  sellerSnapshot: SellerSnapshot | null;
};
export type TaxPolicyRevision = {
  id: number;
  organizationId: number;
  sourceDraftVersion: number;
  schemaVersion: 1;
  configuration: TaxDraft;
  sellerSnapshot: SellerSnapshot;
  createdAt: string;
  createdByUserId: number;
  createdByName: string;
};
export type TaxPolicyPage = {
  results: TaxPolicyRevision[];
  totalCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
};
const fail = (): never => {
  throw new Error("Invalid tax policy response");
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  return value as Record<string, unknown>;
};
const integer = (value: unknown, min = 1): number => {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < min ||
    (value as number) > 2147483647
  )
    return fail();
  return value as number;
};
const seller = (value: unknown): SellerSnapshot => {
  const s = record(value);
  const keys = [
    "name",
    "address",
    "phone",
    "email",
    "website",
    "bankNo",
    "taxCode",
  ];
  if (
    Object.keys(s).length !== keys.length ||
    keys.some(
      (key) => typeof s[key] !== "string" || (s[key] as string).length > 500,
    ) ||
    ["name", "address", "phone", "taxCode"].some(
      (key) => !(s[key] as string).trim(),
    )
  )
    return fail();
  return s as SellerSnapshot;
};
export const parseSellerSnapshot = seller;
export function parseTaxPolicyReview(value: unknown): TaxPolicyReview {
  const r = record(value);
  if (
    typeof r.organizationConfigured !== "boolean" ||
    typeof r.canCreateRevision !== "boolean" ||
    r.commercialReady !== false ||
    !Array.isArray(r.issues) ||
    r.issues.length > 20
  )
    return fail();
  const issues = r.issues.map((value) => {
    const issue = record(value);
    if (
      typeof issue.code !== "string" ||
      typeof issue.field !== "string" ||
      issue.code.length > 80 ||
      issue.field.length > 80
    )
      return fail();
    return { code: issue.code, field: issue.field };
  });
  const result: TaxPolicyReview = {
    organizationConfigured: r.organizationConfigured,
    draftVersion: integer(r.draftVersion, 0),
    canCreateRevision: r.canCreateRevision,
    commercialReady: false,
    issues,
    existingRevisionId:
      r.existingRevisionId === null ? null : integer(r.existingRevisionId),
    configuration:
      r.configuration === null ? null : parseTaxConfiguration(r.configuration),
    sellerSnapshot: r.sellerSnapshot === null ? null : seller(r.sellerSnapshot),
  };
  if (
    result.canCreateRevision &&
    (!result.organizationConfigured ||
      !result.draftVersion ||
      !result.configuration ||
      !result.sellerSnapshot ||
      issues.length ||
      result.existingRevisionId)
  )
    return fail();
  return result;
}
export function parseTaxPolicyRevision(value: unknown): TaxPolicyRevision {
  const r = record(value);
  if (
    r.schemaVersion !== 1 ||
    typeof r.createdAt !== "string" ||
    !Number.isFinite(Date.parse(r.createdAt)) ||
    typeof r.createdByName !== "string" ||
    !r.createdByName.trim()
  )
    return fail();
  return {
    id: integer(r.id),
    organizationId: integer(r.organizationId),
    sourceDraftVersion: integer(r.sourceDraftVersion),
    schemaVersion: 1,
    configuration: parseTaxConfiguration(r.configuration),
    sellerSnapshot: seller(r.sellerSnapshot),
    createdAt: r.createdAt,
    createdByUserId: integer(r.createdByUserId),
    createdByName: r.createdByName,
  };
}
export function parseTaxPolicyPage(
  value: unknown,
  expectedPage: number,
): TaxPolicyPage {
  const r = record(value);
  const totalCount = integer(r.totalCount, 0),
    page = integer(r.page),
    pageSize = integer(r.pageSize),
    pageCount = integer(r.pageCount, 0);
  if (
    page !== expectedPage ||
    pageSize !== 10 ||
    pageCount !== Math.ceil(totalCount / pageSize) ||
    !Array.isArray(r.results) ||
    r.results.length > pageSize ||
    r.results.length > totalCount
  )
    return fail();
  return {
    results: r.results.map(parseTaxPolicyRevision),
    totalCount,
    page,
    pageSize,
    pageCount,
  };
}
export const policyFieldLabels: Record<string, string> = {
  seller: "Ravintolan perustiedot",
  draft: "Tallennettu luonnos",
  countryCode: "Maa",
  vatStatus: "ALV-rekisteröinti",
  requestedEffectiveDate: "Toivottu päivämäärä",
  reviewerName: "Tarkistajan nimi (ehdotus)",
  nonRegistrationReason: "Rekisteröimättömyyden peruste",
  "rates.FOOD_NON_ALCOHOLIC": "Ruoka ja alkoholittomat juomat (%)",
  "rates.ALCOHOL": "Alkoholi (%)",
  createdByName: "Käyttäjätilin nimi",
};
