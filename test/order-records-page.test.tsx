import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import OrderRecordsPage from "@/app/backoffice/orders/history/orders/page";

const orders = vi.hoisted(() => ({
  fetchOrderPages: vi.fn(),
  fetchOrderDetail: vi.fn(),
}));
vi.mock("@/app/backoffice/orders/inbox/_lib/staff-orders", () => orders);

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
  orders.fetchOrderDetail.mockResolvedValue({
    ...order,
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
  });
});
afterEach(cleanup);

describe("HIS-01 Order records", () => {
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
