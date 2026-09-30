import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import MonthlySalesRoute from "@/app/backoffice/reports/monthly-sales/page";

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api }));

const report = {
  results: Array.from({ length: 12 }, (_, index) => ({
    month: String(index + 1).padStart(2, "0"),
    amount: index === 0 ? 125 : 0,
  })),
  totalAmount: 125,
};

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);
beforeAll(() => {
  // EN: jsdom does not implement the scrolling used by keyboard-operated Radix Select.
  // FI: jsdom ei toteuta näppäimistöllä käytettävän Radix Selectin vieritystä.
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});
afterAll(() => {
  if (originalScrollIntoView) {
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScrollIntoView,
    );
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  api.post.mockResolvedValue({ data: report });
});
afterEach(cleanup);

describe("Kuukausimyynti report", () => {
  it("loads the monthly contract and displays all months and the server total", async () => {
    render(<MonthlySalesRoute />);

    expect(await screen.findByText("Tammikuu")).toBeTruthy();
    expect(screen.getByText("Joulukuu")).toBeTruthy();
    expect(screen.getAllByText("125,00 €")).toHaveLength(3);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(api.post).toHaveBeenCalledWith("/report/sumMonthly", {
      year: new Date().getFullYear(),
    });
  });

  it("requests the selected year without sending a daily-report month", async () => {
    const user = userEvent.setup();
    render(<MonthlySalesRoute />);
    await screen.findByText("Tammikuu");

    screen.getByRole("combobox").focus();
    await user.keyboard("{ArrowDown}");
    const year = new Date().getFullYear() - 1;
    await user.keyboard("{ArrowDown}{Enter}");

    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith("/report/sumMonthly", { year }),
    );
  });

  it("rejects a daily response and allows retry with the monthly contract", async () => {
    api.post.mockResolvedValueOnce({
      data: {
        results: [{ date: "2026-01-01", amount: 125 }],
        totalAmount: 125,
      },
    });
    const user = userEvent.setup();
    render(<MonthlySalesRoute />);

    expect(await screen.findByText("Raporttia ei voitu ladata")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Yritä uudelleen" }));
    expect(await screen.findByText("Tammikuu")).toBeTruthy();
    expect(api.post).toHaveBeenCalledTimes(2);
  });
});
