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
  tableNo: number | null;
  serviceType: "DINE_IN" | "TAKEAWAY";
  Orders: { id: number }[];
  status: "use" | "cancelled";
  Refunds?: {
    amount: number;
    status: "PENDING" | "FAILED" | "COMPLETED";
    method: string;
    reference: string | null;
    completedAt: string | null;
    reason: string;
  }[];
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
    (typeof value.tableNo === "number" || value.tableNo === null) &&
    (value.serviceType === "DINE_IN" || value.serviceType === "TAKEAWAY") &&
    Array.isArray(value.Orders) &&
    value.Orders.every(
      (order) => isRecord(order) && typeof order.id === "number",
    ) &&
    (value.status === "use" || value.status === "cancelled") &&
    (value.Refunds === undefined ||
      (Array.isArray(value.Refunds) &&
        value.Refunds.every(
          (refund) =>
            isRecord(refund) &&
            typeof refund.amount === "number" &&
            ["PENDING", "FAILED", "COMPLETED"].includes(
              String(refund.status),
            ) &&
            typeof refund.method === "string" &&
            (refund.reference === null ||
              typeof refund.reference === "string") &&
            (refund.completedAt === null ||
              typeof refund.completedAt === "string") &&
            typeof refund.reason === "string",
        ))) &&
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

export type BillHeader = Omit<Bill, "BillSaleDetails" | "Refunds"> & {
  refundSummary: {
    status: "PENDING" | "FAILED" | "COMPLETED";
    amount: number;
    count: number;
  }[];
};
export type BillPagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  snapshotId: number;
};
export type PagedBillHistory = {
  results: BillHeader[];
  summary: BillSummary;
  pagination: BillPagination;
};
const integerInRange = (value: unknown, min: number, max: number) =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= min &&
  value <= max;

// EN: Validate paged headers separately from legacy item snapshots; reject unbounded or inconsistent pagination before rendering.
// FI: Tarkista sivutetut otsikkotiedot erillään vanhoista tuoteriveistä; hylkää rajaton tai ristiriitainen sivutus ennen näyttämistä.
export const parsePagedBillHistory = (
  value: unknown,
): PagedBillHistory | null => {
  if (
    !isRecord(value) ||
    !isRecord(value.pagination) ||
    !isBillSummary(value.summary) ||
    !Array.isArray(value.results)
  )
    return null;
  const { page, pageSize, totalCount, totalPages, snapshotId } =
    value.pagination;
  if (
    !integerInRange(page, 1, 1_000_000) ||
    !integerInRange(pageSize, 1, 100) ||
    !integerInRange(totalCount, 0, Number.MAX_SAFE_INTEGER) ||
    !integerInRange(snapshotId, 0, 2_147_483_647) ||
    totalPages !== Math.ceil((totalCount as number) / (pageSize as number)) ||
    value.results.length > (pageSize as number)
  )
    return null;
  const summary = value.summary;
  if (
    !integerInRange(summary.activeCount, 0, Number.MAX_SAFE_INTEGER) ||
    !integerInRange(summary.cancelledCount, 0, Number.MAX_SAFE_INTEGER) ||
    !Number.isFinite(summary.activeAmount) ||
    !Number.isFinite(summary.cancelledAmount) ||
    summary.activeCount + summary.cancelledCount !== totalCount
  )
    return null;
  const ids = new Set<number>();
  for (const bill of value.results) {
    if (
      !isRecord(bill) ||
      !isBill({ ...bill, BillSaleDetails: [] }) ||
      bill.BillSaleDetails !== undefined ||
      bill.Refunds !== undefined ||
      !integerInRange(bill.id, 1, snapshotId as number) ||
      !Number.isFinite(bill.amount) ||
      !Number.isFinite(Date.parse(String(bill.payDate))) ||
      !Array.isArray(bill.refundSummary) ||
      bill.refundSummary.length > 3 ||
      ids.has(bill.id as number)
    )
      return null;
    ids.add(bill.id as number);
    const statuses = new Set<string>();
    for (const refund of bill.refundSummary) {
      if (
        !isRecord(refund) ||
        !["PENDING", "FAILED", "COMPLETED"].includes(String(refund.status)) ||
        typeof refund.amount !== "number" ||
        !Number.isFinite(refund.amount) ||
        !integerInRange(refund.count, 1, Number.MAX_SAFE_INTEGER) ||
        statuses.has(String(refund.status))
      )
        return null;
      statuses.add(String(refund.status));
    }
  }
  return value as PagedBillHistory;
};

export const parseBillDetail = (value: unknown): Bill | null =>
  isRecord(value) && isBill(value.result) ? value.result : null;
