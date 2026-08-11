export type DailySalesRow = { date: string; amount: number };
export type MonthlySalesRow = { month: string; amount: number };
export type DailySalesResponse = {
  results: DailySalesRow[];
  totalAmount: number;
};
export type MonthlySalesResponse = {
  results: MonthlySalesRow[];
  totalAmount: number;
};

type DailySalesValidationOptions = {
  requireNonNegativeTotal?: boolean;
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

// Validates is date only before it is used.
export const isDateOnly = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

// Validates is daily sales response before it is used.
export const isDailySalesResponse = (
  value: unknown,
  { requireNonNegativeTotal = false }: DailySalesValidationOptions = {},
): value is DailySalesResponse => {
  if (!isRecord(value) || !Array.isArray(value.results)) return false;

  const validTotal = requireNonNegativeTotal
    ? isFiniteNonNegativeNumber(value.totalAmount)
    : isFiniteNumber(value.totalAmount);

  return (
    validTotal &&
    value.results.every(
      (item) =>
        isRecord(item) &&
        isDateOnly(item.date) &&
        isFiniteNonNegativeNumber(item.amount),
    )
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
