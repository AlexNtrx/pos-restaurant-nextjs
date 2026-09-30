import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QrTableOrders from "@/app/backoffice/sale/_components/qr-table-orders";

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: { get, patch } }));
vi.mock(
  "@/app/backoffice/settings/tables/_components/table-session-checkout",
  () => ({
    default: ({ onSettled }: { onSettled: () => Promise<void> }) => (
      <button onClick={() => void onSettled()}>Session checkout opened</button>
    ),
  }),
);

const qrOrder = {
  id: 42,
  channel: "QR",
  status: "SUBMITTED",
  version: 1,
  tableNo: 12,
  tableSessionId: 9,
  total: 25,
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
    await user.click(
      screen.getByRole("button", { name: "Maksa pöytäistunto" }),
    );
    expect(screen.getByText("Session checkout opened")).toBeTruthy();
    get.mockImplementation(async (path: string) => {
      if (path === "/tables")
        return { data: { results: [{ tableNo: 12, openSession: null }] } };
      throw new Error(`Unexpected GET ${path}`);
    });
    await user.click(
      screen.getByRole("button", { name: "Session checkout opened" }),
    );
    await screen.findByText("Pöydässä ei ole avointa istuntoa.");
    expect(screen.getByText("Session checkout opened")).toBeTruthy();
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
      screen.getByRole("button", { name: "Maksa pöytäistunto" }),
    ).toBeTruthy();
  });
});
