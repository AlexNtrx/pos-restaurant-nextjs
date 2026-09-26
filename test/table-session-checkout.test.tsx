import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: { get, post } }));

import TableSessionCheckout, {
  listPendingTablePayments,
} from "@/app/backoffice/settings/tables/_components/table-session-checkout";

const order = (id: number, status = "SERVED") => ({
  id,
  channel: "QR",
  status,
  version: 5,
  tableNo: 12,
  tableSessionId: 28,
  total: 40,
  submittedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  rejectionReason: null,
  cancellationReason: null,
  items: [
    { name: "Soup", quantity: 2, note: null, lineTotal: 40, modifiers: [] },
  ],
});
const response = (results: object[]) => ({
  data: { results, nextCursor: null, serverTime: new Date().toISOString() },
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("mytokenfornextjsproject", "test-token");
  localStorage.setItem("next_name", "Staff");
  localStorage.setItem("next_user_id", "7");
  get.mockResolvedValue(response([order(41), order(42)]));
  post.mockImplementation(async (path: string) => {
    if (path === "/table-sessions/28/settle")
      return {
        data: {
          billId: 91,
          amount: 80,
          inputMoney: 80,
          returnMoney: 0,
        },
      };
    throw new Error("Receipt unavailable");
  });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("PAY-01 table checkout", () => {
  it("reviews both served Orders and sends one versioned bank payment", async () => {
    const user = userEvent.setup();
    const onSettled = vi.fn(async () => {});
    render(
      <TableSessionCheckout
        sessionId={28}
        tableNo={12}
        onClose={vi.fn()}
        onSettled={onSettled}
      />,
    );
    const summary = await screen.findByRole("dialog", {
      name: "Pöytä 12 · istunnon maksu",
    });
    await within(summary).findByText("#41", { exact: false });
    expect(within(summary).getByText("#42", { exact: false })).toBeTruthy();
    await user.click(
      within(summary).getByRole("button", { name: "Siirry maksuun" }),
    );
    const payment = await screen.findByRole("dialog", {
      name: "Pöytä 12 · maksu",
    });
    await user.click(
      within(payment).getByRole("button", { name: "Bank Transfer" }),
    );
    await user.click(
      within(payment).getByRole("button", { name: "Complete Payment" }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/table-sessions/28/settle", {
        orders: [
          { id: 41, version: 5 },
          { id: 42, version: 5 },
        ],
        idempotencyKey: expect.any(String),
        payType: "bank",
      }),
    );
    await waitFor(() => expect(onSettled).toHaveBeenCalledOnce());
    expect(localStorage.getItem("table-payment:v1:7:28")).toBeNull();
  });

  it("blocks payment until every active Order is served", async () => {
    get.mockResolvedValue(response([order(41), order(42, "READY")]));
    render(
      <TableSessionCheckout
        sessionId={28}
        tableNo={12}
        onClose={vi.fn()}
        onSettled={vi.fn(async () => {})}
      />,
    );
    const summary = await screen.findByRole("dialog", {
      name: "Pöytä 12 · istunnon maksu",
    });
    await within(summary).findByText("#42", { exact: false });
    expect(
      (
        within(summary).getByRole("button", {
          name: "Siirry maksuun",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("recovers the exact saved request after reload, even if the table has closed", async () => {
    const saved = {
      tableNo: 12,
      orders: [
        { id: 41, version: 5 },
        { id: 42, version: 5 },
      ],
      idempotencyKey: "381d3c0d-9492-4d03-a3ab-ab525df2e497",
      payType: "bank",
      total: 80,
    };
    localStorage.setItem("table-payment:v1:7:28", JSON.stringify(saved));
    get.mockResolvedValue(response([]));
    expect(listPendingTablePayments()).toEqual([
      { sessionId: 28, tableNo: 12 },
    ]);
    const user = userEvent.setup();
    render(
      <TableSessionCheckout
        sessionId={28}
        tableNo={12}
        onClose={vi.fn()}
        onSettled={vi.fn(async () => {})}
      />,
    );
    const payment = await screen.findByRole("dialog", {
      name: "Pöytä 12 · maksu",
    });
    expect(
      (
        within(payment).getByRole("button", {
          name: "Bank Transfer",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.click(
      within(payment).getByRole("button", { name: "Complete Payment" }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/table-sessions/28/settle", {
        orders: saved.orders,
        idempotencyKey: saved.idempotencyKey,
        payType: "bank",
      }),
    );
    expect(localStorage.getItem("table-payment:v1:7:28")).toBeNull();
  });
});
