import { isEuroAmount, moneySum, moneyDifference } from "./money.ts";
export type DailySalesRow = { date: string; amount: number };
export type MonthlySalesRow = { month: string; amount: number };
export type DailySalesBreakdown = {
  grossAmount: number;
  refundedAmount: number;
  pendingRefundAmount: number;
  failedRefundAmount: number;
  unpaidCancelledCount: number;
  unpaidCancelledAmount: number;
  paidCancelledCount: number;
  paidCancelledAmount: number;
};
export type DailySalesBreakdownRow = DailySalesRow & {
  breakdown: DailySalesBreakdown;
};
export type DailySalesBreakdownResponse = {
  results: DailySalesBreakdownRow[];
  totalAmount: number;
  summary: DailySalesBreakdown;
};
export type MonthlySalesResponse = {
  results: MonthlySalesRow[];
  totalAmount: number;
};

// Validates is record before it is used.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

// Validates is finite number before it is used.
const breakdownFields = [
  "grossAmount",
  "refundedAmount",
  "pendingRefundAmount",
  "failedRefundAmount",
  "unpaidCancelledCount",
  "unpaidCancelledAmount",
  "paidCancelledCount",
  "paidCancelledAmount",
] as const;

const isDailyBreakdown = (value: unknown): value is DailySalesBreakdown =>
  isRecord(value) &&
  breakdownFields.every((field) =>
    field.endsWith("Count")
      ? Number.isSafeInteger(value[field]) && Number(value[field]) >= 0
      : isEuroAmount(value[field]),
  );

// EN: The expanded report must reconcile every day and period; missing breakdowns are errors, never invented zero refunds.
// FI: Laajennetun raportin jokaisen päivän ja jakson summien on täsmättävä; puuttuvat erittelyt ovat virheitä, eivät oletettuja nollapalautuksia.
const validateDailySalesBreakdown = (
  value: unknown,
  year: number,
  month: number,
): value is DailySalesBreakdownResponse => {
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !isRecord(value) ||
    !Array.isArray(value.results) ||
    !isEuroAmount(value.totalAmount, true) ||
    !isDailyBreakdown(value.summary)
  )
    return false;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const summary = value.summary;
  if (value.results.length !== days) return false;
  let net = 0;
  const totals = Object.fromEntries(
    breakdownFields.map((field) => [field, 0]),
  ) as DailySalesBreakdown;
  for (const [index, row] of value.results.entries()) {
    const date = new Date(Date.UTC(year, month - 1, index + 1))
      .toISOString()
      .slice(0, 10);
    if (
      !isRecord(row) ||
      row.date !== date ||
      !isEuroAmount(row.amount, true) ||
      !isDailyBreakdown(row.breakdown) ||
      row.amount !==
        moneyDifference(row.breakdown.grossAmount, row.breakdown.refundedAmount)
    )
      return false;
    net = moneySum([net, row.amount]);
    for (const field of breakdownFields)
      totals[field] = field.endsWith("Count")
        ? totals[field] + row.breakdown[field]
        : moneySum([totals[field], row.breakdown[field]]);
  }
  return (
    isEuroAmount(net, true) &&
    net === value.totalAmount &&
    breakdownFields.every(
      (field) =>
        (field.endsWith("Count")
          ? Number.isSafeInteger(totals[field])
          : isEuroAmount(totals[field])) && totals[field] === summary[field],
    ) &&
    value.totalAmount ===
      moneyDifference(summary.grossAmount, summary.refundedAmount)
  );
};

export const isDailySalesBreakdownResponse = (
  value: unknown,
  year: number,
  month: number,
): value is DailySalesBreakdownResponse => {
  try {
    return validateDailySalesBreakdown(value, year, month);
  } catch {
    return false;
  }
};

// Validates is monthly sales response before it is used.
export const isMonthlySalesResponse = (
  value: unknown,
): value is MonthlySalesResponse => {
  if (
    !isRecord(value) ||
    !isEuroAmount(value.totalAmount, true) ||
    !Array.isArray(value.results) ||
    value.results.length !== 12
  ) {
    return false;
  }

  const valid = value.results.every(
    (item, index) =>
      isRecord(item) &&
      item.month === String(index + 1).padStart(2, "0") &&
      isEuroAmount(item.amount, true),
  );
  if (!valid) return false;
  try {
    return (
      moneySum(value.results.map((row) => row.amount as number)) ===
      value.totalAmount
    );
  } catch {
    return false;
  }
};
