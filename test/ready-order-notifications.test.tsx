import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceNavigation } from "@/app/backoffice/components/workspace-navigation";
import { hasReadyOrders, notifyReadyOrdersChanged } from "@/lib/ready-orders";
import type { UserLevel } from "@/lib/access-control";

const mocks = vi.hoisted(() => ({
  pathname: "/backoffice/waiter",
  get: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/lib/api", () => ({ default: { get: mocks.get } }));
let ready: boolean, visible: boolean;
const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  ready = false;
  visible = true;
  mocks.pathname = "/backoffice/waiter";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() =>
    visible ? "visible" : "hidden",
  );
  mocks.get.mockImplementation(async (path: string) => ({
    data:
      path === "/orders"
        ? {
            results: ready
              ? [{ id: 28, status: "READY", serviceType: "TAKEAWAY" }]
              : [],
          }
        : { result: { hasReady: ready } },
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each([
  [
    "waiter",
    "/backoffice/waiter",
    "/backoffice/waiter/tracking",
    "Tilausten seuranta",
    "/orders",
  ],
  [
    "kassa",
    "/backoffice/orders/new",
    "/backoffice/orders/sent",
    "Keittiöön lähetetyt",
    "/counterOrder/ready-summary",
  ],
] as const)(
  "updates the %s tab indicator for existing and newly ready Orders and keeps it until no Orders are ready",
  async (role, from, destination, label, endpoint) => {
    mocks.pathname = from;
    const view = render(<WorkspaceNavigation userLevel={role} />);
    await tick();
    expect(screen.queryByRole("status")).toBeNull();
    ready = true;
    await tick(5_000);
    const link = screen.getByRole("link", { name: new RegExp(label) });
    expect(within(link).getByRole("status").textContent).toBe(
      "Valmiita tilauksia",
    );
    expect(mocks.get.mock.calls.every(([path]) => path === endpoint)).toBe(
      true,
    );
    if (role === "waiter")
      expect(mocks.get).toHaveBeenLastCalledWith(
        "/orders",
        expect.objectContaining({ params: { status: "READY", limit: 1 } }),
      );
    mocks.pathname = destination;
    view.rerender(<WorkspaceNavigation userLevel={role} />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(link.getAttribute("aria-current")).toBe("page");
    ready = false;
    await act(async () => notifyReadyOrdersChanged());
    expect(screen.queryByRole("status")).toBeNull();
    ready = true;
    view.unmount();
    render(<WorkspaceNavigation userLevel={role} />);
    await tick();
    expect(screen.getByRole("status")).toBeTruthy();
  },
);

it.each(["DINE_IN", "TAKEAWAY"])(
  "accepts a ready %s waiter Order and rejects malformed/other-stage summaries",
  async (serviceType) => {
    mocks.get.mockResolvedValueOnce({
      data: { results: [{ id: 1, status: "READY", serviceType }] },
    });
    expect(await hasReadyOrders("waiter", new AbortController().signal)).toBe(
      true,
    );
    for (const data of [
      {},
      { results: [{ id: 1, status: "PREPARING", serviceType }] },
      { results: [null] },
      { results: [{ id: 1, status: "READY", serviceType: "BAD" }] },
    ]) {
      mocks.get.mockResolvedValueOnce({ data });
      await expect(
        hasReadyOrders("waiter", new AbortController().signal),
      ).rejects.toThrow();
    }
    mocks.get.mockResolvedValueOnce({ data: { result: { hasReady: "true" } } });
    await expect(
      hasReadyOrders("orders", new AbortController().signal),
    ).rejects.toThrow();
  },
);

it("does not overlap reads and ignores a delayed response from an earlier workspace", async () => {
  let finish!: (value: unknown) => void;
  let oldSignal!: AbortSignal;
  mocks.get.mockImplementationOnce((_path, options) => {
    oldSignal = options.signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const view = render(<WorkspaceNavigation userLevel="admin" />);
  await tick(20_000);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  mocks.pathname = "/backoffice/orders/new";
  view.rerender(<WorkspaceNavigation userLevel="admin" />);
  await tick();
  expect(oldSignal.aborted).toBe(true);
  await act(async () =>
    finish({
      data: { results: [{ id: 28, status: "READY", serviceType: "TAKEAWAY" }] },
    }),
  );
  expect(screen.queryByRole("status")).toBeNull();
});

it("pauses hidden polling and refreshes on return without clearing a confirmed dot after a transient failure", async () => {
  ready = true;
  render(<WorkspaceNavigation userLevel="waiter" />);
  await tick();
  visible = false;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await tick(30_000);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  visible = true;
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(mocks.get).toHaveBeenCalledTimes(2);
  mocks.get.mockRejectedValueOnce(new Error("Offline"));
  await tick(5_000);
  expect(screen.getByRole("status")).toBeTruthy();
  ready = false;
  await tick(10_000);
  expect(screen.queryByRole("status")).toBeNull();
});

it.each([401, 403])(
  "clears readiness and stops polling when permission is revoked with %s",
  async (status) => {
    ready = true;
    render(<WorkspaceNavigation userLevel="waiter" />);
    await tick();
    mocks.get.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status },
    });
    await tick(5_000);
    expect(screen.queryByRole("status")).toBeNull();
    await tick(60_000);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  },
);

it.each([
  ["kitchen", "/backoffice/kitchen"],
  ["waiter", "/backoffice/orders/new"],
  ["admin", "/backoffice/reports/daily-sales"],
  ["admin", "/backoffice/settings/tables"],
] as const)(
  "does not read readiness for %s at %s",
  async (role: UserLevel, pathname) => {
    mocks.pathname = pathname;
    render(<WorkspaceNavigation userLevel={role} />);
    await tick(10_000);
    expect(mocks.get).not.toHaveBeenCalled();
  },
);
