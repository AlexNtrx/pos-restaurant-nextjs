import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { api } = vi.hoisted(() => ({ api: { post: vi.fn(), get: vi.fn() } }));
vi.mock("@/lib/api", () => ({ default: api }));

import ReceiptHistoryPage from "@/app/backoffice/orders/history/page";
import type { Bill } from "@/lib/receipts/bill-history-contract";

const paidBill: Bill = {
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
const cancelledBill: Bill = {
  ...paidBill,
  id: 42,
  status: "cancelled",
  cancelledAt: "2026-09-27T13:00:00.000Z",
  cancelReason: "Mistake",
  CancelledBy: { id: 1, name: "Admin" },
};
const header = (bill: Bill) => {
  const fields = Object.fromEntries(
    Object.entries(bill).filter(
      ([key]) => key !== "BillSaleDetails" && key !== "Refunds",
    ),
  );
  return { ...fields, refundSummary: [] };
};
const history = {
  results: [header(paidBill), header(cancelledBill)],
  summary: {
    activeCount: 1,
    activeAmount: 25,
    cancelledCount: 1,
    cancelledAmount: 25,
  },
  pagination: {
    page: 1,
    pageSize: 50,
    totalCount: 2,
    totalPages: 1,
    snapshotId: 42,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:historic-receipt");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(window, "open").mockImplementation(() => null);
  api.post.mockImplementation((path: string) => {
    if (path === "/billSale/history")
      return Promise.resolve({
        data: {
          ...history,
        },
      });
    if (path === "/saleTemp/printBillAfterPay")
      return Promise.resolve({
        data: new Blob(["%PDF"], { type: "application/pdf" }),
        headers: { "content-type": "application/pdf" },
      });
    return Promise.reject(new Error("Unexpected API call"));
  });
  api.get.mockImplementation((path: string) =>
    Promise.resolve({
      data: { result: path.endsWith("/42") ? cancelledBill : paidBill },
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("receipt history reprint", () => {
  it("loads item snapshots only after opening a bill", async () => {
    const user = userEvent.setup();
    render(<ReceiptHistoryPage />);
    await screen.findByText(/#41 ·/);
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.queryByText("Soup")).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "Avaa" })[0]);
    await screen.findByText("Soup");
    expect(api.get).toHaveBeenCalledWith(
      "/billSale/detail/41",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("pages with the initial ID ceiling and preserves totals for the whole interval", async () => {
    const user = userEvent.setup();
    const summary = {
      activeCount: 50,
      activeAmount: 1250,
      cancelledCount: 1,
      cancelledAmount: 25,
    };
    api.post.mockImplementation((_path: string, body: { page: number }) =>
      Promise.resolve({
        data: {
          results:
            body.page === 1
              ? Array.from({ length: 50 }, (_, i) =>
                  header({ ...paidBill, id: 99 - i }),
                )
              : [header({ ...cancelledBill, id: 49 })],
          summary,
          pagination: {
            page: body.page,
            pageSize: 50,
            totalCount: 51,
            totalPages: 2,
            snapshotId: 99,
          },
        },
      }),
    );
    render(<ReceiptHistoryPage />);
    await screen.findByText(/Sivu 1 \/ 2/);
    expect(screen.getAllByRole("button", { name: "Avaa" })).toHaveLength(50);
    await user.click(screen.getByRole("button", { name: "Seuraava" }));
    await screen.findByText(/Sivu 2 \/ 2/);
    expect(screen.getAllByRole("button", { name: "Avaa" })).toHaveLength(1);
    expect(screen.getByText("50 kuittia")).toBeTruthy();
    expect(api.post).toHaveBeenLastCalledWith(
      "/billSale/history",
      expect.objectContaining({ page: 2, pageSize: 50, snapshotId: 99 }),
      expect.anything(),
    );
    await user.click(screen.getByRole("button", { name: "Päivitä" }));
    await screen.findByText(/Sivu 1 \/ 2/);
    const requestBody = api.post.mock.calls.at(-1)?.[1];
    expect(requestBody.page).toBe(1);
    expect(requestBody.snapshotId).toBeUndefined();
  });

  it("ignores an older interval response after the date filter changes", async () => {
    let resolveOld!: (response: unknown) => void;
    api.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    render(<ReceiptHistoryPage />);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Alkaen"), {
      target: { value: "2026-01-01" },
    });
    await screen.findByText(/#41 ·/);
    await act(async () =>
      resolveOld({
        data: {
          ...history,
          results: [header({ ...paidBill, id: 900 })],
          pagination: { ...history.pagination, snapshotId: 900 },
        },
      }),
    );
    await waitFor(() => expect(screen.queryByText(/#900 ·/)).toBeNull());
  });

  it("ignores a detail response after closing and opening another bill", async () => {
    const user = userEvent.setup();
    let resolveOld!: (response: unknown) => void;
    api.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    render(<ReceiptHistoryPage />);
    await screen.findByText(/#41 ·/);
    await user.click(screen.getAllByRole("button", { name: "Avaa" })[0]);
    await user.click(screen.getByRole("button", { name: "Sulje" }));
    await user.click(screen.getAllByRole("button", { name: "Avaa" })[1]);
    await screen.findByText(/Mistake/);
    await act(async () =>
      resolveOld({
        data: {
          result: {
            ...paidBill,
            BillSaleDetails: [
              { ...paidBill.BillSaleDetails[0], foodName: "Stale item" },
            ],
          },
        },
      }),
    );
    expect(screen.queryByText("Stale item")).toBeNull();
    expect(screen.getByText("Kuitti #42")).toBeTruthy();
  });

  it("shows a retryable detail error without offering a receipt from stale headers", async () => {
    const user = userEvent.setup();
    api.get.mockRejectedValueOnce(new Error("Connection lost"));
    render(<ReceiptHistoryPage />);
    await screen.findByText(/#41 ·/);
    await user.click(screen.getAllByRole("button", { name: "Avaa" })[0]);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Kuitin tietoja ei voitu ladata");
    expect(
      within(dialog).queryByRole("button", { name: "Tulosta kuitti" }),
    ).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "Yritä uudelleen" }),
    );
    await within(dialog).findByText("Soup");
    expect(
      within(dialog).getByRole("button", { name: "Tulosta kuitti" }),
    ).toBeTruthy();
  });

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
