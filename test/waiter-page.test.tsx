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
import WaiterEntryPage from "@/app/backoffice/waiter/page";
import WaiterTrackingPage from "@/app/backoffice/waiter/tracking/page";
import WaiterLayout from "@/app/backoffice/waiter/layout";
import type { StaffOrder } from "@/lib/orders/contracts";

const mocks = vi.hoisted(() => ({
  pathname: "/backoffice/waiter",
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

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));

function waiterPage(tracking = false) {
  mocks.pathname = tracking
    ? "/backoffice/waiter/tracking"
    : "/backoffice/waiter";
  return (
    <WaiterLayout>
      {tracking ? <WaiterTrackingPage /> : <WaiterEntryPage />}
    </WaiterLayout>
  );
}

vi.mock("@/lib/api", () => ({ default: { get: mocks.get } }));

vi.mock("@/lib/service-calls", () => ({
  loadStaffServiceCalls: mocks.loadCalls,
  changeServiceCallStatus: mocks.changeCall,
  serviceCallErrorText: () => "Yhteys epäonnistui.",
}));

vi.mock("@/lib/waiter-orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/waiter-orders")>()),
  loadWaiterSetup: mocks.loadSetup,
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
  localStorage.clear();
  localStorage.setItem("mytokenfornextjsproject", "test-token");
  localStorage.setItem("next_name", "Waiter");
  localStorage.setItem("next_user_id", "7");
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
  render(waiterPage(true));
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
  render(waiterPage(true));
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
  expect(screen.getByText("QR · Valmistetaan")).toBeTruthy();
  expect(screen.queryByText("Pöytä 4 · Tilaus #42")).toBeNull();
});

it("refreshes stale cancellation without showing success or keeping a retry dialog", async () => {
  const user = userEvent.setup();
  mocks.cancelOrder.mockRejectedValue(new Error("Tilaus muuttui."));
  render(waiterPage(true));
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

it("shows sending while opening the table and awaiting confirmation without an uncertain-outcome warning", async () => {
  let openTable!: (sessionId: number) => void;
  let confirmOrder!: (order: { id: number }) => void;
  mocks.openTable.mockReturnValueOnce(
    new Promise<number>((resolve) => {
      openTable = resolve;
    }),
  );
  mocks.sendOrder.mockReturnValueOnce(
    new Promise<{ id: number }>((resolve) => {
      confirmOrder = resolve;
    }),
  );
  const user = userEvent.setup();
  const view = render(waiterPage());
  await screen.findByLabelText("Tuote");
  await user.selectOptions(screen.getByLabelText("Tuote"), "5");
  await user.click(screen.getByRole("button", { name: "Lisää tilaukseen" }));
  await user.click(screen.getByRole("button", { name: "Lähetä keittiöön" }));
  expect(screen.getByRole("status").textContent).toContain(
    "Tilausta lähetetään.",
  );
  expect(screen.queryByText(/lähetyksen tulos on epävarma/)).toBeNull();
  expect(mocks.sendOrder).not.toHaveBeenCalled();
  await act(async () => openTable(11));
  await waitFor(() => expect(mocks.sendOrder).toHaveBeenCalledTimes(1));
  const saved = JSON.parse(
    localStorage.getItem("pending-request:v1:7:waiter-order")!,
  );
  expect(saved.idempotencyKey).toBe(mocks.sendOrder.mock.calls[0][2]);
  expect(
    (screen.getByRole("button", { name: "Lähetetään…" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  view.rerender(waiterPage(true));
  expect(screen.getByRole("status").textContent).toContain(
    "Tilausta lähetetään.",
  );
  expect(screen.queryByText(/lähetyksen tulos on epävarma/)).toBeNull();
  expect(
    screen.queryByRole("link", { name: "Avaa tilauksen palautus" }),
  ).toBeNull();
  let refreshQueue!: (orders: StaffOrder[]) => void;
  mocks.loadQueues.mockReturnValueOnce(
    new Promise<StaffOrder[]>((resolve) => {
      refreshQueue = resolve;
    }),
  );
  await act(async () => confirmOrder({ id: 33 }));
  await screen.findByText("Tilaus #33 lähetettiin keittiöön.");
  expect(
    screen.queryByText("Tilausta lähetetään. Odota vahvistusta."),
  ).toBeNull();
  expect(localStorage.getItem("pending-request:v1:7:waiter-order")).toBeNull();
  await act(async () => refreshQueue([incoming, ready]));
});

it("recovers an unknown order after reload with the original session, price, items and key", async () => {
  let confirmRetry!: (order: { id: number }) => void;
  mocks.sendOrder
    .mockRejectedValueOnce({ response: { status: 500 } })
    .mockReturnValueOnce(
      new Promise<{ id: number }>((resolve) => {
        confirmRetry = resolve;
      }),
    );
  const user = userEvent.setup();
  const view = render(waiterPage());
  await screen.findByLabelText("Tuote");
  await user.selectOptions(screen.getByLabelText("Tuote"), "5");
  await user.click(screen.getByRole("button", { name: "Lisää tilaukseen" }));
  await user.click(screen.getByRole("button", { name: "Lähetä keittiöön" }));
  await screen.findByText(/lähetyksen tulos on epävarma/);
  expect(
    screen.queryByText("Tilausta lähetetään. Odota vahvistusta."),
  ).toBeNull();
  const original = mocks.sendOrder.mock.calls[0];
  expect(screen.queryByText("Tilaus #33 lähetettiin keittiöön.")).toBeNull();
  view.unmount();
  mocks.loadSetup.mockResolvedValue({
    tables: [{ id: 7, tableNo: 4, openSession: { id: 99 } }],
    categories: [
      {
        id: 2,
        name: "Food",
        food: [{ id: 5, name: "Soup", price: 99, foodTypeId: 2 }],
        foodSizes: [],
        tastes: [],
      },
    ],
  });
  render(waiterPage());
  const retry = await screen.findByRole("button", {
    name: "Tarkista aiempi lähetys",
  });
  await waitFor(() =>
    expect((retry as HTMLButtonElement).disabled).toBe(false),
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Lisää tilaukseen",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(screen.getByText(/lähetyksen tulos on epävarma/)).toBeTruthy();
  await user.click(retry);
  expect(screen.getByRole("status").textContent).toContain(
    "Tilausta lähetetään.",
  );
  expect(screen.queryByText(/lähetyksen tulos on epävarma/)).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Lähetetään…" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await act(async () => confirmRetry({ id: 33 }));
  await screen.findByText("Tilaus #33 lähetettiin keittiöön.");
  expect(mocks.sendOrder.mock.calls[1]).toEqual(original);
  expect(mocks.openTable).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("pending-request:v1:7:waiter-order")).toBeNull();
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
  const view = render(waiterPage());
  await screen.findByLabelText("Tuote");
  await user.type(screen.getByLabelText("Huomautus"), "Ei sipulia");
  expect(
    within(screen.getByRole("button", { name: "Palvelukutsut" })).getByRole(
      "status",
    ),
  ).toBeTruthy();
  const callReads = mocks.loadCalls.mock.calls.length;
  view.rerender(waiterPage(true));
  expect(
    within(screen.getByRole("button", { name: "Palvelukutsut" })).getByRole(
      "status",
    ),
  ).toBeTruthy();
  view.rerender(waiterPage());
  expect(mocks.loadCalls).toHaveBeenCalledTimes(callReads);
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
  expect(
    within(
      screen.getByLabelText("Palvelukutsut", { selector: "button" }),
    ).queryByRole("status", { hidden: true }),
  ).toBeNull();
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
  const view = render(waiterPage(true));
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
  expect(within(waiting).getByText("QR · Lähetetty")).toBeTruthy();
  expect(
    within(waiting).queryByRole("button", { name: "Merkitse tarjoilluksi" }),
  ).toBeNull();
  view.rerender(waiterPage());
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
  view.rerender(waiterPage(true));
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

it("shows takeaway pickup numbers and removes a prepaid order only after saved completion", async () => {
  const takeaway: StaffOrder = {
    ...ready,
    id: 40,
    channel: "COUNTER",
    serviceType: "TAKEAWAY",
    tableNo: null,
    tableSessionId: null,
    paidAt: "2026-10-15T12:00:00.000Z",
  };
  const preparing = { ...takeaway, id: 41, status: "PREPARING" as const };
  mocks.loadQueues.mockResolvedValue([incoming, takeaway, preparing]);
  let finish!: (order: StaffOrder) => void;
  mocks.serveOrder.mockImplementationOnce(
    () =>
      new Promise<StaffOrder>((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  render(waiterPage(true));
  const card = (await screen.findByText("Mukaan · Nouto #40")).closest("li")!;
  expect(screen.getByText("Pöytä 4 · Tilaus #31")).toBeTruthy();
  expect(within(card).queryByText(/Pöytä/)).toBeNull();
  expect(
    within(card).queryByRole("button", { name: "Peru tilaus" }),
  ).toBeNull();
  expect(
    within(screen.getByText("Mukaan · Nouto #41").closest("li")!).queryByRole(
      "button",
      { name: "Merkitse tarjoilluksi" },
    ),
  ).toBeNull();
  await user.click(
    within(card).getByRole("button", { name: "Merkitse tarjoilluksi" }),
  );
  expect(mocks.serveOrder).toHaveBeenCalledWith(takeaway);
  expect(screen.getByText("Mukaan · Nouto #40")).toBeTruthy();
  expect(
    (
      within(card).getByRole("button", {
        name: "Tallennetaan…",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await act(async () =>
    finish({ ...takeaway, version: 5, status: "COMPLETED" }),
  );
  await waitFor(() =>
    expect(screen.queryByText("Mukaan · Nouto #40")).toBeNull(),
  );
  expect(screen.getByText("Mukaan · Nouto #41")).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Tilausten seuranta (2)" }),
  ).toBeTruthy();
  expect(mocks.serveOrder).toHaveBeenCalledTimes(1);
});

it("keeps the ready order visible if serving fails", async () => {
  mocks.serveOrder.mockRejectedValue(new Error("Tallennus epäonnistui."));
  const user = userEvent.setup();
  render(waiterPage(true));
  await user.click(
    await screen.findByRole("button", { name: "Merkitse tarjoilluksi" }),
  );
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.getByText("Pöytä 4 · Tilaus #32")).toBeTruthy();
});

it("discards a delayed READY read after serving and coalesces the post-action refresh", async () => {
  const user = userEvent.setup();
  render(waiterPage(true));
  await screen.findByText("Pöytä 4 · Tilaus #32");
  let resolveOld!: (orders: StaffOrder[]) => void;
  let oldSignal!: AbortSignal;
  mocks.loadQueues.mockImplementationOnce((signal: AbortSignal) => {
    oldSignal = signal;
    return new Promise<StaffOrder[]>((resolve) => {
      resolveOld = resolve;
    });
  });
  await user.click(screen.getByRole("button", { name: "Päivitä" }));
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
  render(waiterPage());
  await screen.findByRole("heading", { name: "Pääsy estetty" });
  await act(async () =>
    release({ tables: [{ id: 7, tableNo: 4 }], categories: [] }),
  );
  expect(screen.getByRole("heading", { name: "Pääsy estetty" })).toBeTruthy();
  expect(screen.queryByText("Pöytä 4")).toBeNull();
});

const draftKey = "pending-request:v1:7:waiter-draft";
const savedDraft = {
  tableId: 7,
  items: [
    { foodId: 5, foodSizeId: 4, tasteId: 3, quantity: 2, note: "Ei sipulia" },
  ],
  foodId: 5,
  sizeId: 4,
  tasteId: 3,
  quantity: 3,
  note: "Seuraava annos",
};
function setupDraftMenu() {
  mocks.loadSetup.mockResolvedValue({
    tables: [
      { id: 7, tableNo: 4, name: null, openSession: null },
      { id: 8, tableNo: 5, name: null, openSession: null },
    ],
    categories: [
      {
        id: 2,
        name: "Food",
        food: [{ id: 5, name: "Soup", price: 12.9, foodTypeId: 2 }],
        foodSizes: [{ id: 4, name: "Iso", moneyAdded: 1.5 }],
        tastes: [{ id: 3, name: "Mieto" }],
      },
    ],
  });
}

it("keeps the full draft in memory across route changes even when storage cannot save", async () => {
  setupDraftMenu();
  localStorage.setItem(draftKey, JSON.stringify(savedDraft));
  const user = userEvent.setup();
  const view = render(waiterPage());
  await screen.findByText("Koko: Iso");
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key,
    value,
  ) {
    if (key === draftKey) throw new Error("quota");
    original.call(this, key, value);
  });
  await user.type(screen.getByLabelText("Huomautus"), " ilman suolaa");
  view.rerender(waiterPage(true));
  await screen.findByText("Pöytä 4 · Tilaus #32");
  expect(screen.queryByLabelText("Tuote")).toBeNull();
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(screen.getByText(/Luonnosta ei voitu tallentaa/)).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Avaa tilausluonnos" })
      .getAttribute("href"),
  ).toBe("/backoffice/waiter");
  await user.click(screen.getByRole("button", { name: "Palvelukutsut" }));
  await screen.findByText("Avoimia palvelukutsuja ei ole.");
  await user.keyboard("{Escape}");
  view.rerender(waiterPage());
  expect(
    (screen.getByLabelText("Huomautus") as HTMLTextAreaElement).value,
  ).toBe("Seuraava annos ilman suolaa");
  expect((screen.getByLabelText("Pöytä") as HTMLSelectElement).value).toBe("7");
  expect((screen.getByLabelText("Koko") as HTMLSelectElement).value).toBe("4");
  expect((screen.getByLabelText("Valinta") as HTMLSelectElement).value).toBe(
    "3",
  );
  expect((screen.getByLabelText("Määrä") as HTMLInputElement).value).toBe("3");
  expect(screen.getByText("Koko: Iso")).toBeTruthy();
  expect(screen.getByText(/Luonnosta ei voitu tallentaa/)).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Merkitse tarjoilluksi" }),
  ).toBeNull();
  expect(mocks.loadSetup).toHaveBeenCalledTimes(1);
  expect(mocks.loadQueues).toHaveBeenCalledTimes(1);
  expect(mocks.sendOrder).not.toHaveBeenCalled();
});

it("keeps an in-flight order across navigation and retries only the exact original request after an unknown result", async () => {
  setupDraftMenu();
  localStorage.setItem(draftKey, JSON.stringify(savedDraft));
  let reject!: (cause: unknown) => void;
  mocks.sendOrder.mockImplementationOnce(
    () =>
      new Promise((_, rejectRequest) => {
        reject = rejectRequest;
      }),
  );
  const user = userEvent.setup();
  const view = render(waiterPage());
  await screen.findByText("Koko: Iso");
  await user.click(screen.getByRole("button", { name: "Lähetä keittiöön" }));
  await waitFor(() => expect(mocks.sendOrder).toHaveBeenCalledTimes(1));
  const sent = mocks.sendOrder.mock.calls[0];
  view.rerender(waiterPage(true));
  expect(screen.getByRole("status").textContent).toContain(
    "Tilausta lähetetään.",
  );
  expect(
    screen.queryByRole("link", { name: "Avaa tilauksen palautus" }),
  ).toBeNull();
  view.rerender(waiterPage());
  expect((screen.getByLabelText("Tuote") as HTMLSelectElement).disabled).toBe(
    true,
  );
  expect(
    (
      screen.getByRole("button", {
        name: /lähetys|lähet/i,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await act(async () => reject({ response: { status: 500 } }));
  view.rerender(waiterPage(true));
  expect(
    screen
      .getByRole("link", { name: "Avaa tilauksen palautus" })
      .getAttribute("href"),
  ).toBe("/backoffice/waiter");
  view.unmount();
  render(waiterPage(true));
  await screen.findByRole("link", { name: "Avaa tilauksen palautus" });
  expect(mocks.sendOrder).toHaveBeenCalledTimes(1);
  cleanup();
  render(waiterPage());
  await user.click(
    await screen.findByRole("button", { name: "Tarkista aiempi lähetys" }),
  );
  await screen.findByText("Tilaus #33 lähetettiin keittiöön.");
  expect(mocks.sendOrder.mock.calls[1]).toEqual(sent);
  expect(mocks.openTable).toHaveBeenCalledTimes(1);
});

it("preserves a stored draft when tracking is the initial page and restores it on returning to entry", async () => {
  setupDraftMenu();
  localStorage.setItem(draftKey, JSON.stringify(savedDraft));
  const view = render(waiterPage(true));
  await screen.findByText("Pöytä 4 · Tilaus #32");
  expect(screen.queryByLabelText("Pöytä")).toBeNull();
  expect(JSON.parse(localStorage.getItem(draftKey)!)).toEqual(savedDraft);
  view.rerender(waiterPage());
  expect(screen.getByText("Koko: Iso")).toBeTruthy();
  expect(
    (screen.getByLabelText("Huomautus") as HTMLTextAreaElement).value,
  ).toBe(savedDraft.note);
  expect(mocks.loadSetup).toHaveBeenCalledTimes(1);
});

it("restores the table, items, modifiers and unfinished form after reload with current EUR prices", async () => {
  setupDraftMenu();
  const user = userEvent.setup();
  const view = render(waiterPage());
  await screen.findByLabelText("Tuote");
  await user.selectOptions(screen.getByLabelText("Pöytä"), "8");
  await user.selectOptions(screen.getByLabelText("Tuote"), "5");
  await user.selectOptions(screen.getByLabelText("Koko"), "4");
  await user.selectOptions(screen.getByLabelText("Valinta"), "3");
  await user.clear(screen.getByLabelText("Määrä"));
  await user.type(screen.getByLabelText("Määrä"), "2");
  await user.type(screen.getByLabelText("Huomautus"), "Ei sipulia");
  await user.click(screen.getByRole("button", { name: "Lisää tilaukseen" }));
  await user.type(screen.getByLabelText("Huomautus"), "Seuraava annos");
  expect(screen.getByText("Koko: Iso")).toBeTruthy();
  expect(screen.getByText("Valinta: Mieto")).toBeTruthy();
  view.unmount();
  render(waiterPage());
  await screen.findByText("Koko: Iso");
  expect((screen.getByLabelText("Pöytä") as HTMLSelectElement).value).toBe("8");
  expect((screen.getByLabelText("Koko") as HTMLSelectElement).value).toBe("4");
  expect((screen.getByLabelText("Valinta") as HTMLSelectElement).value).toBe(
    "3",
  );
  expect((screen.getByLabelText("Huomautus") as HTMLInputElement).value).toBe(
    "Seuraava annos",
  );
  expect(screen.getByText(/Arvio.*28,80/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Lähetä keittiöön" }));
  await screen.findByText("Tilaus #33 lähetettiin keittiöön.");
  expect(mocks.openTable).toHaveBeenCalledWith(8);
  expect(mocks.sendOrder.mock.calls[0][1]).toEqual([
    { foodId: 5, foodSizeId: 4, tasteId: 3, quantity: 2, note: "Ei sipulia" },
  ]);
  expect(mocks.sendOrder.mock.calls[0][3]).toBe(28.8);
  expect(localStorage.getItem(draftKey)).toBeNull();
  expect(localStorage.getItem("pending-request:v1:7:waiter-order")).toBeNull();
});

it("cancels a table switch without losing the draft, then discards only after confirmation", async () => {
  setupDraftMenu();
  localStorage.setItem(draftKey, JSON.stringify(savedDraft));
  const user = userEvent.setup();
  render(waiterPage());
  await screen.findByText("Koko: Iso");
  await user.selectOptions(screen.getByLabelText("Pöytä"), "8");
  await screen.findByRole("alertdialog");
  expect((screen.getByLabelText("Pöytä") as HTMLSelectElement).value).toBe("7");
  expect(JSON.parse(localStorage.getItem(draftKey)!).items).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Jatka luonnosta" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect((screen.getByLabelText("Huomautus") as HTMLInputElement).value).toBe(
    "Seuraava annos",
  );
  await user.selectOptions(screen.getByLabelText("Pöytä"), "8");
  await user.click(screen.getByRole("button", { name: "Poista luonnos" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect((screen.getByLabelText("Pöytä") as HTMLSelectElement).value).toBe("8");
  expect(screen.queryByText("Koko: Iso")).toBeNull();
  expect(JSON.parse(localStorage.getItem(draftKey)!).items).toEqual([]);
  expect((screen.getByLabelText("Huomautus") as HTMLInputElement).value).toBe(
    "",
  );
  expect(mocks.sendOrder).not.toHaveBeenCalled();
});

it("switches an empty draft without a confirmation but warns for an unfinished form", async () => {
  setupDraftMenu();
  const user = userEvent.setup();
  render(waiterPage());
  await screen.findByLabelText("Pöytä");
  await user.selectOptions(screen.getByLabelText("Pöytä"), "8");
  expect(screen.queryByRole("alertdialog")).toBeNull();
  await user.type(screen.getByLabelText("Huomautus"), "Ei sipulia");
  await user.selectOptions(screen.getByLabelText("Pöytä"), "7");
  expect(await screen.findByRole("alertdialog")).toBeTruthy();
  expect((screen.getByLabelText("Pöytä") as HTMLSelectElement).value).toBe("8");
});

it("keeps draft and table intact if confirmed discarding cannot persist", async () => {
  setupDraftMenu();
  localStorage.setItem(draftKey, JSON.stringify(savedDraft));
  const user = userEvent.setup();
  render(waiterPage());
  await screen.findByText("Koko: Iso");
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key,
    value,
  ) {
    if (key === draftKey) throw new Error("quota");
    original.call(this, key, value);
  });
  await user.selectOptions(screen.getByLabelText("Pöytä"), "8");
  await user.click(screen.getByRole("button", { name: "Poista luonnos" }));
  const dialog = screen.getByRole("alertdialog");
  expect(within(dialog).getByRole("alert").textContent).toContain(
    "säilytettiin",
  );
  expect(JSON.parse(localStorage.getItem(draftKey)!)).toEqual(savedDraft);
  expect((screen.getByLabelText("Pöytä") as HTMLSelectElement).value).toBe("7");
});

it("warns on unavailable storage and can retry saving the in-memory draft", async () => {
  const original = Storage.prototype.setItem;
  const write = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(function (this: Storage, key, value) {
      if (key === draftKey) throw new Error("quota");
      original.call(this, key, value);
    });
  const user = userEvent.setup();
  render(waiterPage());
  await screen.findByLabelText("Tuote");
  await user.selectOptions(screen.getByLabelText("Tuote"), "5");
  await user.click(screen.getByRole("button", { name: "Lisää tilaukseen" }));
  expect(screen.getByText(/Luonnosta ei voitu tallentaa/)).toBeTruthy();
  expect(
    within(
      screen.getByRole("list", { name: "Tilausluonnoksen tuotteet" }),
    ).getByText("1 × Soup"),
  ).toBeTruthy();
  write.mockRestore();
  await user.click(
    screen.getByRole("button", { name: "Yritä tallentaa uudelleen" }),
  );
  expect(JSON.parse(localStorage.getItem(draftKey)!).items).toHaveLength(1);
  expect(screen.queryByText(/Luonnosta ei voitu tallentaa/)).toBeNull();
});

it("blocks malformed drafts without overwriting them and offers explicit unsent-draft recovery", async () => {
  localStorage.setItem(draftKey, "{bad");
  const user = userEvent.setup();
  render(waiterPage());
  await screen.findByText(/Tallennettua luonnosta ei voitu lukea/);
  expect((screen.getByLabelText("Tuote") as HTMLSelectElement).disabled).toBe(
    true,
  );
  expect(localStorage.getItem(draftKey)).toBe("{bad");
  await user.click(
    screen.getByRole("button", { name: "Poista tallennettu luonnos" }),
  );
  await user.click(screen.getByRole("button", { name: "Poista luonnos" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect((screen.getByLabelText("Tuote") as HTMLSelectElement).disabled).toBe(
    false,
  );
  expect(JSON.parse(localStorage.getItem(draftKey)!).items).toEqual([]);
  expect(mocks.sendOrder).not.toHaveBeenCalled();
});

it("keeps a removed table attached to its draft and blocks unavailable modifiers", async () => {
  localStorage.setItem(draftKey, JSON.stringify(savedDraft));
  mocks.loadSetup.mockResolvedValue({
    tables: [{ id: 8, tableNo: 5, openSession: null }],
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
  render(waiterPage());
  await screen.findByText(/Luonnoksen pöytä ei ole enää/);
  expect((screen.getByLabelText("Pöytä") as HTMLSelectElement).value).toBe("7");
  expect(screen.getByText("Koko: #4 · ei saatavilla")).toBeTruthy();
  expect(screen.getByText("Valinta: #3 · ei saatavilla")).toBeTruthy();
  expect(screen.getByText("Arvio ei saatavilla")).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Lähetä keittiöön",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(JSON.parse(localStorage.getItem(draftKey)!).tableId).toBe(7);
  expect(mocks.openTable).not.toHaveBeenCalled();
});

it("prefers a pending request over a conflicting draft and missing current table", async () => {
  localStorage.setItem(draftKey, JSON.stringify({ ...savedDraft, tableId: 8 }));
  const attempt = {
    tableId: 7,
    tableNo: 4,
    tableSessionId: 11,
    expectedTotal: 28.8,
    idempotencyKey: "exact-original",
    items: savedDraft.items,
  };
  localStorage.setItem(
    "pending-request:v1:7:waiter-order",
    JSON.stringify(attempt),
  );
  mocks.loadSetup.mockResolvedValue({
    tables: [{ id: 8, tableNo: 5, openSession: null }],
    categories: [],
  });
  const user = userEvent.setup();
  render(waiterPage());
  await screen.findByRole("button", { name: "Tarkista aiempi lähetys" });
  expect((screen.getByLabelText("Pöytä") as HTMLSelectElement).value).toBe("7");
  for (const label of ["Pöytä", "Tuote", "Määrä", "Huomautus"])
    expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(
      true,
    );
  await user.click(
    screen.getByRole("button", { name: "Tarkista aiempi lähetys" }),
  );
  await screen.findByText("Tilaus #33 lähetettiin keittiöön.");
  expect(mocks.sendOrder).toHaveBeenCalledWith(
    11,
    savedDraft.items,
    "exact-original",
    28.8,
  );
  expect(mocks.openTable).not.toHaveBeenCalled();
});

it("retains exact recovery if draft cleanup fails after the server confirms the order", async () => {
  setupDraftMenu();
  localStorage.setItem(draftKey, JSON.stringify(savedDraft));
  const user = userEvent.setup();
  render(waiterPage());
  await screen.findByText("Koko: Iso");
  const original = Storage.prototype.removeItem;
  const remove = vi
    .spyOn(Storage.prototype, "removeItem")
    .mockImplementation(function (this: Storage, key) {
      if (key === draftKey) throw new Error("cleanup failed");
      original.call(this, key);
    });
  await user.click(screen.getByRole("button", { name: "Lähetä keittiöön" }));
  await screen.findByRole("button", { name: "Tarkista aiempi lähetys" });
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Tarkista aiempi lähetys",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  const sent = mocks.sendOrder.mock.calls[0];
  expect(
    localStorage.getItem("pending-request:v1:7:waiter-order"),
  ).not.toBeNull();
  remove.mockRestore();
  await user.click(
    screen.getByRole("button", { name: "Tarkista aiempi lähetys" }),
  );
  await screen.findByText("Tilaus #33 lähetettiin keittiöön.");
  expect(mocks.sendOrder.mock.calls[1]).toEqual(sent);
  expect(localStorage.getItem(draftKey)).toBeNull();
});

it("does not restore another account's draft and blocks new table mutations after an account switch", async () => {
  localStorage.setItem(draftKey, JSON.stringify(savedDraft));
  localStorage.setItem("next_user_id", "8");
  const user = userEvent.setup();
  const view = render(waiterPage());
  await screen.findByLabelText("Tuote");
  expect(screen.queryByText("Koko: Iso")).toBeNull();
  view.unmount();
  localStorage.setItem("next_user_id", "7");
  setupDraftMenu();
  render(waiterPage());
  await screen.findByText("Koko: Iso");
  localStorage.setItem("next_user_id", "8");
  await user.click(screen.getByRole("button", { name: "Lähetä keittiöön" }));
  await screen.findByText(/Käyttäjä vaihtui/);
  expect(mocks.openTable).not.toHaveBeenCalled();
  expect(mocks.sendOrder).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem(draftKey)!)).toEqual(savedDraft);
});

it("retries a transient draft read without losing its original table or form", async () => {
  setupDraftMenu();
  localStorage.setItem(draftKey, JSON.stringify(savedDraft));
  const original = Storage.prototype.getItem;
  const read = vi
    .spyOn(Storage.prototype, "getItem")
    .mockImplementation(function (this: Storage, key) {
      if (key === draftKey) throw new Error("storage temporarily unavailable");
      return original.call(this, key);
    });
  const user = userEvent.setup();
  render(waiterPage());
  await screen.findByText(/Tallennettua luonnosta ei voitu lukea/);
  read.mockRestore();
  await user.click(
    screen.getByRole("button", { name: "Lue luonnos uudelleen" }),
  );
  expect(await screen.findByText("Koko: Iso")).toBeTruthy();
  expect((screen.getByLabelText("Pöytä") as HTMLSelectElement).value).toBe("7");
  expect((screen.getByLabelText("Huomautus") as HTMLInputElement).value).toBe(
    "Seuraava annos",
  );
  expect(JSON.parse(localStorage.getItem(draftKey)!)).toEqual(savedDraft);
});

it("keeps the unsent draft editable after a definite submission rejection", async () => {
  setupDraftMenu();
  localStorage.setItem(draftKey, JSON.stringify(savedDraft));
  mocks.sendOrder.mockRejectedValueOnce({ response: { status: 422 } });
  const user = userEvent.setup();
  render(waiterPage());
  await screen.findByText("Koko: Iso");
  await user.click(screen.getByRole("button", { name: "Lähetä keittiöön" }));
  await waitFor(() => expect(mocks.sendOrder).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Lisää tilaukseen",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  expect(JSON.parse(localStorage.getItem(draftKey)!)).toEqual(savedDraft);
  expect(localStorage.getItem("pending-request:v1:7:waiter-order")).toBeNull();
  expect(screen.getByText("Koko: Iso")).toBeTruthy();
});

it("removes the old draft before pending cleanup and reloads the exact request if that cleanup fails", async () => {
  setupDraftMenu();
  localStorage.setItem(draftKey, JSON.stringify(savedDraft));
  const user = userEvent.setup();
  const view = render(waiterPage());
  await screen.findByText("Koko: Iso");
  const original = Storage.prototype.removeItem;
  const remove = vi
    .spyOn(Storage.prototype, "removeItem")
    .mockImplementation(function (this: Storage, key) {
      if (key === "pending-request:v1:7:waiter-order")
        throw new Error("pending cleanup failed");
      original.call(this, key);
    });
  await user.click(screen.getByRole("button", { name: "Lähetä keittiöön" }));
  await screen.findByRole("button", { name: "Tarkista aiempi lähetys" });
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Tarkista aiempi lähetys",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  const sent = mocks.sendOrder.mock.calls[0];
  expect(localStorage.getItem(draftKey)).toBeNull();
  expect(
    localStorage.getItem("pending-request:v1:7:waiter-order"),
  ).not.toBeNull();
  remove.mockRestore();
  view.unmount();
  render(waiterPage());
  await user.click(
    await screen.findByRole("button", { name: "Tarkista aiempi lähetys" }),
  );
  await screen.findByText("Tilaus #33 lähetettiin keittiöön.");
  expect(mocks.sendOrder.mock.calls[1]).toEqual(sent);
  expect(mocks.openTable).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("pending-request:v1:7:waiter-order")).toBeNull();
});
