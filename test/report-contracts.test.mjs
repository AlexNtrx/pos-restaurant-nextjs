import assert from "node:assert/strict";
import test from "node:test";
import {
  isDailySalesBreakdownResponse,
  isMonthlySalesResponse,
} from "../lib/report-contracts.ts";
import {
  hasValidMenuMoney,
  isFood,
  isFoodCategory,
  isFoodSize,
  isTaste,
  parseResults,
} from "../lib/catalog-contracts.ts";

test("menu estimates reject malformed prices before arithmetic while accepting fractional EUR", () => {
  const categories = [
    { food: [{ price: 12.9 }], foodSizes: [{ moneyAdded: 0.5 }] },
  ];
  assert.equal(hasValidMenuMoney(categories), true);
  assert.equal(
    hasValidMenuMoney([{ food: [{ price: 0.001 }], foodSizes: [] }]),
    false,
  );
  assert.equal(
    hasValidMenuMoney([{ food: [{ price: "12.90" }], foodSizes: [] }]),
    false,
  );
  assert.equal(
    hasValidMenuMoney([{ food: [], foodSizes: [{ moneyAdded: -0.5 }] }]),
    false,
  );
  assert.equal(hasValidMenuMoney(null), false);
});

const validDaily = {
  results: Array.from({ length: 31 }, (_, index) => ({
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    amount: index === 0 ? 8 : 0,
    breakdown: {
      grossAmount: index === 0 ? 10 : 0,
      refundedAmount: index === 0 ? 2 : 0,
      pendingRefundAmount: 0,
      failedRefundAmount: 0,
      unpaidCancelledCount: 0,
      unpaidCancelledAmount: 0,
      paidCancelledCount: 0,
      paidCancelledAmount: 0,
    },
  })),
  totalAmount: 8,
  summary: {
    grossAmount: 10,
    refundedAmount: 2,
    pendingRefundAmount: 0,
    failedRefundAmount: 0,
    unpaidCancelledCount: 0,
    unpaidCancelledAmount: 0,
    paidCancelledCount: 0,
    paidCancelledAmount: 0,
  },
};
const validMonthly = {
  results: Array.from({ length: 12 }, (_, index) => ({
    month: String(index + 1).padStart(2, "0"),
    amount: index,
  })),
  totalAmount: 66,
};

test("daily report validator accepts the reconciled breakdown contract", () => {
  assert.equal(isDailySalesBreakdownResponse(validDaily, 2026, 8), true);
  assert.equal(
    isDailySalesBreakdownResponse({ ...validDaily, totalAmount: -1 }, 2026, 8),
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
    assert.equal(isDailySalesBreakdownResponse(value, 2026, 8), false);
  }
});

test("monthly report validator accepts only ordered, exact and reconciled data", () => {
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

test("fractional daily and signed monthly nets reconcile using cents", () => {
  const daily = structuredClone(validDaily);
  daily.results[0].amount = -0.2;
  daily.results[0].breakdown.grossAmount = 0.1;
  daily.results[0].breakdown.refundedAmount = 0.3;
  daily.totalAmount = -0.2;
  daily.summary.grossAmount = 0.1;
  daily.summary.refundedAmount = 0.3;
  assert.equal(isDailySalesBreakdownResponse(daily, 2026, 8), true);
  daily.totalAmount = 0.1 - 0.3;
  assert.equal(isDailySalesBreakdownResponse(daily, 2026, 8), false);
  const monthly = {
    results: validMonthly.results.map((row, index) => ({
      ...row,
      amount: index === 0 ? -0.2 : 0,
    })),
    totalAmount: -0.2,
  };
  assert.equal(isMonthlySalesResponse(monthly), true);
  monthly.results[1].amount = 0.201;
  assert.equal(isMonthlySalesResponse(monthly), false);
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
