import { beforeEach, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { cancelWaiterOrder, loadWaiterOrders } from "@/lib/waiter-orders";
import type { StaffOrder } from "@/app/backoffice/orders/inbox/_lib/staff-orders";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), patch: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

// EN: Axios 1.20 treats params as unknown; assert the request shape inside the mock.
// FI: Axios 1.20 käsittelee parametrit unknown-tyyppisinä; tarkista pyyntö mockissa.
const requestStatus = (params: unknown): string => {
  if (
    typeof params !== "object" ||
    params === null ||
    !("status" in params) ||
    typeof params.status !== "string"
  ) {
    throw new Error("Expected an order status query parameter");
  }
  return params.status;
};

it("loads every active dine-in stage without including takeaway orders", async () => {
  const stages = ["SUBMITTED", "CONFIRMED", "PREPARING", "READY", "SERVED"];
  vi.mocked(api.get).mockImplementation(async (_url, config) => ({
    data: {
      results: [
        {
          id: stages.indexOf(requestStatus(config?.params)) + 1,
          version: 1,
          status: requestStatus(config?.params),
          serviceType: "DINE_IN",
        },
        {
          id: 20,
          status: requestStatus(config?.params),
          serviceType: "TAKEAWAY",
        },
      ],
      nextCursor: null,
      serverTime: "2026-09-30T12:00:00.000Z",
    },
  }));
  const orders = await loadWaiterOrders();
  expect(orders.map((order) => order.status)).toEqual(stages);
  expect(orders.every((order) => order.serviceType === "DINE_IN")).toBe(true);
});

it("shows a transitioning order once at the latest version across stage reads", async () => {
  vi.mocked(api.get).mockImplementation(async (_url, config) => ({
    data: {
      results: ["CONFIRMED", "PREPARING"].includes(
        requestStatus(config?.params),
      )
        ? [
            {
              id: 23,
              version: requestStatus(config?.params) === "PREPARING" ? 3 : 2,
              status: requestStatus(config?.params),
              serviceType: "DINE_IN",
            },
          ]
        : [],
      nextCursor: null,
      serverTime: "2026-09-30T12:00:00.000Z",
    },
  }));
  const orders = await loadWaiterOrders();
  expect(orders).toHaveLength(1);
  expect(orders[0].status).toBe("PREPARING");
  expect(orders[0].version).toBe(3);
});

it("cancels the selected snapshot through the existing versioned status contract", async () => {
  vi.mocked(api.patch).mockResolvedValue({
    data: { result: { id: 23, status: "CANCELLED", history: [] } },
  });
  const order = { id: 23, version: 4 } as StaffOrder;
  await cancelWaiterOrder(order, "  Asiakkaan pyyntö  ");
  expect(api.patch).toHaveBeenCalledWith("/orders/23/status", {
    expectedVersion: 4,
    nextStatus: "CANCELLED",
    reason: "Asiakkaan pyyntö",
  });
});
