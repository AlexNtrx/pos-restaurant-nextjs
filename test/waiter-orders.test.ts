import { beforeEach, expect, it, vi } from "vitest";
import api from "@/lib/api";
import {
  cancelWaiterOrder,
  loadWaiterOrders,
  loadWaiterSnapshot,
  loadWaiterTables,
  mergeWaiterOrders,
  serveWaiterOrder,
} from "@/lib/waiter-orders";
import type { StaffOrder } from "@/app/backoffice/orders/inbox/_lib/staff-orders";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), patch: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

it("accepts serving only after the selected order advances to a saved served state", async () => {
  const order = { id: 23, version: 4, status: "READY" } as StaffOrder;
  for (const result of [
    { id: 23, version: 5, status: "READY" },
    { id: 23, version: 4, status: "SERVED" },
    { id: 24, version: 5, status: "SERVED" },
  ]) {
    vi.mocked(api.patch).mockResolvedValueOnce({ data: { result } });
    await expect(serveWaiterOrder(order)).rejects.toThrow(
      "virheellisen tilaustilan",
    );
  }
  vi.mocked(api.patch).mockResolvedValueOnce({
    data: { result: { ...order, version: 5, status: "SERVED" } },
  });
  expect((await serveWaiterOrder(order)).status).toBe("SERVED");
});

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
  const stages = ["SUBMITTED", "CONFIRMED", "PREPARING", "READY"];
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
  expect(api.get).not.toHaveBeenCalledWith(
    "/orders",
    expect.objectContaining({
      params: expect.objectContaining({ status: "SERVED" }),
    }),
  );
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

it("reads tables without fetching the menu used by waiter order entry", async () => {
  vi.mocked(api.get).mockResolvedValueOnce({
    data: { results: [{ id: 1, tableNo: 4, openSession: null }] },
  });
  expect(await loadWaiterTables()).toHaveLength(1);
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledWith("/tables", { signal: undefined });
});

it("loads all pages of each active stage and uses the earliest watermark", async () => {
  const signal = new AbortController().signal;
  vi.mocked(api.get).mockImplementation(async (_url, config) => {
    const params = config?.params as { status: string; cursor?: string };
    return {
      data: {
        results:
          params.status === "SUBMITTED"
            ? params.cursor
              ? [
                  {
                    id: 101,
                    version: 1,
                    serviceType: "DINE_IN",
                    status: "SUBMITTED",
                  },
                ]
              : Array.from({ length: 100 }, (_, index) => ({
                  id: index + 1,
                  version: 1,
                  serviceType: "DINE_IN",
                  status: "SUBMITTED",
                }))
            : [],
        nextCursor:
          params.status === "SUBMITTED" && !params.cursor ? "next-page" : null,
        serverTime:
          params.status === "READY"
            ? "2026-10-03T12:00:00.000Z"
            : "2026-10-03T12:00:01.000Z",
      },
    };
  });
  const snapshot = await loadWaiterSnapshot(signal);
  expect(snapshot.results).toHaveLength(101);
  expect(snapshot.serverTime).toBe("2026-10-03T12:00:00.000Z");
  expect(api.get).toHaveBeenCalledTimes(5);
  expect(
    vi
      .mocked(api.get)
      .mock.calls.every(([, config]) => config?.signal === signal),
  ).toBe(true);
});

it("does not roll a queue back to a lower version and removes terminal changes", () => {
  const ready = {
    id: 23,
    version: 4,
    status: "READY",
    serviceType: "DINE_IN",
  } as StaffOrder;
  expect(
    mergeWaiterOrders([ready], [{ ...ready, version: 3, status: "PREPARING" }]),
  ).toEqual([ready]);
  expect(
    mergeWaiterOrders([ready], [{ ...ready, version: 5, status: "SERVED" }]),
  ).toEqual([]);
});
