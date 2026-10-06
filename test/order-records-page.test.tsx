import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import OrderRecordsPage from "@/app/backoffice/orders/history/orders/page";

const orders = vi.hoisted(() => ({
  fetchOrderPages: vi.fn(),
  fetchOrderDetail: vi.fn(),
}));
vi.mock("@/lib/orders/client", () => orders);

const order = {
  id: 41,
  channel: "QR",
  status: "REJECTED",
  version: 2,
  tableNo: 8,
  tableSessionId: 19,
  total: 24,
  submittedAt: "2026-09-26T10:00:00.000Z",
  confirmedAt: null,
  rejectedAt: "2026-09-26T10:01:00.000Z",
  preparingAt: null,
  readyAt: null,
  servedAt: null,
  paidAt: null,
  completedAt: null,
  cancelledAt: null,
  updatedAt: "2026-09-26T10:01:00.000Z",
  rejectionReason: "Tuote loppui",
  cancellationReason: null,
  items: [
    { name: "Soup", quantity: 1, note: null, lineTotal: 24, modifiers: [] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  orders.fetchOrderPages.mockResolvedValue({
    results: [order],
    serverTime: "2026-09-26T10:02:00.000Z",
  });
  orders.fetchOrderDetail.mockImplementation(async (id: number) => ({
    ...order,
    id,
    history: [
      {
        fromStatus: null,
        toStatus: "SUBMITTED",
        version: 1,
        reason: null,
        actorType: "CUSTOMER",
        at: order.submittedAt,
      },
      {
        fromStatus: "SUBMITTED",
        toStatus: "REJECTED",
        version: 2,
        reason: "Tuote loppui",
        actorType: "STAFF",
        at: order.rejectedAt,
      },
    ],
  }));
});
afterEach(cleanup);

describe("HIS-01 Order records", () => {
  it("bounds history rows, opens the last-page order and resets after filtering", async () => {
    const user = userEvent.setup();
    orders.fetchOrderPages.mockResolvedValue({
      results: Array.from({ length: 101 }, (_, index) => ({
        ...order,
        id: index + 1,
      })),
      serverTime: order.updatedAt,
    });
    render(<OrderRecordsPage />);
    await screen.findByText("1–50 / 101");
    expect(screen.getAllByRole("button", { name: "Avaa" })).toHaveLength(50);
    expect(orders.fetchOrderDetail).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Seuraava" }));
    expect(screen.getByText("51–100 / 101")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Seuraava" }));
    expect(screen.getAllByRole("button", { name: "Avaa" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Avaa" }));
    expect(orders.fetchOrderDetail).toHaveBeenLastCalledWith(1);
    await screen.findByText("Tilauksen summa:", { exact: false });
    await user.click(screen.getByRole("button", { name: "Sulje" }));
    await user.selectOptions(screen.getByLabelText("Tilauskanava"), "QR");
    await screen.findByText("1–50 / 101");
    expect(screen.getAllByRole("button", { name: "Avaa" })).toHaveLength(50);
  }, 15000);
  it("keeps rejected Orders separate from receipts and filters by channel/session", async () => {
    const user = userEvent.setup();
    render(<OrderRecordsPage />);

    expect(await screen.findByText("#41", { exact: false })).toBeTruthy();
    expect(screen.getByText("Hylätty")).toBeTruthy();
    expect(
      screen.getByText(/Tilaussummat eivät ole myyntituloja/),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Tilaushistoria", level: 1 }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("navigation", { name: "Historian välilehdet" }),
    ).toBeNull();

    await user.selectOptions(screen.getByLabelText("Tilauskanava"), "QR");
    await user.type(screen.getByLabelText("Pöytäistunto"), "19");
    await waitFor(() =>
      expect(orders.fetchOrderPages).toHaveBeenLastCalledWith(
        expect.objectContaining({ channel: "QR", tableSessionId: 19 }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Avaa" }));
    expect(
      (await screen.findAllByText("Tuote loppui", { exact: false })).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("region", { name: "Tilauksen vaiheet" }),
    ).toBeTruthy();
  });

  it("rejects invalid table-session filters before calling the API", async () => {
    const user = userEvent.setup();
    render(<OrderRecordsPage />);
    await screen.findByText("#41", { exact: false });
    await user.type(screen.getByLabelText("Pöytäistunto"), "0");
    expect(
      await screen.findByText(
        "Pöytäistunnon tunnuksen on oltava positiivinen kokonaisluku.",
      ),
    ).toBeTruthy();
  });
});

it("ignores a closed detail response after another order opens", async () => {
  const user = userEvent.setup();
  orders.fetchOrderPages.mockResolvedValue({
    results: [order, { ...order, id: 42 }],
    serverTime: order.updatedAt,
  });
  let resolveOld!: (value: unknown) => void;
  orders.fetchOrderDetail.mockImplementation((id: number) =>
    id === 41
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : Promise.resolve({ ...order, id: 42, history: [] }),
  );
  render(<OrderRecordsPage />);
  const buttons = await screen.findAllByRole("button", { name: "Avaa" });
  await user.click(buttons[1]);
  await user.click(screen.getByRole("button", { name: "Sulje" }));
  await user.click(screen.getAllByRole("button", { name: "Avaa" })[0]);
  await screen.findByText("Tilauksen summa:", { exact: false });
  await act(async () =>
    resolveOld({
      ...order,
      items: [{ ...order.items[0], name: "Stale detail" }],
      history: [],
    }),
  );
  expect(screen.getByRole("dialog").textContent).toContain("Tilaus #42");
  expect(screen.queryByText("Stale detail", { exact: false })).toBeNull();
});
