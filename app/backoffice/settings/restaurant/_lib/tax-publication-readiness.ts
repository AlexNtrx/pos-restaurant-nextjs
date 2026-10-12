import { parseTaxConfiguration, type TaxDraft } from "./tax-draft";
import { parseSellerSnapshot, type SellerSnapshot } from "./tax-policy";
export const readinessChecks = {
  CANDIDATE_COMPLETE: ["Version tiedot", "DATA"],
  CANDIDATE_FIELD_REQUIRED: ["Täydennä version kenttä", "DATA"],
  CANDIDATE_RATE_MUST_BE_EMPTY: [
    "Tyhjennä prosentti, jos ei ALV-rekisterissä",
    "DATA",
  ],
  CURRENT_DRAFT_MATCH: ["Versio vastaa tallennettua luonnosta", "DATA"],
  SELLER_COMPLETE: ["Ravintolan perustiedot", "DATA"],
  SELLER_MATCH: ["Version myyjätiedot vastaavat nykyisiä tietoja", "DATA"],
  ACTIVE_MENU: ["Ruokalistalla on aktiivisia tuotteita", "DATA"],
  TAX_CATEGORY_ASSIGNMENT: ["Tarvittavat ALV-luokat on valittu", "DATA"],
  TAX_CATEGORY_SUPPORTED: ["ALV-luokat ovat tuettuja", "DATA"],
  UNPAID_ORDERS: ["Maksamattomat avoimet tilaukset", "OPERATIONAL"],
  PAID_OPEN_ORDERS: [
    "Maksetut tilaukset, joiden palvelu on kesken",
    "OPERATIONAL",
  ],
  LEGACY_CART_LINES: ["Tallennetut ostoskoririvit", "OPERATIONAL"],
  OPEN_TABLE_SESSIONS: ["Avoimet pöytäistunnot", "OPERATIONAL"],
  PENDING_REFUNDS: ["Keskeneräiset palautukset", "OPERATIONAL"],
  FAILED_REFUNDS: [
    "Epäonnistuneet palautukset, jotka on selvitettävä",
    "OPERATIONAL",
  ],
  MERCHANT_POLICY_UNCONFIRMED: [
    "Ravintolan verotietojen vahvistus",
    "EXTERNAL",
  ],
  TAX_EVENT_UNCONFIRMED: [
    "Verotuksen tapahtuman ja ajankohdan vahvistus",
    "EXTERNAL",
  ],
  PAYMENT_EVIDENCE_UNCONFIRMED: [
    "Ulkopuolisten maksujen vastaanottamisen vahvistus",
    "EXTERNAL",
  ],
  BROWSER_PENDING_OUTCOMES_UNVERIFIED: [
    "Kaikkien laitteiden keskeneräisten pyyntöjen selvitys",
    "EXTERNAL",
  ],
  PUBLICATION_RUNTIME_NOT_IMPLEMENTED: [
    "Julkaisu ja käyttöönotto eivät ole vielä käytettävissä",
    "RUNTIME",
  ],
} as const;
export type ReadinessCheck = {
  code: keyof typeof readinessChecks;
  scope: "DATA" | "OPERATIONAL" | "EXTERNAL" | "RUNTIME";
  state: "PASS" | "BLOCKED" | "UNVERIFIED";
  field?: string;
};
export type TaxPublicationReadiness = {
  revision: {
    id: number;
    sourceDraftVersion: number;
    configuration: TaxDraft;
    sellerSnapshot: SellerSnapshot;
    createdAt: string;
    createdByName: string;
  };
  currentDraftVersion: number;
  candidateMatchesCurrentDraft: boolean;
  sellerMatchesCurrent: boolean;
  observedAt: string;
  catalog: {
    activeItems: number;
    unclassifiedItems: number;
    unsupportedItems: number;
  };
  outstanding: {
    unpaidOrders: number;
    paidOpenOrders: number;
    legacyCartLines: number;
    openTableSessions: number;
    pendingRefunds: number;
    failedRefunds: number;
  };
  checks: ReadinessCheck[];
  technicalChecksPassed: boolean;
  canPublish: false;
  canActivate: false;
  commercialReady: false;
};
const fail = (): never => {
  throw new Error("Invalid publication readiness response");
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  return value as Record<string, unknown>;
};
const integer = (value: unknown, min = 0): number => {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < min ||
    (value as number) > 2147483647
  )
    return fail();
  return value as number;
};
const timestamp = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    return fail();
  return value;
};
const counts = <K extends string>(
  value: unknown,
  keys: readonly K[],
): Record<K, number> => {
  const result = record(value);
  if (
    Object.keys(result).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(result, key))
  )
    return fail();
  return Object.fromEntries(
    keys.map((key) => [key, integer(result[key])]),
  ) as Record<K, number>;
};
export function parseTaxPublicationReadiness(
  value: unknown,
  expectedRevisionId: number,
): TaxPublicationReadiness {
  const r = record(value),
    revision = record(r.revision);
  if (
    r.canPublish !== false ||
    r.canActivate !== false ||
    r.commercialReady !== false ||
    typeof r.technicalChecksPassed !== "boolean" ||
    typeof r.candidateMatchesCurrentDraft !== "boolean" ||
    typeof r.sellerMatchesCurrent !== "boolean" ||
    !Array.isArray(r.checks) ||
    r.checks.length > 32 ||
    typeof revision.createdByName !== "string" ||
    !revision.createdByName.trim()
  )
    return fail();
  const catalog = counts(r.catalog, [
    "activeItems",
    "unclassifiedItems",
    "unsupportedItems",
  ] as const);
  const outstanding = counts(r.outstanding, [
    "unpaidOrders",
    "paidOpenOrders",
    "legacyCartLines",
    "openTableSessions",
    "pendingRefunds",
    "failedRefunds",
  ] as const);
  if (
    catalog.unclassifiedItems + catalog.unsupportedItems >
    catalog.activeItems
  )
    return fail();
  const checks = r.checks.map((value) => {
    const check = record(value),
      definition = readinessChecks[check.code as keyof typeof readinessChecks];
    if (
      typeof check.code !== "string" ||
      !Object.hasOwn(readinessChecks, check.code) ||
      !definition ||
      definition[1] !== check.scope ||
      !["PASS", "BLOCKED", "UNVERIFIED"].includes(String(check.state)) ||
      (check.field !== undefined &&
        (typeof check.field !== "string" || check.field.length > 80))
    )
      return fail();
    if (
      check.scope === "EXTERNAL"
        ? check.state !== "UNVERIFIED"
        : check.scope === "RUNTIME"
          ? check.state !== "BLOCKED"
          : check.state === "UNVERIFIED"
    )
      return fail();
    return check as ReadinessCheck;
  });
  const seen = new Set<string>();
  for (const check of checks) {
    const key = `${check.code}:${check.field ?? ""}`;
    if (seen.has(key)) return fail();
    seen.add(key);
  }
  for (const code of Object.keys(readinessChecks))
    if (
      !code.startsWith("CANDIDATE_FIELD") &&
      code !== "CANDIDATE_RATE_MUST_BE_EMPTY" &&
      !checks.some((check) => check.code === code)
    )
      return fail();
  const result: TaxPublicationReadiness = {
    revision: {
      id: integer(revision.id, 1),
      sourceDraftVersion: integer(revision.sourceDraftVersion, 1),
      configuration: parseTaxConfiguration(revision.configuration),
      sellerSnapshot: parseSellerSnapshot(revision.sellerSnapshot),
      createdAt: timestamp(revision.createdAt),
      createdByName: revision.createdByName,
    },
    currentDraftVersion: integer(r.currentDraftVersion),
    candidateMatchesCurrentDraft: r.candidateMatchesCurrentDraft,
    sellerMatchesCurrent: r.sellerMatchesCurrent,
    observedAt: timestamp(r.observedAt),
    catalog,
    outstanding,
    checks,
    technicalChecksPassed: r.technicalChecksPassed,
    canPublish: false,
    canActivate: false,
    commercialReady: false,
  };
  if (
    result.revision.id !== expectedRevisionId ||
    (result.candidateMatchesCurrentDraft &&
      result.currentDraftVersion !== result.revision.sourceDraftVersion) ||
    result.technicalChecksPassed !==
      checks
        .filter((check) => ["DATA", "OPERATIONAL"].includes(check.scope))
        .every((check) => check.state === "PASS")
  )
    return fail();
  const expected = {
    CURRENT_DRAFT_MATCH: result.candidateMatchesCurrentDraft,
    SELLER_MATCH: result.sellerMatchesCurrent,
    ACTIVE_MENU: catalog.activeItems > 0,
    TAX_CATEGORY_ASSIGNMENT:
      result.revision.configuration.vatStatus === "NOT_REGISTERED" ||
      catalog.unclassifiedItems === 0,
    TAX_CATEGORY_SUPPORTED: catalog.unsupportedItems === 0,
    UNPAID_ORDERS: outstanding.unpaidOrders === 0,
    PAID_OPEN_ORDERS: outstanding.paidOpenOrders === 0,
    LEGACY_CART_LINES: outstanding.legacyCartLines === 0,
    OPEN_TABLE_SESSIONS: outstanding.openTableSessions === 0,
    PENDING_REFUNDS: outstanding.pendingRefunds === 0,
    FAILED_REFUNDS: outstanding.failedRefunds === 0,
  };
  for (const [code, passed] of Object.entries(expected))
    if (
      checks.find((check) => check.code === code)?.state !==
      (passed ? "PASS" : "BLOCKED")
    )
      return fail();
  return result;
}
