import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WaiterPage from "@/app/backoffice/waiter/page";
import type { StaffOrder } from "@/app/backoffice/orders/inbox/_lib/staff-orders";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  loadSetup: vi.fn(),
  loadQueues: vi.fn(),
  openTable: vi.fn(),
  sendOrder: vi.fn(),
  serveOrder: vi.fn(),
  cancelOrder: vi.fn(),
  loadCalls: vi.fn(),
  changeCall: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ default: { get: mocks.get } }));

vi.mock("@/lib/service-calls", () => ({
  loadStaffServiceCalls: mocks.loadCalls,
  changeServiceCallStatus: mocks.changeCall,
  serviceCallErrorText: () => "Yhteys epäonnistui.",
}));

vi.mock("@/lib/waiter-orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/waiter-orders")>()),
  loadWaiterSetup: mocks.loadSetup,
  loadWaiterOrders: mocks.loadQueues,
  loadWaiterSnapshot: async (signal: AbortSignal) => ({
    results: await mocks.loadQueues(signal),
    serverTime: new Date().toISOString(),
  }),
  openWaiterTable: mocks.openTable,
  sendWaiterOrder: mocks.sendOrder,
  serveWaiterOrder: mocks.serveOrder,
  cancelWaiterOrder: mocks.cancelOrder,
}));

const incoming: StaffOrder = {
  id: 31,
  channel: "QR",
  serviceType: "DINE_IN",
  status: "SUBMITTED",
  version: 1,
  tableNo: 4,
  tableSessionId: 11,
  total: 20,
  submittedAt: "2026-09-29T12:00:00.000Z",
  confirmedAt: null,
  rejectedAt: null,
  preparingAt: null,
  readyAt: null,
  servedAt: null,
  paidAt: null,
  completedAt: null,
  cancelledAt: null,
  updatedAt: "2026-09-29T12:00:00.000Z",
  rejectionReason: null,
  cancellationReason: null,
  items: [
    { name: "Soup", quantity: 1, note: null, lineTotal: 20, modifiers: [] },
  ],
};
const ready: StaffOrder = {
  ...incoming,
  id: 32,
  channel: "STAFF",
  status: "READY",
  version: 4,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadSetup.mockResolvedValue({
    tables: [{ id: 7, tableNo: 4, name: null, openSession: null }],
    categories: [
      {
        id: 2,
        name: "Food",
        food: [{ id: 5, name: "Soup", price: 20, foodTypeId: 2 }],
        foodSizes: [],
        tastes: [],
      },
    ],
  });
  mocks.loadQueues.mockResolvedValue([incoming, ready]);
  mocks.openTable.mockResolvedValue(11);
  mocks.sendOrder.mockResolvedValue({ id: 33 });
  mocks.serveOrder.mockResolvedValue({
    ...ready,
    version: 5,
    status: "SERVED",
  });
  mocks.cancelOrder.mockResolvedValue({ ...incoming, status: "CANCELLED" });
  mocks.loadCalls.mockResolvedValue([]);
});

it("requires a reason and confirmation before cancelling and refreshes the queue", async () => {
  const user = userEvent.setup();
  render(<WaiterPage />);
  await screen.findByText("Pöytä 4 · Tilaus #31");
  await user.click(screen.getAllByRole("button", { name: "Peru tilaus" })[0]);
  const confirm = screen.getByRole("button", { name: "Vahvista peruutus" });
  expect((confirm as HTMLButtonElement).disabled).toBe(true);
  await user.type(screen.getByLabelText("Peruutuksen syy"), "Asiakkaan pyyntö");
  mocks.loadQueues.mockResolvedValue([ready]);
  await user.click(confirm);
  await waitFor(() =>
    expect(mocks.cancelOrder).toHaveBeenCalledWith(
      incoming,
      "Asiakkaan pyyntö",
    ),
  );
  await waitFor(() =>
    expect(screen.queryByText("Pöytä 4 · Tilaus #31")).toBeNull(),
  );
  expect(screen.getByRole("status").textContent).toContain(
    "Tilaus #31 peruttiin.",
  );
});

it("offers cancellation only before preparation and payment", async () => {
  mocks.loadQueues.mockResolvedValue([
    { ...ready, paidAt: "2026-09-30T12:00:00.000Z" },
    { ...incoming, id: 40, status: "CONFIRMED" },
    { ...incoming, id: 41, status: "PREPARING" },
    { ...incoming, id: 42, status: "SERVED" },
  ]);
  render(<WaiterPage />);
  for (const id of [40]) {
    const row = (await screen.findByText(`Pöytä 4 · Tilaus #${id}`)).closest(
      "li",
    )!;
    expect(
      within(row).getByRole("button", { name: "Peru tilaus" }),
    ).toBeTruthy();
  }
  for (const id of [41, 32]) {
    const row = screen.getByText(`Pöytä 4 · Tilaus #${id}`).closest("li")!;
    expect(
      within(row).queryByRole("button", { name: "Peru tilaus" }),
    ).toBeNull();
  }
  expect(screen.getByText("QR · Valmistelussa")).toBeTruthy();
  expect(screen.queryByText("Pöytä 4 · Tilaus #42")).toBeNull();
});

it("refreshes stale cancellation without showing success or keeping a retry dialog", async () => {
  const user = userEvent.setup();
  mocks.cancelOrder.mockRejectedValue(new Error("Tilaus muuttui."));
  render(<WaiterPage />);
  await screen.findByText("Pöytä 4 · Tilaus #31");
  await user.click(screen.getAllByRole("button", { name: "Peru tilaus" })[0]);
  await user.type(screen.getByLabelText("Peruutuksen syy"), "Asiakkaan pyyntö");
  mocks.loadQueues.mockResolvedValue([
    ready,
    { ...incoming, status: "PREPARING", version: 3 },
  ]);
  await user.click(screen.getByRole("button", { name: "Vahvista peruutus" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
  const row = screen.getByText("Pöytä 4 · Tilaus #31").closest("li")!;
  expect(within(row).queryByRole("button", { name: "Peru tilaus" })).toBeNull();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("handles service calls in a dialog without navigation or losing the order draft", async () => {
  const user = userEvent.setup();
  const call = {
    id: 9,
    tableNo: 4,
    status: "REQUESTED",
    version: 1,
    createdAt: "2026-09-30T12:00:00.000Z",
    acknowledgedAt: null,
    resolvedAt: null,
  };
  mocks.loadCalls.mockResolvedValue([call]);
  render(<WaiterPage />);
  await screen.findByText("Pöytä 4 · Tilaus #31");
  await user.type(screen.getByLabelText("Huomautus"), "Ei sipulia");
  const originalUrl = window.location.href;
  expect(screen.queryByRole("link", { name: "Palvelukutsut" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Palvelukutsut" }));
  expect(
    await screen.findByRole("dialog", { name: "Palvelukutsut" }),
  ).toBeTruthy();
  expect(await screen.findByText("Pöytä P4")).toBeTruthy();
  const acknowledged = { ...call, status: "ACKNOWLEDGED", version: 2 };
  mocks.loadCalls.mockResolvedValue([acknowledged]);
  await user.click(screen.getByRole("button", { name: "Ota vastaan" }));
  await waitFor(() =>
    expect(mocks.changeCall).toHaveBeenCalledWith(call, "ACKNOWLEDGED"),
  );
  const resolve = await screen.findByRole("button", {
    name: "Merkitse hoidetuksi",
  });
  mocks.loadCalls.mockResolvedValue([]);
  await user.click(resolve);
  await waitFor(() =>
    expect(mocks.changeCall).toHaveBeenCalledWith(acknowledged, "RESOLVED"),
  );
  await screen.findByText("Avoimia palvelukutsuja ei ole.");
  await user.click(screen.getByRole("button", { name: "Sulje" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(window.location.href).toBe(originalUrl);
  expect(
    (screen.getByLabelText("Huomautus") as HTMLTextAreaElement).value,
  ).toBe("Ei sipulia");
});

it("takes a table order and tracks progress without a waiter QR confirmation task", async () => {
  const user = userEvent.setup();
  render(<WaiterPage />);
  expect(await screen.findByText("Pöytä 4 · Tilaus #31")).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Tilausten seuranta (2)" }),
  ).toBeTruthy();
  expect(screen.queryByText("Saapuneet tilaukset")).toBeNull();
  expect(screen.queryByText("Valmiit tarjoiltavaksi")).toBeNull();
  expect(screen.queryByRole("button", { name: "Vahvista" })).toBeNull();
  const progress = screen.getByRole("list", {
    name: "Tilauksen #32 eteneminen",
  });
  expect(within(progress).getAllByRole("listitem")).toHaveLength(5);
  expect(
    progress.querySelector('[aria-current="step"]')?.textContent,
  ).toContain("Valmis");
  const waiting = screen.getByText("Pöytä 4 · Tilaus #31").closest("li")!;
  expect(within(waiting).getByText("QR · Odottaa vahvistusta")).toBeTruthy();
  expect(
    within(waiting).queryByRole("button", { name: "Merkitse tarjoilluksi" }),
  ).toBeNull();
  await user.selectOptions(screen.getByLabelText("Tuote"), "5");
  await user.click(screen.getByRole("button", { name: "Lisää tilaukseen" }));
  await user.click(screen.getByRole("button", { name: "Lähetä keittiöön" }));
  await waitFor(() => expect(mocks.sendOrder).toHaveBeenCalled());
  expect(mocks.openTable).toHaveBeenCalledWith(7);
  expect(mocks.sendOrder.mock.calls[0][0]).toBe(11);
  expect(mocks.sendOrder.mock.calls[0][1]).toEqual([
    { foodId: 5, foodSizeId: null, tasteId: null, quantity: 1, note: "" },
  ]);
  expect(mocks.sendOrder.mock.calls[0][3]).toBe(20);
  await user.click(
    screen.getByRole("button", { name: "Merkitse tarjoilluksi" }),
  );
  await waitFor(() => expect(mocks.serveOrder).toHaveBeenCalledWith(ready));
  await waitFor(() =>
    expect(screen.queryByText("Pöytä 4 · Tilaus #32")).toBeNull(),
  );
  expect(
    screen.getByRole("heading", { name: "Tilausten seuranta (1)" }),
  ).toBeTruthy();
});

it("keeps the ready order visible if serving fails", async () => {
  mocks.serveOrder.mockRejectedValue(new Error("Tallennus epäonnistui."));
  const user = userEvent.setup();
  render(<WaiterPage />);
  await user.click(
    await screen.findByRole("button", { name: "Merkitse tarjoilluksi" }),
  );
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.getByText("Pöytä 4 · Tilaus #32")).toBeTruthy();
});

it("discards a delayed READY read after serving and coalesces the post-action refresh", async () => {
  const user = userEvent.setup();
  render(<WaiterPage />);
  await screen.findByText("Pöytä 4 · Tilaus #32");
  let resolveOld!: (orders: StaffOrder[]) => void;
  let oldSignal!: AbortSignal;
  mocks.loadQueues.mockImplementationOnce((signal: AbortSignal) => {
    oldSignal = signal;
    return new Promise<StaffOrder[]>((resolve) => {
      resolveOld = resolve;
    });
  });
  await user.click(screen.getByRole("button", { name: "Päivitä tilaukset" }));
  await user.click(
    screen.getByRole("button", { name: "Merkitse tarjoilluksi" }),
  );
  await waitFor(() => expect(oldSignal.aborted).toBe(true));
  expect(screen.queryByText("Pöytä 4 · Tilaus #32")).toBeNull();
  await act(async () => resolveOld([incoming, ready]));
  await waitFor(() => expect(mocks.loadQueues).toHaveBeenCalledTimes(3));
  expect(screen.queryByText("Pöytä 4 · Tilaus #32")).toBeNull();
  expect(screen.getByText("Pöytä 4 · Tilaus #31")).toBeTruthy();
});

it("does not restore access from an older setup read after queue permission is revoked", async () => {
  let release!: (setup: unknown) => void;
  mocks.loadSetup.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  mocks.loadQueues.mockRejectedValueOnce({
    isAxiosError: true,
    response: { status: 403 },
  });
  render(<WaiterPage />);
  await screen.findByRole("heading", { name: "Pääsy estetty" });
  await act(async () =>
    release({ tables: [{ id: 7, tableNo: 4 }], categories: [] }),
  );
  expect(screen.getByRole("heading", { name: "Pääsy estetty" })).toBeTruthy();
  expect(screen.queryByText("Pöytä 4")).toBeNull();
});
