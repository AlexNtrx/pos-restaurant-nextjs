import type useCounterDraft from "../_hooks/use-counter-draft";
import type { DraftScope } from "../_hooks/use-counter-draft";
import { readAuthSession } from "@/lib/auth-session";
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export type OrderLocation =
  | { tableNo: number; serviceType?: never }
  | { serviceType: "TAKEAWAY"; tableNo?: never };
export type CheckoutAttempt = OrderLocation & {
  payType: "cash" | "bank";
  inputMoney?: number;
  idempotencyKey: string;
  items?: ReturnType<ReturnType<typeof useCounterDraft>["getIntent"]>["items"];
  expectedTotal?: number;
};
export type KitchenAttempt = OrderLocation & {
  idempotencyKey: string;
  items?: ReturnType<ReturnType<typeof useCounterDraft>["getIntent"]>["items"];
  expectedTotal?: number;
};
export type DraftPendingAttempt =
  | {
      kind: "checkout" | "legacy";
      payload: CheckoutAttempt;
      quotedTotal?: number;
    }
  | { kind: "kitchen"; payload: KitchenAttempt };

export const draftAttemptKey = (scope: DraftScope) => {
  if (typeof window === "undefined") return null;
  const userId = readAuthSession()?.userId;
  return userId
    ? `counter-draft:v1:${userId}:${scope === "TAKEAWAY" ? "takeaway" : scope}:attempt`
    : null;
};
export const readDraftAttempt = (
  scope: DraftScope,
): DraftPendingAttempt | null => {
  const key = draftAttemptKey(scope);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      !["checkout", "legacy", "kitchen"].includes(String(parsed.kind)) ||
      !isRecord(parsed.payload) ||
      (scope === "TAKEAWAY"
        ? parsed.payload.serviceType !== "TAKEAWAY" ||
          parsed.payload.tableNo != null
        : parsed.payload.tableNo !== scope ||
          parsed.payload.serviceType === "TAKEAWAY") ||
      typeof parsed.payload.idempotencyKey !== "string" ||
      !parsed.payload.idempotencyKey ||
      (parsed.kind !== "kitchen" &&
        (!["cash", "bank"].includes(String(parsed.payload.payType)) ||
          (parsed.payload.inputMoney !== undefined &&
            (!Number.isSafeInteger(parsed.payload.inputMoney) ||
              Number(parsed.payload.inputMoney) < 0)))) ||
      (parsed.kind !== "legacy" && !Array.isArray(parsed.payload.items)) ||
      (parsed.kind === "legacy" &&
        (scope === "TAKEAWAY" || !Number.isSafeInteger(parsed.quotedTotal)))
    )
      return null;
    return parsed as DraftPendingAttempt;
  } catch {
    return null;
  }
};

export const pendingDraftScopes = (): DraftScope[] => {
  const userId = readAuthSession()?.userId;
  if (!userId) return [];
  const prefix = `counter-draft:v1:${userId}:`;
  return Array.from({ length: localStorage.length }, (_, index) =>
    localStorage.key(index),
  ).flatMap<DraftScope>((key) => {
    if (!key?.startsWith(prefix) || !key.endsWith(":attempt")) return [];
    const scope = key.slice(prefix.length, -":attempt".length);
    return scope === "takeaway"
      ? ["TAKEAWAY" as const]
      : /^[1-9]\d*$/.test(scope)
        ? [Number(scope)]
        : [];
  });
};
