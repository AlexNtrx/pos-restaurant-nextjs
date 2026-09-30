import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { api } = vi.hoisted(() => ({ api: { post: vi.fn() } }));
vi.mock("@/lib/api", () => ({ default: api }));

import ReceiptHistoryPage from "@/app/backoffice/orders/history/page";

const paidBill = {
  id: 41,
  payDate: "2026-09-27T12:00:00.000Z",
  amount: 25,
  payType: "cash",
  tableNo: 1,
  serviceType: "DINE_IN",
  Orders: [{ id: 31 }],
  status: "use",
  cancelledAt: null,
  cancelReason: null,
  User: { id: 7, name: "Cashier" },
  CancelledBy: null,
  BillSaleDetails: [
    {
      id: 1,
      foodName: "Soup",
      foodSizeName: null,
      tasteName: null,
      price: 25,
      moneyAdded: 0,
    },
  ],
};
const cancelledBill = {
  ...paidBill,
  id: 42,
  status: "cancelled",
  cancelledAt: "2026-09-27T13:00:00.000Z",
  cancelReason: "Mistake",
  CancelledBy: { id: 1, name: "Admin" },
};

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:historic-receipt");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(window, "open").mockImplementation(() => null);
  api.post.mockImplementation((path: string) => {
    if (path === "/billSale/list")
      return Promise.resolve({
        data: {
          results: [paidBill, cancelledBill],
          summary: {
            activeCount: 1,
            activeAmount: 25,
            cancelledCount: 1,
            cancelledAmount: 25,
          },
        },
      });
    if (path === "/saleTemp/printBillAfterPay")
      return Promise.resolve({
        data: new Blob(["%PDF"], { type: "application/pdf" }),
        headers: { "content-type": "application/pdf" },
      });
    return Promise.reject(new Error("Unexpected API call"));
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("receipt history reprint", () => {
  it("opens an authenticated PDF preview for an active historical bill", async () => {
    const user = userEvent.setup();
    render(<ReceiptHistoryPage />);
    await screen.findByText(/#41 ·/);
    await user.click(screen.getAllByRole("button", { name: "Avaa" })[0]);
    const details = await screen.findByRole("dialog");
    await user.click(
      within(details).getByRole("button", { name: "Tulosta kuitti" }),
    );

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/saleTemp/printBillAfterPay",
        { billId: 41 },
        { responseType: "blob" },
      ),
    );
    const preview = await screen.findByRole("dialog");
    expect(within(preview).getByText("Kuitin kopio")).toBeTruthy();
    await user.click(
      within(preview).getByRole("button", { name: "Tulosta kuitti" }),
    );
    expect(window.open).toHaveBeenCalledWith(
      "blob:historic-receipt",
      "_blank",
      "noopener,noreferrer",
    );
    await user.click(within(preview).getByRole("button", { name: "Sulje" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:historic-receipt");
  });

  it("does not offer a normal receipt reprint for a cancelled bill", async () => {
    const user = userEvent.setup();
    render(<ReceiptHistoryPage />);
    await screen.findByText(/#42 ·/);
    await user.click(screen.getAllByRole("button", { name: "Avaa" })[1]);
    const details = await screen.findByRole("dialog");
    expect(within(details).getByText(/Mistake/)).toBeTruthy();
    expect(
      within(details).queryByRole("button", { name: "Tulosta kuitti" }),
    ).toBeNull();
    expect(
      api.post.mock.calls.some(
        ([path]) => path === "/saleTemp/printBillAfterPay",
      ),
    ).toBe(false);
  });
});
