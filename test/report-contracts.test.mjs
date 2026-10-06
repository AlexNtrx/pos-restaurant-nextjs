import assert from "node:assert/strict";
import test from "node:test";
import {
  isDailySalesResponse,
  isMonthlySalesResponse,
} from "../lib/report-contracts.ts";
import {
  isBillHistoryResponse,
  parseBillHistoryResponse,
  parsePagedBillHistory,
  parseBillDetail,
} from "../lib/receipts/bill-history-contract.ts";
import {
  isFood,
  isFoodCategory,
  isFoodSize,
  isTaste,
  parseResults,
} from "../lib/catalog-contracts.ts";

const validDaily = {
  results: [{ date: "2026-08-01", amount: 10 }],
  totalAmount: 10,
};
const validMonthly = {
  results: Array.from({ length: 12 }, (_, index) => ({
    month: String(index + 1).padStart(2, "0"),
    amount: index,
  })),
  totalAmount: 66,
};

test("daily report validator accepts the existing daily contract", () => {
  assert.equal(isDailySalesResponse(validDaily), true);
  assert.equal(isDailySalesResponse({ ...validDaily, totalAmount: -1 }), true);
  assert.equal(
    isDailySalesResponse(
      { ...validDaily, totalAmount: -1 },
      { requireNonNegativeTotal: true },
    ),
    false,
  );
});

test("daily report validator rejects malformed rows and totals", () => {
  for (const value of [
    null,
    {},
    { results: [{ date: "2026/08/01", amount: 10 }], totalAmount: 10 },
    { results: [{ date: "2026-08-01", amount: -1 }], totalAmount: 10 },
    { results: [{ date: "2026-08-01", amount: Number.NaN }], totalAmount: 10 },
    {
      results: [{ date: "2026-08-01", amount: 10 }],
      totalAmount: Number.POSITIVE_INFINITY,
    },
  ]) {
    assert.equal(isDailySalesResponse(value), false);
  }
});

test("monthly report validator accepts only ordered, finite, non-negative data", () => {
  assert.equal(isMonthlySalesResponse(validMonthly), true);
  assert.equal(
    isMonthlySalesResponse({ ...validMonthly, totalAmount: -1 }),
    false,
  );
  assert.equal(
    isMonthlySalesResponse({ ...validMonthly, totalAmount: Number.NaN }),
    false,
  );
  assert.equal(
    isMonthlySalesResponse({
      ...validMonthly,
      results: validMonthly.results.map((item, index) =>
        index === 1 ? { ...item, month: "03" } : item,
      ),
    }),
    false,
  );
  assert.equal(
    isMonthlySalesResponse({
      ...validMonthly,
      results: validMonthly.results.map((item, index) =>
        index === 0 ? { ...item, amount: -1 } : item,
      ),
    }),
    false,
  );
});

const validBillHistory = {
  results: [
    {
      id: 1,
      payDate: "2026-08-01T10:00:00.000Z",
      amount: 25,
      payType: "cash",
      tableNo: 1,
      serviceType: "DINE_IN",
      Orders: [{ id: 31 }],
      status: "use",
      cancelledAt: null,
      cancelReason: null,
      User: { id: 1, name: "Cashier" },
      CancelledBy: null,
      BillSaleDetails: [
        {
          id: 1,
          foodName: "Meal",
          foodSizeName: null,
          tasteName: "Spicy",
          price: 25,
          moneyAdded: 0,
        },
      ],
    },
  ],
  summary: {
    activeCount: 1,
    activeAmount: 25,
    cancelledCount: 0,
    cancelledAmount: 0,
  },
};

test("bill-history parser accepts the current response contract", () => {
  assert.equal(isBillHistoryResponse(validBillHistory), true);
  assert.equal(parseBillHistoryResponse(validBillHistory), validBillHistory);
});

test("bill-history parser rejects missing required fields", () => {
  const value = {
    ...validBillHistory,
    results: [{ ...validBillHistory.results[0], payType: undefined }],
  };
  assert.equal(isBillHistoryResponse(value), false);
  assert.equal(parseBillHistoryResponse(value), null);
});

test("bill-history parser rejects incorrect primitive types", () => {
  const value = {
    ...validBillHistory,
    results: [{ ...validBillHistory.results[0], amount: "25" }],
  };
  assert.equal(isBillHistoryResponse(value), false);
  assert.equal(parseBillHistoryResponse(value), null);
});

test("bill-history parser rejects invalid results arrays", () => {
  const value = { ...validBillHistory, results: {} };
  assert.equal(isBillHistoryResponse(value), false);
  assert.equal(parseBillHistoryResponse(value), null);
});

test("bill-history parser rejects malformed nested bill details", () => {
  const value = {
    ...validBillHistory,
    results: [
      {
        ...validBillHistory.results[0],
        BillSaleDetails: [
          { ...validBillHistory.results[0].BillSaleDetails[0], price: "25" },
        ],
      },
    ],
  };
  assert.equal(isBillHistoryResponse(value), false);
  assert.equal(parseBillHistoryResponse(value), null);
});

test("bill-history parser rejects malformed summary data", () => {
  const value = {
    ...validBillHistory,
    summary: { ...validBillHistory.summary, activeAmount: "25" },
  };
  assert.equal(isBillHistoryResponse(value), false);
  assert.equal(parseBillHistoryResponse(value), null);
});

const category = { id: 1, name: "Main", remark: "" };

const { BillSaleDetails: _items, ...validHeader } = validBillHistory.results[0];
const validPage = {
  results: [{ ...validHeader, refundSummary: [] }],
  summary: validBillHistory.summary,
  pagination: {
    page: 1,
    pageSize: 50,
    totalCount: 1,
    totalPages: 1,
    snapshotId: 1,
  },
};
test("paged history validates bounded headers and separate immutable detail", () => {
  assert.equal(parsePagedBillHistory(validPage), validPage);
  assert.equal(
    parseBillDetail({ result: validBillHistory.results[0] }),
    validBillHistory.results[0],
  );
  assert.equal(parseBillDetail({ result: validPage.results[0] }), null);
});
test("paged history rejects oversized pages, inconsistent totals and invalid money", () => {
  for (const pagination of [
    { ...validPage.pagination, pageSize: 101 },
    { ...validPage.pagination, page: 0 },
    { ...validPage.pagination, snapshotId: 0 },
    { ...validPage.pagination, totalCount: 2 },
    { ...validPage.pagination, totalPages: 99 },
  ])
    assert.equal(parsePagedBillHistory({ ...validPage, pagination }), null);
  assert.equal(
    parsePagedBillHistory({
      ...validPage,
      summary: { ...validPage.summary, activeAmount: NaN },
    }),
    null,
  );
  assert.equal(
    parsePagedBillHistory({
      ...validPage,
      results: [{ ...validPage.results[0], amount: Infinity }],
    }),
    null,
  );
});
test("paged history rejects duplicate bills and refund statuses or eager item collections", () => {
  assert.equal(
    parsePagedBillHistory({
      ...validPage,
      results: [validPage.results[0], validPage.results[0]],
    }),
    null,
  );
  const refund = { status: "COMPLETED", amount: 25, count: 1 };
  assert.equal(
    parsePagedBillHistory({
      ...validPage,
      results: [{ ...validPage.results[0], refundSummary: [refund, refund] }],
    }),
    null,
  );
  assert.equal(
    parsePagedBillHistory({
      ...validPage,
      results: [{ ...validPage.results[0], BillSaleDetails: [] }],
    }),
    null,
  );
});

test("catalog validators accept the existing read-only API contracts", () => {
  assert.equal(isFoodCategory(category), true);
  assert.equal(
    isFood({
      id: 1,
      foodTypeId: 1,
      name: "Soup",
      remark: "",
      price: 12.5,
      img: "soup.jpg",
      foodType: "food",
      FoodType: category,
    }),
    true,
  );
  assert.equal(
    isFoodSize({
      id: 1,
      name: "Large",
      remark: "",
      foodTypeId: 1,
      moneyAdded: 2,
      FoodType: category,
    }),
    true,
  );
  assert.equal(
    isTaste({
      id: 1,
      name: "Spicy",
      remark: "",
      foodTypeId: 1,
      FoodType: category,
    }),
    true,
  );
});

test("catalog parser rejects malformed results without hiding the response error", () => {
  assert.deepEqual(parseResults({ results: [category] }, isFoodCategory), [
    category,
  ]);
  assert.equal(
    parseResults({ results: [{ ...category, id: "1" }] }, isFoodCategory),
    null,
  );
  assert.equal(parseResults({ results: {} }, isFoodCategory), null);
});
