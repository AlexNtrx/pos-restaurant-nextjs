import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn() },
}));
const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api", () => ({ default: api }));

import KitchenBoard from "@/app/backoffice/kitchen/page";
import { StaffRoleContext } from "@/lib/staff-role-context";
import type { UserLevel } from "@/lib/access-control";

function KitchenPage({ level = "user" }: { level?: UserLevel }) {
  return (
    <StaffRoleContext.Provider value={level}>
      <KitchenBoard />
    </StaffRoleContext.Provider>
  );
}

const base = {
  id: 41,
  channel: "QR",
  status: "CONFIRMED",
  version: 2,
  tableNo: 7,
  tableSessionId: 15,
  total: 14,
  submittedAt: "2026-09-25T10:00:00.000Z",
  updatedAt: "2026-09-25T10:01:00.000Z",
  rejectionReason: null,
  cancellationReason: null,
  items: [
    {
      name: "Soup",
      quantity: 1,
      note: "No onion",
      lineTotal: 14,
      modifiers: [{ type: "TASTE", name: "Mild", priceAdjustment: 0 }],
    },
  ],
};
const page = (results: unknown[]) => ({
  data: { results, nextCursor: null, serverTime: new Date().toISOString() },
});
const detail = (order: object) => ({
  data: {
    result: { ...order, history: [{ toStatus: "CONFIRMED", version: 2 }] },
  },
});
let poll: (() => void) | undefined;
let currentStatus = "CONFIRMED";

beforeEach(() => {
  vi.clearAllMocks();
  currentStatus = "CONFIRMED";
  poll = undefined;
  vi.spyOn(window, "setInterval").mockImplementation((handler, delay) => {
    if (delay === 5_000) poll = handler as () => void;
    return 1 as unknown as NodeJS.Timeout;
  });
  vi.spyOn(window, "clearInterval").mockImplementation(() => {});
  api.get.mockImplementation(
    (path: string, options?: { params?: { status?: string } }) => {
      if (path !== "/orders")
        return Promise.reject(new Error("Unexpected API route"));
      const filter = options?.params?.status;
      return Promise.resolve(
        page(
          filter && filter !== currentStatus
            ? []
            : [
                {
                  ...base,
                  status: currentStatus,
                  version: currentStatus === "CONFIRMED" ? 2 : 3,
                },
              ],
        ),
      );
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("KDS-01 Kitchen board", () => {
  it("limits kitchen staff to preparation and supports signing out", async () => {
    currentStatus = "READY";
    localStorage.setItem("mytokenfornextjsproject", "kitchen-token");
    localStorage.setItem("next_name", "Cook");
    localStorage.setItem("next_user_id", "10");
    const user = userEvent.setup();
    render(<KitchenPage level="kitchen" />);
    await screen.findByRole("heading", { name: "#41" });
    expect(
      screen.queryByRole("button", { name: "Merkitse tarjoilluksi" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Avaa asetukset" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Kirjaudu ulos" }));
    expect(localStorage.getItem("mytokenfornextjsproject")).toBeNull();
    expect(localStorage.getItem("next_name")).toBeNull();
    expect(localStorage.getItem("next_user_id")).toBeNull();
    expect(replace).toHaveBeenCalledWith("/signin");
  });
  it("serves a READY Order through the dedicated staff action and removes it from Kitchen", async () => {
    currentStatus = "READY";
    api.patch.mockImplementation(async () => {
      currentStatus = "SERVED";
      return detail({ ...base, status: "SERVED", version: 4 });
    });
    const user = userEvent.setup();
    render(<KitchenPage />);
    const ready = await screen.findByRole("region", { name: "Valmis" });
    await within(ready).findByRole("heading", { name: "#41" });
    await user.click(
      within(ready).getByRole("button", { name: "Merkitse tarjoilluksi" }),
    );
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Vahvista",
      }),
    );
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/orders/41/serve", {
        expectedVersion: 3,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "#41" })).toBeNull(),
    );
  });

  it("renders Figma columns and moves a confirmed Order after an authorized action", async () => {
    const user = userEvent.setup();
    api.patch.mockImplementation(async () => {
      currentStatus = "PREPARING";
      return detail({ ...base, status: "PREPARING", version: 3 });
    });
    render(<KitchenPage level="kitchen" />);
    const waiting = await screen.findByRole("region", { name: "Odottaa" });
    expect(within(waiting).getByRole("heading", { name: "#41" })).toBeTruthy();
    expect(
      within(waiting).getByText("No onion", { exact: false }),
    ).toBeTruthy();
    expect(within(waiting).getByText("Mild", { exact: false })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Valmistelussa" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Valmis" })).toBeTruthy();
    await user.click(within(waiting).getByRole("button", { name: "Aloita" }));
    const confirmation = screen.getByRole("alertdialog");
    await user.click(
      within(confirmation).getByRole("button", { name: "Vahvista" }),
    );
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/kitchen/orders/41/status", {
        expectedVersion: 2,
        nextStatus: "PREPARING",
      }),
    );
    const preparing = screen.getByRole("region", { name: "Valmistelussa" });
    expect(
      await within(preparing).findByRole("heading", { name: "#41" }),
    ).toBeTruthy();
    expect(within(waiting).queryByRole("heading", { name: "#41" })).toBeNull();
  });

  it("removes a cancelled Order from the board on the next poll", async () => {
    render(<KitchenPage />);
    await screen.findByRole("heading", { name: "#41" });
    currentStatus = "CANCELLED";
    await act(async () => poll?.());
    expect(
      await screen.findByText("Tilaus #41 peruttu ja poistettu keittiöstä."),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "#41" })).toBeNull();
  });

  it("clears the board if staff access is revoked", async () => {
    render(<KitchenPage />);
    await screen.findByRole("heading", { name: "#41" });
    api.get.mockRejectedValue(
      Object.assign(new Error("Forbidden"), {
        isAxiosError: true,
        response: { status: 403, data: { error: "Forbidden" } },
      }),
    );
    await act(async () => poll?.());
    expect(
      await screen.findByRole("heading", { name: "Ei käyttöoikeutta" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "#41" })).toBeNull();
  });
});
