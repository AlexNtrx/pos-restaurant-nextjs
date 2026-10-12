import { describe, expect, it } from "vitest";
import {
  centsEuros,
  euroCents,
  isEuroAmount,
  moneyDifference,
  moneyMultiply,
  moneySum,
} from "@/lib/money";

describe("EUR boundary and integer cents", () => {
  it("accepts Finnish decimal input and preserves old whole EUR", () => {
    expect(euroCents("12,90")).toBe(1290);
    expect(euroCents(20)).toBe(2000);
    expect(centsEuros(1290)).toBe(12.9);
    for (const value of [
      "",
      null,
      true,
      "1.234",
      "1,234",
      Infinity,
      -1,
      0.1 + 0.2,
    ])
      expect(euroCents(value)).toBeNull();
  });
  it("handles quantities, extras, cash change and negative net without rounding", () => {
    expect(moneyMultiply(0.1, 3)).toBe(0.3);
    const total = moneyMultiply(moneySum([12.9, 0.5]), 3);
    expect(total).toBe(40.2);
    expect(moneyDifference(50, total)).toBe(9.8);
    expect(moneyDifference(0.1, 0.3)).toBe(-0.2);
    expect(isEuroAmount(-0.2, true)).toBe(true);
  });
  it("rejects unsafe arithmetic and lossy JSON serialization", () => {
    expect(() => moneyMultiply(10_000_000, Number.MAX_SAFE_INTEGER)).toThrow(
      RangeError,
    );
    expect(() => centsEuros(Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
    expect(euroCents("90071992547409.92")).toBeNull();
  });
});
