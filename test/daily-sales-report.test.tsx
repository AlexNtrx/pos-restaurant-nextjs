import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DailySalesReportPage } from "@/app/backoffice/reports/_components/daily-sales-report-page";

const api = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("@/lib/api", () => ({ default: api }));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function reportFixture(year: number, month: number, amounts: number[]) {
  const results = Array.from(
    { length: new Date(Date.UTC(year, month, 0)).getUTCDate() },
    (_, index) => {
      const amount = amounts[index] ?? 0;
      return {
        date: new Date(Date.UTC(year, month - 1, index + 1))
          .toISOString()
          .slice(0, 10),
        amount,
        breakdown: {
          grossAmount: amount,
          refundedAmount: 0,
          pendingRefundAmount: 0,
          failedRefundAmount: 0,
          unpaidCancelledCount: 0,
          unpaidCancelledAmount: 0,
          paidCancelledCount: 0,
          paidCancelledAmount: 0,
        },
      };
    },
  );
  const totalAmount = results.reduce((sum, row) => sum + row.amount, 0);
  return {
    results,
    totalAmount,
    summary: { ...results[0].breakdown, grossAmount: totalAmount },
  };
}

const displayedDate = (day: number) =>
  new Intl.DateTimeFormat("fi-FI", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(
    new Date(
      Date.UTC(new Date().getFullYear(), new Date().getMonth(), day, 12),
    ),
  );

describe("Päivämyynti report", () => {
  it("initializes the selected period from Helsinki at the year boundary", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T22:30:00Z"));
    api.post.mockImplementation(async (_path, { year, month }) => ({
      data: reportFixture(year, month, []),
    }));
    render(<DailySalesReportPage />);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/report/dailySales", {
        year: 2027,
        month: 1,
      }),
    );
    const explanation = screen.getByText(/Tämä ei ole kassavirtaraportti/);
    const details = explanation.closest("details")!;
    expect(details.open).toBe(false);
    await userEvent.click(screen.getByText("Miten luvut lasketaan?"));
    expect(details.open).toBe(true);
    expect(screen.queryByText(/Europe\/Helsinki/)).toBeNull();
  });
  it("shows the report breakdown and hides empty rows by default", async () => {
    api.post.mockImplementation(async (_path, { year, month }) => ({
      data: reportFixture(year, month, [100, 0, 300]),
    }));
    const user = userEvent.setup();

    render(<DailySalesReportPage />);

    expect((await screen.findAllByText("400,00 €")).length).toBe(2);
    expect(
      screen.getAllByText("Myynti ennen palautuksia").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Nettomyynti").length).toBeGreaterThan(0);
    expect(screen.queryByText(displayedDate(2))).toBeNull();

    const zeroDayControls = screen.getAllByRole("checkbox", {
      name: "Näytä myös tyhjät päivät",
    });
    await user.click(zeroDayControls.at(-1)!);

    expect(screen.getByText(displayedDate(2))).toBeTruthy();
    expect(screen.getAllByText("0,00 €").length).toBeGreaterThan(0);
  });

  it("shows one empty state when the API returns only zero-sales days", async () => {
    api.post.mockImplementation(async (_path, { year, month }) => ({
      data: reportFixture(year, month, []),
    }));

    render(<DailySalesReportPage />);

    expect(await screen.findByText("Tapahtumia ei löytynyt")).toBeTruthy();
    expect(screen.queryByText(displayedDate(1))).toBeNull();
    expect(screen.queryByText(displayedDate(2))).toBeNull();
  });

  it("shows a retryable error without replacing the report filters", async () => {
    api.post.mockRejectedValue(new Error("network unavailable"));

    render(<DailySalesReportPage />);

    expect(await screen.findByText("Raporttia ei voitu ladata")).toBeTruthy();
    expect(screen.getByText("Vuosi")).toBeTruthy();
    expect(screen.getByText("Kuukausi")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Yritä uudelleen" }),
    ).toBeTruthy();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  });
});
