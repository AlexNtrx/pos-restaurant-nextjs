import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import WaiterPage from "@/app/backoffice/waiter/page";
import type { StaffOrder } from "@/lib/orders/contracts";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: { get } }));

const order: StaffOrder = {
  id: 31,
  channel: "QR",
  serviceType: "DINE_IN",
  status: "SUBMITTED",
  version: 1,
  tableNo: 4,
  tableSessionId: 11,
  total: 20,
  paidAt: null,
  preparingAt: null,
  confirmedAt: null,
  rejectedAt: null,
  readyAt: null,
  servedAt: null,
  completedAt: null,
  cancelledAt: null,
  rejectionReason: null,
  cancellationReason: null,
  submittedAt: "2026-10-03T10:00:00.000Z",
  updatedAt: "2026-10-03T10:00:00.000Z",
  items: [
    { name: "Soup", quantity: 1, note: null, lineTotal: 20, modifiers: [] },
  ],
};
let changes: StaffOrder[];
let visible: boolean;
const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));
const calls = () => get.mock.calls.filter(([path]) => path === "/orders");

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  changes = [];
  visible = true;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() =>
    visible ? "visible" : "hidden",
  );
  get.mockImplementation(
    async (path: string, options?: { params?: { status?: string } }) => {
      if (path === "/tables")
        return {
          data: { results: [{ id: 7, tableNo: 4, openSession: { id: 11 } }] },
        };
      if (path === "/waiter/menu")
        return { data: { result: { categories: [] } } };
      if (path === "/orders")
        return {
          data: {
            results: options?.params?.status
              ? options.params.status === "SUBMITTED"
                ? [order]
                : []
              : changes,
            nextCursor: null,
            serverTime: new Date().toISOString(),
          },
        };
      throw new Error(`Unexpected API ${path}`);
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("reduces unchanged waiter order reads from 52 to 16 in one simulated minute and fully reconciles periodically", async () => {
  render(<WaiterPage />);
  await tick();
  expect(calls()).toHaveLength(4);
  await tick(60_000);
  expect(calls()).toHaveLength(16);
  expect(
    calls()
      .slice(4)
      .every(
        ([, options]) => options.params.updatedAfter && !options.params.status,
      ),
  ).toBe(true);
  expect(screen.getByText("Pöytä 4 · Tilaus #31")).toBeTruthy();
  await tick(5_000);
  expect(calls()).toHaveLength(20);
  expect(
    calls()
      .slice(-4)
      .map(([, options]) => options.params.status),
  ).toEqual(["SUBMITTED", "CONFIRMED", "PREPARING", "READY"]);
});

it("keeps unchanged active orders, applies changes and removes a served order without reloading menu", async () => {
  render(<WaiterPage />);
  await tick();
  changes = [{ ...order, id: 32, status: "READY", version: 4 }];
  await tick(5_000);
  expect(screen.getByText("Pöytä 4 · Tilaus #31")).toBeTruthy();
  expect(screen.getByText("Pöytä 4 · Tilaus #32")).toBeTruthy();
  changes = [{ ...order, id: 32, status: "SERVED", version: 5 }];
  await tick(5_000);
  expect(screen.queryByText("Pöytä 4 · Tilaus #32")).toBeNull();
  expect(screen.getByText("Pöytä 4 · Tilaus #31")).toBeTruthy();
  expect(
    get.mock.calls.filter(([path]) => path === "/waiter/menu"),
  ).toHaveLength(1);
});

it("does not read hidden queues and runs all active stages when returning", async () => {
  render(<WaiterPage />);
  await tick();
  visible = false;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await tick(60_000);
  expect(calls()).toHaveLength(4);
  visible = true;
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(calls()).toHaveLength(8);
  expect(
    calls()
      .slice(-4)
      .every(([, options]) => options.params.status),
  ).toBe(true);
});

it("retains the active snapshot on connection failure and clears its stale notice after reconnect", async () => {
  render(<WaiterPage />);
  await tick();
  get.mockRejectedValueOnce(new Error("Yhteys katkesi"));
  await tick(5_000);
  expect(screen.getByText("Pöytä 4 · Tilaus #31")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("Yhteys katkesi");
  await act(async () => window.dispatchEvent(new Event("online")));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Pöytä 4 · Tilaus #31")).toBeTruthy();
});
