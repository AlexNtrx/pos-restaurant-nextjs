import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import WaiterTrackingPage from "@/app/backoffice/waiter/tracking/page";
import WaiterLayout from "@/app/backoffice/waiter/layout";
import type { StaffOrder } from "@/lib/orders/contracts";
import type { StaffServiceCall } from "@/lib/service-calls";

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: { get, patch } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/backoffice/waiter/tracking",
}));

function WaiterPage() {
  return (
    <WaiterLayout>
      <WaiterTrackingPage />
    </WaiterLayout>
  );
}

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
let staffCalls: StaffServiceCall[];
let callReadError: unknown;
const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));
const calls = () => get.mock.calls.filter(([path]) => path === "/orders");

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  changes = [];
  staffCalls = [];
  callReadError = null;
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
      if (path === "/service-calls") {
        if (callReadError) throw callReadError;
        return {
          data: {
            results: staffCalls.filter((call) => call.status !== "RESOLVED"),
          },
        };
      }
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
  patch.mockImplementation(
    async (
      path: string,
      body: {
        expectedVersion: number;
        nextStatus: "ACKNOWLEDGED" | "RESOLVED";
      },
    ) => {
      const current = staffCalls.find(
        (call) => path === `/service-calls/${call.id}/status`,
      )!;
      expect(body.expectedVersion).toBe(current.version);
      const result = {
        ...current,
        status: body.nextStatus,
        version: current.version + 1,
      };
      staffCalls = staffCalls.map((call) =>
        call.id === current.id ? result : call,
      );
      return { data: { result } };
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

it("adds takeaway changes, keeps the newest version and removes completed pickups", async () => {
  render(<WaiterPage />);
  await tick();
  const takeaway: StaffOrder = {
    ...order,
    id: 40,
    channel: "COUNTER",
    serviceType: "TAKEAWAY",
    tableNo: null,
    tableSessionId: null,
    status: "READY",
    version: 4,
    paidAt: "2026-10-15T12:00:00.000Z",
  };
  changes = [takeaway];
  await tick(5_000);
  const card = screen.getByText("Mukaan · Nouto #40").closest("li")!;
  expect(card.querySelector('[aria-current="step"]')?.textContent).toContain(
    "Valmis",
  );
  changes = [{ ...takeaway, status: "PREPARING", version: 3 }];
  await tick(5_000);
  expect(card.querySelector('[aria-current="step"]')?.textContent).toContain(
    "Valmis",
  );
  changes = [{ ...takeaway, status: "COMPLETED", version: 5 }];
  await tick(5_000);
  expect(screen.queryByText("Mukaan · Nouto #40")).toBeNull();
  expect(screen.getByText("Pöytä 4 · Tilaus #31")).toBeTruthy();
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
  const read = get.getMockImplementation()!;
  let failOrderRead = true;
  get.mockImplementation((path, options) => {
    if (path === "/orders" && failOrderRead) {
      failOrderRead = false;
      return Promise.reject(new Error("Yhteys katkesi"));
    }
    return read(path, options);
  });
  await tick(5_000);
  expect(screen.getByText("Pöytä 4 · Tilaus #31")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain(
    "Tilausjonoa ei voitu päivittää.",
  );
  await act(async () => window.dispatchEvent(new Event("online")));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Pöytä 4 · Tilaus #31")).toBeTruthy();
});

const requestedCall: StaffServiceCall = {
  id: 9,
  tableNo: 4,
  status: "REQUESTED",
  version: 1,
  createdAt: "2026-10-15T12:00:00.000Z",
  acknowledgedAt: null,
  resolvedAt: null,
};
const callReads = () =>
  get.mock.calls.filter(([path]) => path === "/service-calls");
const serviceCallButton = () =>
  screen.getByLabelText("Palvelukutsut", { selector: "button" });

it("notifies new calls while closed, shares reads with the dialog and clears only after acknowledgement", async () => {
  render(<WaiterPage />);
  await tick();
  expect(
    within(serviceCallButton()).queryByRole("status", { hidden: true }),
  ).toBeNull();
  staffCalls = [requestedCall];
  await tick(5_000);
  expect(
    within(serviceCallButton()).getByRole("status", { hidden: true })
      .textContent,
  ).toBe("Uusia palvelukutsuja");
  const beforeOpen = callReads().length;
  fireEvent.click(serviceCallButton());
  await tick();
  expect(screen.getByRole("dialog", { name: "Palvelukutsut" })).toBeTruthy();
  expect(callReads()).toHaveLength(beforeOpen);
  expect(
    within(serviceCallButton()).getByRole("status", { hidden: true }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ota vastaan" }));
  await tick();
  expect(patch).toHaveBeenCalledWith("/service-calls/9/status", {
    expectedVersion: 1,
    nextStatus: "ACKNOWLEDGED",
  });
  expect(
    within(serviceCallButton()).queryByRole("status", { hidden: true }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Merkitse hoidetuksi" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Sulje" }));
  await tick();
  staffCalls.push({ ...requestedCall, id: 10 });
  await tick(5_000);
  expect(
    within(serviceCallButton()).getByRole("status", { hidden: true }),
  ).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("ignores acknowledged calls on load and removes externally resolved calls on the next read", async () => {
  staffCalls = [{ ...requestedCall, status: "ACKNOWLEDGED", version: 2 }];
  render(<WaiterPage />);
  await tick();
  expect(
    within(serviceCallButton()).queryByRole("status", { hidden: true }),
  ).toBeNull();
  staffCalls = [requestedCall];
  await tick(5_000);
  expect(
    within(serviceCallButton()).getByRole("status", { hidden: true }),
  ).toBeTruthy();
  staffCalls = [];
  await tick(5_000);
  expect(
    within(serviceCallButton()).queryByRole("status", { hidden: true }),
  ).toBeNull();
});

it("pauses call notification reads while hidden, resumes and retains confirmed calls through a transient error", async () => {
  staffCalls = [requestedCall];
  render(<WaiterPage />);
  await tick();
  visible = false;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await tick(30_000);
  expect(callReads()).toHaveLength(1);
  visible = true;
  callReadError = new Error("Connection failed");
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(
    within(serviceCallButton()).getByRole("status", { hidden: true }),
  ).toBeTruthy();
  callReadError = null;
  staffCalls = [];
  await tick(10_000);
  expect(
    within(serviceCallButton()).queryByRole("status", { hidden: true }),
  ).toBeNull();
});

it.each([401, 403])(
  "clears service notifications and stops their polling after %s",
  async (status) => {
    staffCalls = [requestedCall];
    render(<WaiterPage />);
    await tick();
    callReadError = { isAxiosError: true, response: { status } };
    await tick(5_000);
    expect(
      within(serviceCallButton()).queryByRole("status", { hidden: true }),
    ).toBeNull();
    await tick(60_000);
    expect(callReads()).toHaveLength(2);
  },
);

it("ignores a service-call response aborted when the document is hidden", async () => {
  const read = get.getMockImplementation()!;
  let finish!: (value: unknown) => void;
  let signal!: AbortSignal;
  get.mockImplementation((path, options) =>
    path === "/service-calls"
      ? new Promise((resolve) => {
          signal = options.signal;
          finish = resolve;
        })
      : read(path, options),
  );
  render(<WaiterPage />);
  await tick();
  visible = false;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(signal.aborted).toBe(true);
  await act(async () => finish({ data: { results: [requestedCall] } }));
  expect(
    within(serviceCallButton()).queryByRole("status", { hidden: true }),
  ).toBeNull();
});
