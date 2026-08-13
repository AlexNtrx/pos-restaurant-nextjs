import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DailySalesReportPage } from "@/app/backoffice/reports/_components/daily-sales-report-page";

const api = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("@/lib/api", () => ({ default: api }));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("Päivämyynti report", () => {
  it("derives supported KPIs and hides zero-sales rows by default", async () => {
    api.post.mockResolvedValue({
      data: {
        results: [
          { date: "2026-08-01", amount: 100 },
          { date: "2026-08-02", amount: 0 },
          { date: "2026-08-03", amount: 300 },
        ],
        totalAmount: 400,
      },
    });
    const user = userEvent.setup();

    render(<DailySalesReportPage />);

    expect(await screen.findByText("400,00 €")).toBeTruthy();
    expect(screen.getByText("Myyntipäiviä")).toBeTruthy();
    expect(screen.getByText("2", { selector: "p" })).toBeTruthy();
    expect(screen.getByText("200,00 €")).toBeTruthy();
    expect(screen.queryByText("02.08.2026")).toBeNull();

    const zeroDayControls = screen.getAllByRole("checkbox", {
      name: "Näytä myös 0 € päivät",
    });
    await user.click(zeroDayControls.at(-1)!);

    expect(screen.getByText("02.08.2026")).toBeTruthy();
    expect(screen.getByText("0,00 €")).toBeTruthy();
  });

  it("shows one empty state when the API returns only zero-sales days", async () => {
    api.post.mockResolvedValue({
      data: {
        results: [
          { date: "2026-08-01", amount: 0 },
          { date: "2026-08-02", amount: 0 },
        ],
        totalAmount: 0,
      },
    });

    render(<DailySalesReportPage />);

    expect(await screen.findByText("Myyntiä ei löytynyt")).toBeTruthy();
    expect(screen.queryByText("01.08.2026")).toBeNull();
    expect(screen.queryByText("02.08.2026")).toBeNull();
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
