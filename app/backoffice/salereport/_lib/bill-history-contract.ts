export type BillDetail = {
  id: number;
  foodName: string;
  foodSizeName: string | null;
  tasteName: string | null;
  price: number;
  moneyAdded: number;
};

export type Bill = {
  id: number;
  payDate: string;
  amount: number;
  payType: string;
  tableNo: number;
  status: "use" | "cancelled";
  cancelledAt: string | null;
  cancelReason: string | null;
  User: { id: number; name: string };
  CancelledBy: { id: number; name: string } | null;
  BillSaleDetails: BillDetail[];
};

export type BillSummary = {
  activeCount: number;
  activeAmount: number;
  cancelledCount: number;
  cancelledAmount: number;
};

export type BillHistoryResponse = {
  results: Bill[];
  summary: BillSummary;
};

// Validates is record before it is used.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

// Validates is bill detail before it is used.
const isBillDetail = (value: unknown): value is BillDetail => {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "number" &&
    typeof value.foodName === "string" &&
    (typeof value.foodSizeName === "string" || value.foodSizeName === null) &&
    (typeof value.tasteName === "string" || value.tasteName === null) &&
    typeof value.price === "number" &&
    typeof value.moneyAdded === "number"
  );
};

// Validates is user summary before it is used.
const isUserSummary = (value: unknown): value is { id: number; name: string } =>
  isRecord(value) &&
  typeof value.id === "number" &&
  typeof value.name === "string";

// Validates is bill before it is used.
const isBill = (value: unknown): value is Bill => {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "number" &&
    typeof value.payDate === "string" &&
    typeof value.amount === "number" &&
    typeof value.payType === "string" &&
    typeof value.tableNo === "number" &&
    (value.status === "use" || value.status === "cancelled") &&
    (typeof value.cancelledAt === "string" || value.cancelledAt === null) &&
    (typeof value.cancelReason === "string" || value.cancelReason === null) &&
    isUserSummary(value.User) &&
    (value.CancelledBy === null || isUserSummary(value.CancelledBy)) &&
    Array.isArray(value.BillSaleDetails) &&
    value.BillSaleDetails.every(isBillDetail)
  );
};

// Validates is bill summary before it is used.
const isBillSummary = (value: unknown): value is BillSummary => {
  if (!isRecord(value)) return false;
  return [
    "activeCount",
    "activeAmount",
    "cancelledCount",
    "cancelledAmount",
  ].every((key) => typeof value[key] === "number");
};

// Validates is bill history response before it is used.
export const isBillHistoryResponse = (
  value: unknown,
): value is BillHistoryResponse =>
  isRecord(value) &&
  Array.isArray(value.results) &&
  value.results.every(isBill) &&
  isBillSummary(value.summary);

// Parses and validates bill history response responses.
export const parseBillHistoryResponse = (
  value: unknown,
): BillHistoryResponse | null => (isBillHistoryResponse(value) ? value : null);
