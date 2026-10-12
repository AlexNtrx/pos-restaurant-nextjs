import { describe, expect, it } from "vitest";
import {
  restaurantDateRange,
  restaurantToday,
} from "@/lib/restaurant-calendar";

describe("restaurant calendar", () => {
  it("selects Helsinki's day around midnight and year end regardless of browser zone", () => {
    expect(restaurantToday(new Date("2026-12-31T22:30:00Z"))).toBe(
      "2027-01-01",
    );
    expect(restaurantToday(new Date("2027-04-30T21:30:00Z"))).toBe(
      "2027-05-01",
    );
  });

  it.each([
    ["2027-03-28", "2027-03-27T22:00:00.000Z", "2027-03-28T21:00:00.000Z", 23],
    ["2027-10-31", "2027-10-30T21:00:00.000Z", "2027-10-31T22:00:00.000Z", 25],
    ["2027-05-01", "2027-04-30T21:00:00.000Z", "2027-05-01T21:00:00.000Z", 24],
    ["2027-12-31", "2027-12-30T22:00:00.000Z", "2027-12-31T22:00:00.000Z", 24],
  ])("covers the full local date %s", (date, start, end, hours) => {
    const range = restaurantDateRange(date, date);
    expect(range).toEqual({ submittedFrom: start, submittedBefore: end });
    expect((Date.parse(end) - Date.parse(start)) / 3_600_000).toBe(hours);
  });

  it("includes end dates across month/year boundaries and rejects invalid ranges", () => {
    expect(
      restaurantDateRange("2027-12-31", "2028-01-01").submittedBefore,
    ).toBe("2028-01-01T22:00:00.000Z");
    for (const [from, to] of [
      ["2027-02-30", "2027-03-01"],
      ["2027-03-01", "2027-02-28"],
      ["", "2027-01-01"],
    ])
      expect(() => restaurantDateRange(from, to)).toThrow();
  });
});
