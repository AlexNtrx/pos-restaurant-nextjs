import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import Dashboard from "@/app/backoffice/dashboard/page";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("HIS-01 operational dashboard", () => {
  it("shows live Order/session counts and recent channel/table/status", async () => {
    api.get.mockResolvedValue({
      data: {
        metrics: {
          activeOrders: 3,
          kitchenQueue: 2,
          readyOrders: 1,
          openTables: 4,
        },
        recentOrders: [
          {
            id: 17,
            channel: "QR",
            status: "SUBMITTED",
            tableNo: 5,
            total: 25,
            submittedAt: "2026-09-26T10:00:00.000Z",
          },
        ],
      },
    });
    render(<Dashboard />);

    const metrics = await screen.findByRole("region", {
      name: "Operatiiviset tunnusluvut",
    });
    expect(await within(metrics).findByText("3")).toBeTruthy();
    expect(within(metrics).getByText("2")).toBeTruthy();
    expect(within(metrics).getByText("1")).toBeTruthy();
    expect(within(metrics).getByText("4")).toBeTruthy();
    expect(screen.queryByText("Kuukauden myynti")).toBeNull();
    expect(screen.getByText(/#17/)).toBeTruthy();
    expect(screen.getByText("QR")).toBeTruthy();
    expect(screen.getByText("Odottaa")).toBeTruthy();
    expect(screen.getByText("25,00 €")).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith("/dashboard/operations");
  });

  it("reports API errors instead of presenting invented metrics", async () => {
    api.get.mockRejectedValue(new Error("network unavailable"));
    render(<Dashboard />);
    expect(await screen.findByText("Yhteenvetoa ei voitu ladata")).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Operatiiviset tunnusluvut" }),
    ).toBeNull();
  });

  it("shows takeaway orders alongside dine-in orders without rejecting the summary", async () => {
    const order = {
      status: "CONFIRMED",
      total: 25,
      submittedAt: "2026-09-26T10:00:00.000Z",
    };
    api.get.mockResolvedValue({
      data: {
        metrics: {
          activeOrders: 3,
          kitchenQueue: 3,
          readyOrders: 0,
          openTables: 2,
        },
        recentOrders: [
          { ...order, id: 18, channel: "COUNTER", tableNo: null },
          { ...order, id: 17, channel: "QR", tableNo: 5 },
          { ...order, id: 19, channel: "STAFF", tableNo: 7 },
          { ...order, id: 16, channel: "COUNTER", tableNo: 6 },
        ],
      },
    });
    render(<Dashboard />);

    const takeaway = await screen.findByRole("row", { name: /#18/ });
    expect(within(takeaway).getByText("Mukaan")).toBeTruthy();
    expect(within(takeaway).getByText("25,00 €")).toBeTruthy();
    expect(
      within(screen.getByRole("row", { name: /#19/ })).getByText("Tarjoilija"),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("row", { name: /#17/ })).getByText("5"),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("row", { name: /#16/ })).getByText("6"),
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Operatiiviset tunnusluvut" }),
    ).toBeTruthy();
    expect(screen.queryByText("Yhteenvetoa ei voitu ladata")).toBeNull();
  });

  it.each([
    { channel: "COUNTER", tableNo: undefined },
    { channel: "COUNTER", tableNo: "5" },
    { channel: "COUNTER", tableNo: 1.5 },
    { channel: "QR", tableNo: null },
  ])("rejects an invalid order location: %j", async (location) => {
    api.get.mockResolvedValue({
      data: {
        metrics: {
          activeOrders: 1,
          kitchenQueue: 1,
          readyOrders: 0,
          openTables: 0,
        },
        recentOrders: [
          {
            id: 18,
            status: "CONFIRMED",
            total: 25,
            submittedAt: "2026-09-26T10:00:00.000Z",
            ...location,
          },
        ],
      },
    });
    render(<Dashboard />);

    expect(
      await screen.findByText(
        "Palvelin palautti virheelliset yhteenvetotiedot.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Operatiiviset tunnusluvut" }),
    ).toBeNull();
  });
});
