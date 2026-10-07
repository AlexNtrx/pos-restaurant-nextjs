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
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

// Validates is finite non negative number before it is used.
const isFiniteNonNegativeNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0;

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
  breakdownFields.every(
    (field) => Number.isSafeInteger(value[field]) && Number(value[field]) >= 0,
  );

// EN: The expanded report must reconcile every day and period; missing breakdowns are errors, never invented zero refunds.
// FI: Laajennetun raportin jokaisen päivän ja jakson summien on täsmättävä; puuttuvat erittelyt ovat virheitä, eivät oletettuja nollapalautuksia.
export const isDailySalesBreakdownResponse = (
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
    !Number.isSafeInteger(value.totalAmount) ||
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
      !Number.isSafeInteger(row.amount) ||
      !isDailyBreakdown(row.breakdown) ||
      row.amount !== row.breakdown.grossAmount - row.breakdown.refundedAmount
    )
      return false;
    net += Number(row.amount);
    for (const field of breakdownFields) totals[field] += row.breakdown[field];
  }
  return (
    Number.isSafeInteger(net) &&
    net === value.totalAmount &&
    breakdownFields.every(
      (field) =>
        Number.isSafeInteger(totals[field]) && totals[field] === summary[field],
    ) &&
    value.totalAmount === summary.grossAmount - summary.refundedAmount
  );
};

// Validates is monthly sales response before it is used.
export const isMonthlySalesResponse = (
  value: unknown,
): value is MonthlySalesResponse => {
  if (
    !isRecord(value) ||
    !isFiniteNonNegativeNumber(value.totalAmount) ||
    !Array.isArray(value.results) ||
    value.results.length !== 12
  ) {
    return false;
  }

  return value.results.every(
    (item, index) =>
      isRecord(item) &&
      item.month === String(index + 1).padStart(2, "0") &&
      isFiniteNonNegativeNumber(item.amount),
  );
};
