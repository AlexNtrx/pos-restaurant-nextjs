import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QrTableOrders from "@/app/backoffice/sale/_components/qr-table-orders";

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: { get, patch } }));

const qrOrder = {
  id: 42,
  channel: "QR",
  status: "SUBMITTED",
  version: 1,
  tableNo: 12,
  tableSessionId: 9,
  total: 25,
  paidAt: null,
  preparingAt: null,
  items: [
    { name: "Soup", quantity: 1, note: null, lineTotal: 25, modifiers: [] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async (path: string) => {
    if (path === "/tables")
      return { data: { results: [{ tableNo: 12, openSession: { id: 9 } }] } };
    if (path === "/orders")
      return {
        data: {
          results: [qrOrder],
          nextCursor: null,
          serverTime: "2026-09-27T12:00:00.000Z",
        },
      };
    throw new Error(`Unexpected GET ${path}`);
  });
  patch.mockResolvedValue({
    data: {
      result: { ...qrOrder, status: "CONFIRMED", version: 2, history: [] },
    },
  });
});
afterEach(cleanup);

describe("Kassa QR table orders", () => {
  it.each(["SUBMITTED", "CONFIRMED"])(
    "allows unpaid %s cancellation with a reason and the current version",
    async (status) => {
      get.mockResolvedValueOnce({
        data: { results: [{ tableNo: 12, openSession: { id: 9 } }] },
      });
      get.mockResolvedValueOnce({
        data: {
          results: [{ ...qrOrder, status }],
          nextCursor: null,
          serverTime: "2026-09-27T12:00:00.000Z",
        },
      });
      const user = userEvent.setup();
      render(<QrTableOrders tableNo={12} />);
      await screen.findByText(`QR #42 · ${status}`);
      await user.click(screen.getByRole("button", { name: "Peruuta" }));
      await user.type(
        screen.getByRole("textbox", { name: "Syy (3–500 merkkiä)" }),
        "Customer requested cancellation",
      );
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Peruuta",
        }),
      );
      await waitFor(() =>
        expect(patch).toHaveBeenCalledWith("/orders/42/status", {
          expectedVersion: 1,
          nextStatus: "CANCELLED",
          reason: "Customer requested cancellation",
        }),
      );
    },
  );

  it.each([
    {
      status: "PREPARING",
      paidAt: null,
      preparingAt: "2026-09-27T12:00:00.000Z",
    },
    { status: "READY", paidAt: null, preparingAt: "2026-09-27T12:00:00.000Z" },
    { status: "SERVED", paidAt: null, preparingAt: null },
    {
      status: "CONFIRMED",
      paidAt: "2026-09-27T12:00:00.000Z",
      preparingAt: null,
    },
    {
      status: "CONFIRMED",
      paidAt: null,
      preparingAt: "2026-09-27T12:00:00.000Z",
    },
  ])(
    "hides cancellation for $status with paidAt=$paidAt and preparingAt=$preparingAt",
    async (state) => {
      get.mockResolvedValueOnce({
        data: { results: [{ tableNo: 12, openSession: { id: 9 } }] },
      });
      get.mockResolvedValueOnce({
        data: {
          results: [{ ...qrOrder, ...state }],
          nextCursor: null,
          serverTime: "2026-09-27T12:00:00.000Z",
        },
      });
      render(<QrTableOrders tableNo={12} />);
      await screen.findByText(`QR #42 · ${state.status}`);
      expect(screen.queryByRole("button", { name: "Peruuta" })).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Maksa pöytäistunto" }),
      ).toBeNull();
      expect(patch).not.toHaveBeenCalled();
    },
  );

  it("shows the selected table's QR order and confirms it for Kitchen", async () => {
    const user = userEvent.setup();
    render(<QrTableOrders tableNo={12} />);
    await screen.findByText("QR #42 · SUBMITTED");
    await user.click(
      screen.getByRole("button", { name: "Vahvista keittiöön" }),
    );
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/orders/42/status", {
        expectedVersion: 1,
        nextStatus: "CONFIRMED",
      }),
    );
    get.mockImplementation(async (path: string) => {
      if (path === "/tables")
        return { data: { results: [{ tableNo: 12, openSession: null }] } };
      throw new Error(`Unexpected GET ${path}`);
    });
    await user.click(screen.getByRole("button", { name: "Päivitä" }));
    await screen.findByText("Pöydässä ei ole avointa istuntoa.");
    expect(screen.queryByText("QR #42 · SUBMITTED")).toBeNull();
  });

  it("shows waiter orders in the same table session for cashier review", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/tables")
        return { data: { results: [{ tableNo: 12, openSession: { id: 9 } }] } };
      if (path === "/orders")
        return {
          data: {
            results: [
              { ...qrOrder, id: 44, channel: "STAFF", status: "READY" },
            ],
            nextCursor: null,
            serverTime: "2026-09-29T12:00:00.000Z",
          },
        };
      throw new Error(`Unexpected GET ${path}`);
    });
    render(<QrTableOrders tableNo={12} />);
    expect(await screen.findByText("Tarjoilija #44 · READY")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Maksa pöytäistunto" }),
    ).toBeNull();
  });
});
