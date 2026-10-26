import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SentOrdersPage from "@/app/backoffice/orders/sent/page";
import type { StaffOrder } from "@/lib/orders/contracts";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ default: mocks }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));
const row = (id: number, status: StaffOrder["status"] = "READY", tableNo = 2) =>
  ({
    id,
    tableNo,
    channel: "QR",
    serviceType: "DINE_IN",
    status,
    version: 4,
    submittedAt: "2026-10-26T12:00:00.000Z",
    updatedAt: "2026-10-26T12:00:00.000Z",
    items: [
      {
        name: `Soup ${id}`,
        quantity: 1,
        modifiers: [{ name: "Suuri" }],
        note: "Ei sipulia",
      },
    ],
  }) as StaffOrder;
let rows: StaffOrder[];
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("next_user_id", "7");
  rows = [row(51), row(52, "PREPARING", 8)];
  mocks.get.mockImplementation(async (path, options) => {
    if (path === "/orders") {
      const results = rows
        .filter((order) => order.status === options.params.status)
        .sort((left, right) => right.id - left.id);
      return {
        data: {
          results,
          nextCursor: null,
          serverTime: "2026-10-26T12:00:00.000Z",
          sort: options.params.sort,
        },
      };
    }
    return { data: { results: [] } };
  });
  mocks.patch.mockImplementation(async (path) => {
    const id = Number(path.split("/")[2]);
    const ready = rows.find((order) => order.id === id)!;
    const served = { ...ready, status: "SERVED", version: ready.version + 1 };
    rows = rows.map((order) =>
      order.id === id ? (served as StaffOrder) : order,
    );
    return { data: { result: served } };
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function openQr() {
  render(<SentOrdersPage />);
  await tick();
  fireEvent.click(screen.getByRole("button", { name: "QR-tilaukset" }));
  await tick();
}

it("puts QR next to Mukaan in the same panel and preserves Counter table filters when switching", async () => {
  render(<SentOrdersPage />);
  await tick();
  expect(mocks.get.mock.calls.some(([path]) => path === "/orders")).toBe(false);
  const choices = screen.getByRole("group", { name: "Tilaustapa" });
  expect(
    within(choices)
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["Paikan päällä", "Mukaan", "QR-tilaukset"]);
  fireEvent.change(screen.getByLabelText("Pöytä"), { target: { value: "4" } });
  await tick();
  fireEvent.click(screen.getByRole("button", { name: "QR-tilaukset" }));
  await tick();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByLabelText("Pöytä")).toBeNull();
  expect(
    screen.getByRole("heading", { name: /Pöytä 2 · QR #51/ }),
  ).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: /Pöytä 8 · QR #52/ }),
  ).toBeTruthy();
  expect(screen.getByText(/1 × Soup 51 · Suuri/)).toBeTruthy();
  expect(screen.getAllByText("Huom: Ei sipulia")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Paikan päällä" }));
  await tick();
  expect((screen.getByLabelText("Pöytä") as HTMLInputElement).value).toBe("4");
  expect(mocks.get).toHaveBeenLastCalledWith(
    "/counterOrder/sent",
    expect.objectContaining({ params: { tableNo: 4, view: "active" } }),
  );
});

it("serves only READY orders with their displayed version once and removes them from the queue", async () => {
  await openQr();
  expect(
    screen.queryByRole("button", { name: "Merkitse tarjoilluksi: tilaus #52" }),
  ).toBeNull();
  const serve = screen.getByRole("button", {
    name: "Merkitse tarjoilluksi: tilaus #51",
  });
  await act(async () => {
    fireEvent.click(serve);
    fireEvent.click(serve);
  });
  expect(mocks.patch).toHaveBeenCalledExactlyOnceWith("/orders/51/serve", {
    expectedVersion: 4,
  });
  expect(screen.queryByRole("heading", { name: /QR #51/ })).toBeNull();
  await tick(5_000);
  expect(screen.queryByRole("heading", { name: /QR #51/ })).toBeNull();
  expect(mocks.post).not.toHaveBeenCalled();
});

it("polls new QR orders while selected and refreshes the displayed QR view from the header", async () => {
  await openQr();
  rows.push(row(53, "READY", 10));
  await tick(5_000);
  expect(
    screen.getByRole("heading", { name: /Pöytä 10 · QR #53/ }),
  ).toBeTruthy();
  rows = [];
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Päivitä" })),
  );
  expect(screen.getByText("Ei keskeneräisiä tilauksia.")).toBeTruthy();
});

it("loads later active cursor pages so READY orders beyond the first page remain available", async () => {
  mocks.get.mockImplementation(async (path, options) => {
    if (path !== "/orders") return { data: { results: [] } };
    const ready = options.params.status === "READY";
    return {
      data: {
        results: ready ? [row(options.params.cursor ? 151 : 51)] : [],
        nextCursor: ready && !options.params.cursor ? "more-ready" : null,
        serverTime: "2026-10-26T12:00:00.000Z",
      },
    };
  });
  await openQr();
  expect(
    screen.getByRole("button", { name: "Merkitse tarjoilluksi: tilaus #151" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Merkitse tarjoilluksi: tilaus #51" }),
  ).toBeTruthy();
});

it("does not restore an already served order from an older READY snapshot", async () => {
  await openQr();
  mocks.patch.mockResolvedValueOnce({
    data: { result: { id: 51, version: 5, status: "SERVED" } },
  });
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Merkitse tarjoilluksi: tilaus #51" }),
    ),
  );
  await tick(5_000);
  expect(screen.queryByRole("heading", { name: /QR #51/ })).toBeNull();
});

it("retains confirmed QR rows during transient errors and retries with backoff", async () => {
  await openQr();
  mocks.get.mockRejectedValueOnce(new Error("Offline"));
  await tick(5_000);
  expect(screen.getByRole("heading", { name: /QR #51/ })).toBeTruthy();
  expect(screen.getByRole("alert")).toBeTruthy();
  const calls = mocks.get.mock.calls.length;
  await tick(5_000);
  expect(mocks.get).toHaveBeenCalledTimes(calls);
  await tick(5_000);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("keeps a READY order visible on rejected serving and allows retry with the current version", async () => {
  await openQr();
  mocks.patch.mockRejectedValueOnce({
    isAxiosError: true,
    response: { status: 409 },
  });
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Merkitse tarjoilluksi: tilaus #51" }),
    ),
  );
  expect(screen.getByRole("heading", { name: /QR #51/ })).toBeTruthy();
  expect(screen.getByRole("alert")).toBeTruthy();
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Merkitse tarjoilluksi: tilaus #51" }),
    ),
  );
  expect(screen.queryByRole("heading", { name: /QR #51/ })).toBeNull();
});

it("clears a stale READY row when another employee served it before a conflict refresh", async () => {
  await openQr();
  rows = [row(51, "SERVED")];
  mocks.patch.mockRejectedValueOnce({
    isAxiosError: true,
    response: { status: 409 },
  });
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Merkitse tarjoilluksi: tilaus #51" }),
    ),
  );
  expect(screen.queryByRole("heading", { name: /QR #51/ })).toBeNull();
  expect(screen.getByRole("alert")).toBeTruthy();
});

it("keeps QR focused on active work without history, status filters or page controls", async () => {
  await openQr();
  expect(screen.queryByRole("button", { name: "Historia" })).toBeNull();
  expect(screen.queryByRole("group", { name: "Tilausnäkymä" })).toBeNull();
  expect(screen.queryByLabelText("Tila")).toBeNull();
  expect(
    screen.queryByRole("navigation", { name: "QR-tilausten sivut" }),
  ).toBeNull();
  expect(
    mocks.get.mock.calls
      .filter(([path]) => path === "/orders")
      .every(
        ([, options]) =>
          ["SUBMITTED", "CONFIRMED", "PREPARING", "READY"].includes(
            options.params.status,
          ) && !options.params.sort,
      ),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Mukaan" }));
  await tick();
  expect(screen.getByRole("button", { name: "Historia" })).toBeTruthy();
});

it.each([401, 403])(
  "clears QR rows and stops polling after access is denied with %s",
  async (status) => {
    await openQr();
    mocks.get.mockRejectedValue({ isAxiosError: true, response: { status } });
    await tick(5_000);
    expect(screen.queryByRole("heading", { name: /QR #51/ })).toBeNull();
    const calls = mocks.get.mock.calls.length;
    await tick(60_000);
    expect(mocks.get).toHaveBeenCalledTimes(calls);
  },
);

it("ignores a QR response that completes after switching back to Mukaan", async () => {
  render(<SentOrdersPage />);
  await tick();
  let finish!: (value: unknown) => void;
  let oldSignal!: AbortSignal;
  mocks.get.mockImplementationOnce((_path, options) => {
    oldSignal = options.signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  fireEvent.click(screen.getByRole("button", { name: "QR-tilaukset" }));
  await tick();
  fireEvent.click(screen.getByRole("button", { name: "Mukaan" }));
  await tick();
  expect(oldSignal.aborted).toBe(true);
  await act(async () =>
    finish({
      data: {
        results: [row(99)],
        nextCursor: null,
        serverTime: "2026-10-26T12:00:00.000Z",
      },
    }),
  );
  expect(screen.queryByRole("heading", { name: /QR #99/ })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Mukaan" }).getAttribute("aria-pressed"),
  ).toBe("true");
});
