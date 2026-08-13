import assert from "node:assert/strict";
import test from "node:test";
import {
  isDailySalesResponse,
  isMonthlySalesResponse,
} from "../lib/report-contracts.ts";
import {
  isBillHistoryResponse,
  parseBillHistoryResponse,
} from "../app/backoffice/salereport/_lib/bill-history-contract.ts";
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
