import { parseTaxConfiguration, type TaxDraft } from "./tax-draft";
import { parseSellerSnapshot, type SellerSnapshot } from "./tax-policy";
export const attestationLabels = {
  merchantIdentityConfirmed: "Myyjätiedot on tarkistettu",
  taxTreatmentConfirmed: "ALV-rekisteröinti ja verokannat on tarkistettu",
  categoryMappingConfirmed: "Tuotteiden ALV-luokat on tarkistettu",
  roundingConfirmed: "Pyöristysmenettely on tarkistettu",
} as const;
export type Attestation = keyof typeof attestationLabels;
export type ReviewEvidence = {
  schemaVersion: 1;
  reviewedByName: string;
  reviewedOn: string;
  evidenceReference: string;
  attestations: Record<Attestation, true>;
};
export type EvidenceForm = Omit<
  ReviewEvidence,
  "schemaVersion" | "attestations"
> & { attestations: Record<Attestation, boolean> };
export const emptyEvidence = (): EvidenceForm => ({
  reviewedByName: "",
  reviewedOn: "",
  evidenceReference: "",
  attestations: {
    merchantIdentityConfirmed: false,
    taxTreatmentConfirmed: false,
    categoryMappingConfirmed: false,
    roundingConfirmed: false,
  },
});
export type ApprovalSource = {
  id: number;
  sourceDraftVersion: number;
  configuration: TaxDraft;
  sellerSnapshot: SellerSnapshot;
};
export type ApprovalRequest = {
  sourceRevisionId: number;
  expectedDraftVersion: number;
  idempotencyKey: string;
  reviewEvidence: ReviewEvidence;
};
export type TaxApproval = {
  id: number;
  organizationId: number;
  sourceRevisionId: number;
  sourceDraftVersion: number;
  schemaVersion: 1;
  configuration: TaxDraft;
  sellerSnapshot: SellerSnapshot;
  reviewEvidence: ReviewEvidence;
  recordedAt: string;
  recordedByUserId: number;
  recordedByName: string;
};
export type TaxApprovalPage = {
  results: TaxApproval[];
  totalCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
  canActivate: false;
  commercialReady: false;
};
export type SavedApprovalRequest = {
  schemaVersion: 1;
  source: ApprovalSource;
  payload: ApprovalRequest;
};
export class ApprovalInputError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}
const fail = (): never => {
  throw new Error("Invalid tax approval response");
};
const record = (value: unknown): Record<string, unknown> =>
  !value || typeof value !== "object" || Array.isArray(value)
    ? fail()
    : (value as Record<string, unknown>);
const exact = (value: unknown, keys: string[]) => {
  const r = record(value);
  if (
    Object.keys(r).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(r, key))
  )
    fail();
  return r;
};
const integer = (value: unknown, min = 1): number => {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < min ||
    (value as number) > 2147483647
  )
    fail();
  return value as number;
};
const date = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  )
    fail();
  return value as string;
};
const text = (value: unknown, max: number): string => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    value !== value.trim()
  )
    fail();
  return value as string;
};
export function parseReviewEvidence(value: unknown): ReviewEvidence {
  const r = exact(value, [
    "schemaVersion",
    "reviewedByName",
    "reviewedOn",
    "evidenceReference",
    "attestations",
  ]);
  const a = exact(r.attestations, Object.keys(attestationLabels));
  if (r.schemaVersion !== 1 || Object.keys(a).some((key) => a[key] !== true))
    fail();
  return {
    schemaVersion: 1,
    reviewedByName: text(r.reviewedByName, 150),
    reviewedOn: date(r.reviewedOn),
    evidenceReference: text(r.evidenceReference, 500),
    attestations: a as Record<Attestation, true>,
  };
}
export function evidenceFromForm(form: EvidenceForm): ReviewEvidence {
  for (const [field, max] of [
    ["reviewedByName", 150],
    ["evidenceReference", 500],
  ] as const)
    if (!form[field].trim() || form[field].length > max)
      throw new ApprovalInputError(
        field,
        field === "reviewedByName"
          ? "Anna todellisen tarkistajan nimi (enintään 150 merkkiä)."
          : "Anna tarkistuksen tositeviite (enintään 500 merkkiä).",
      );
  try {
    date(form.reviewedOn);
  } catch {
    throw new ApprovalInputError(
      "reviewedOn",
      "Anna kelvollinen tarkistuspäivä.",
    );
  }
  for (const key of Object.keys(attestationLabels) as Attestation[])
    if (!form.attestations[key])
      throw new ApprovalInputError(
        key,
        "Vahvista jokainen tarkistettu asia ennen tallentamista.",
      );
  return parseReviewEvidence({
    schemaVersion: 1,
    ...form,
    reviewedByName: form.reviewedByName.trim(),
    evidenceReference: form.evidenceReference.trim(),
  });
}
function configuration(value: unknown) {
  const d = parseTaxConfiguration(value);
  if (
    d.countryCode !== "FI" ||
    d.vatStatus === "UNCONFIRMED" ||
    !d.requestedEffectiveDate ||
    !d.reviewerName ||
    (d.vatStatus === "REGISTERED"
      ? Object.values(d.rates).some((rate) => rate === null)
      : !d.nonRegistrationReason ||
        Object.values(d.rates).some((rate) => rate !== null))
  )
    fail();
  return d;
}
export function parseApprovalSource(value: unknown): ApprovalSource {
  const r = record(value);
  return {
    id: integer(r.id),
    sourceDraftVersion: integer(r.sourceDraftVersion),
    configuration: configuration(r.configuration),
    sellerSnapshot: parseSellerSnapshot(r.sellerSnapshot),
  };
}
export function parseApproval(value: unknown): TaxApproval {
  const r = exact(value, [
    "id",
    "organizationId",
    "sourceRevisionId",
    "sourceDraftVersion",
    "schemaVersion",
    "configuration",
    "sellerSnapshot",
    "reviewEvidence",
    "recordedAt",
    "recordedByUserId",
    "recordedByName",
  ]);
  if (
    r.schemaVersion !== 1 ||
    typeof r.recordedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.recordedAt) ||
    !Number.isFinite(Date.parse(r.recordedAt)) ||
    new Date(r.recordedAt).toISOString() !== r.recordedAt
  )
    fail();
  return {
    id: integer(r.id),
    organizationId: integer(r.organizationId),
    sourceRevisionId: integer(r.sourceRevisionId),
    sourceDraftVersion: integer(r.sourceDraftVersion),
    schemaVersion: 1,
    configuration: configuration(r.configuration),
    sellerSnapshot: parseSellerSnapshot(r.sellerSnapshot),
    reviewEvidence: parseReviewEvidence(r.reviewEvidence),
    recordedAt: r.recordedAt as string,
    recordedByUserId: integer(r.recordedByUserId),
    recordedByName: text(r.recordedByName, 500),
  };
}
export function parseApprovalPage(value: unknown): TaxApprovalPage {
  const r = exact(value, [
    "results",
    "totalCount",
    "page",
    "pageSize",
    "pageCount",
    "canActivate",
    "commercialReady",
  ]);
  if (
    r.canActivate !== false ||
    r.commercialReady !== false ||
    !Array.isArray(r.results)
  )
    fail();
  const page = integer(r.page),
    pageSize = integer(r.pageSize),
    totalCount = integer(r.totalCount, 0),
    pageCount = integer(r.pageCount, 0);
  const results = (r.results as unknown[]).map(parseApproval);
  if (
    pageSize > 50 ||
    (page - 1) * pageSize > 2147483647 ||
    pageCount !== Math.ceil(totalCount / pageSize) ||
    results.length !==
      Math.min(pageSize, Math.max(0, totalCount - (page - 1) * pageSize)) ||
    results.some((row, i) => i > 0 && row.id >= results[i - 1].id)
  )
    fail();
  return {
    results,
    page,
    pageSize,
    totalCount,
    pageCount,
    canActivate: false,
    commercialReady: false,
  };
}
export function parseSavedApproval(
  value: unknown,
): SavedApprovalRequest | null {
  try {
    const r = exact(value, ["schemaVersion", "source", "payload"]),
      p = exact(r.payload, [
        "sourceRevisionId",
        "expectedDraftVersion",
        "idempotencyKey",
        "reviewEvidence",
      ]);
    const source = parseApprovalSource(r.source);
    if (
      r.schemaVersion !== 1 ||
      typeof p.idempotencyKey !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        p.idempotencyKey,
      ) ||
      integer(p.sourceRevisionId) !== source.id ||
      integer(p.expectedDraftVersion) !== source.sourceDraftVersion
    )
      fail();
    return {
      schemaVersion: 1,
      source,
      payload: {
        sourceRevisionId: source.id,
        expectedDraftVersion: source.sourceDraftVersion,
        idempotencyKey: p.idempotencyKey as string,
        reviewEvidence: parseReviewEvidence(p.reviewEvidence),
      },
    };
  } catch {
    return null;
  }
}
export function parseCreatedApproval(value: unknown, request: ApprovalRequest) {
  const r = exact(value, [
    "created",
    "approval",
    "canActivate",
    "commercialReady",
  ]);
  if (
    typeof r.created !== "boolean" ||
    r.canActivate !== false ||
    r.commercialReady !== false
  )
    fail();
  const approval = parseApproval(r.approval);
  if (
    approval.sourceRevisionId !== request.sourceRevisionId ||
    approval.sourceDraftVersion !== request.expectedDraftVersion ||
    JSON.stringify(approval.reviewEvidence) !==
      JSON.stringify(request.reviewEvidence)
  )
    fail();
  return approval;
}
