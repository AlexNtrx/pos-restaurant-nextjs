import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SentOrdersPage from "@/app/backoffice/orders/sent/page";
import OrderRecordsPage from "@/app/backoffice/orders/history/orders/page";
import type { StaffOrderDetail } from "@/lib/orders/contracts";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
let order: StaffOrderDetail;
let refund: {
  id: number;
  amount: number;
  method: string;
  status: string;
  idempotencyKey: string;
  reference: string | null;
  failureReason: null;
} | null;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("mytokenfornextjsproject", "test-token");
  localStorage.setItem("next_user_id", "7");
  localStorage.setItem("next_name", "Cashier");
  vi.clearAllMocks();
  refund = null;
  order = {
    id: 81,
    channel: "COUNTER",
    serviceType: "DINE_IN",
    status: "CONFIRMED",
    version: 2,
    tableNo: 1,
    tableSessionId: null,
    total: 80,
    submittedAt: "2026-10-15T12:00:00.000Z",
    updatedAt: "2026-10-15T12:00:00.000Z",
    paidAt: "2026-10-15T12:00:00.000Z",
    preparingAt: null,
    readyAt: null,
    servedAt: null,
    confirmedAt: "2026-10-15T12:00:00.000Z",
    rejectedAt: null,
    cancelledAt: null,
    completedAt: null,
    rejectionReason: null,
    cancellationReason: null,
    receipt: { billId: 44, amount: 80, status: "use", orderCount: 1 },
    items: [
      { name: "Soup", quantity: 2, note: null, lineTotal: 80, modifiers: [] },
    ],
    history: [],
  };
  api.get.mockImplementation(
    async (path: string, options?: { params?: { view?: string } }) => {
      if (path === "/counterOrder/sent") {
        const active = [
          "SUBMITTED",
          "CONFIRMED",
          "PREPARING",
          "READY",
          "SERVED",
        ].includes(order.status);
        return {
          data: {
            results:
              active === (options?.params?.view !== "history")
                ? [
                    {
                      id: order.id,
                      serviceType: order.serviceType,
                      status: order.status,
                      version: order.version,
                      total: order.total,
                      submittedAt: order.submittedAt,
                      billSaleId: 44,
                      Items: [{ foodName: "Soup", quantity: 2 }],
                    },
                  ]
                : [],
          },
        };
      }
      if (path === "/counterOrder/81") {
        const { receipt: _receipt, ...owned } = order;
        void _receipt;
        return { data: { result: owned } };
      }
      if (path === "/orders/81") return { data: { result: order } };
      if (path === "/orders")
        return {
          data: {
            results: [order],
            nextCursor: null,
            sort: "submitted_desc",
            serverTime: order.updatedAt,
          },
        };
      if (path === "/orders/81/refund") return { data: { result: refund } };
      throw new Error(`Unexpected read: ${path}`);
    },
  );
});
afterEach(cleanup);

it.each(["DINE_IN", "TAKEAWAY"] as const)(
  "cancels a paid %s from sent orders and requires proof before completing its refund",
  async (serviceType) => {
    order = {
      ...order,
      serviceType,
      tableNo: serviceType === "TAKEAWAY" ? null : 1,
    };
    let finish!: () => void;
    api.post.mockImplementation(
      (
        path: string,
        payload: { idempotencyKey: string; reference?: string },
      ) => {
        if (path === "/orders/81/refund")
          return new Promise((resolve) => {
            finish = () => {
              order = { ...order, status: "CANCELLED", version: 3 };
              refund = {
                id: 9,
                amount: 80,
                method: "bank",
                status: "PENDING",
                idempotencyKey: payload.idempotencyKey,
                reference: null,
                failureReason: null,
              };
              resolve({ data: { result: refund } });
            };
          });
        if (path === "/orders/81/refund/complete") {
          refund = {
            ...refund!,
            status: "COMPLETED",
            reference: payload.reference!,
          };
          return Promise.resolve({ data: { result: refund } });
        }
        throw new Error(`Unexpected mutation: ${path}`);
      },
    );
    render(<SentOrdersPage />);
    if (serviceType === "TAKEAWAY")
      fireEvent.click(screen.getByRole("button", { name: "Mukaan" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Peruuta tilaus #81" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(await within(dialog).findByLabelText("Peruutuksen syy"), {
      target: { value: "Customer request" },
    });
    fireEvent.change(within(dialog).getByLabelText("Palautustapa"), {
      target: { value: "bank" },
    });
    expect(
      within(dialog).getByText(/Tämä toiminto ei siirrä rahaa/),
    ).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
    const reserve = within(dialog).getByRole("button", {
      name: "Peruuta tilaus ja aloita palautus",
    });
    fireEvent.click(reserve);
    fireEvent.click(reserve);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/orders/81/refund", {
      expectedVersion: 2,
      idempotencyKey: expect.any(String),
      reason: "Customer request",
      method: "bank",
    });
    expect((reserve as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Sulje" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () => finish());
    await within(dialog).findByText(/Rahat odottavat palautusta/);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Peruuta tilaus #81" }),
      ).toBeNull(),
    );
    const complete = within(dialog).getByRole("button", {
      name: "Vahvista rahat palautetuiksi",
    });
    expect((complete as HTMLButtonElement).disabled).toBe(true);
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Tosite / viite"), {
      target: { value: "Bank proof 123" },
    });
    fireEvent.click(complete);
    await within(dialog).findByText(/Palautus vahvistettu/);
    expect(api.post).toHaveBeenLastCalledWith("/orders/81/refund/complete", {
      idempotencyKey: refund!.idempotencyKey,
      reference: "Bank proof 123",
    });
    expect(localStorage.getItem("pending-request:v1:7:refund:81")).toBeNull();
  },
);

it("opens the existing pending refund from Tilaushistoria without reserving again", async () => {
  order = { ...order, status: "CANCELLED", version: 3 };
  refund = {
    id: 9,
    amount: 80,
    method: "cash",
    status: "PENDING",
    idempotencyKey: "original-reservation",
    reference: null,
    failureReason: null,
  };
  render(<OrderRecordsPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Avaa" }));
  await screen.findByText(/Rahat odottavat palautusta/);
  expect(
    screen.getByRole("button", { name: "Vahvista rahat palautetuiksi" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Peruuta tilaus ja aloita palautus" }),
  ).toBeNull();
  expect(api.post).not.toHaveBeenCalled();
});

it("does not offer a paid cancellation if the latest detail shows kitchen preparation", async () => {
  render(<SentOrdersPage />);
  const cancel = await screen.findByRole("button", {
    name: "Peruuta tilaus #81",
  });
  order = {
    ...order,
    status: "PREPARING",
    preparingAt: "2026-10-15T12:01:00.000Z",
    version: 3,
  };
  fireEvent.click(cancel);
  await within(await screen.findByRole("dialog")).findByText("Valmistetaan", {
    exact: true,
  });
  expect(
    screen.queryByRole("button", { name: "Peruuta tilaus ja aloita palautus" }),
  ).toBeNull();
  expect(api.post).not.toHaveBeenCalled();
});
