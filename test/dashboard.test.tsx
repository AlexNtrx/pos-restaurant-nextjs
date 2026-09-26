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
});
