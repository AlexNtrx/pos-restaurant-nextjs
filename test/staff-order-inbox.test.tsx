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
vi.mock("@/lib/api", () => ({ default: api }));

import StaffOrderInboxPage from "@/app/backoffice/orders/inbox/page";

const base = {
  id: 41,
  channel: "QR",
  status: "SUBMITTED",
  version: 1,
  tableNo: 7,
  tableSessionId: 15,
  total: 14,
  submittedAt: "2026-09-25T10:00:00.000Z",
  updatedAt: "2026-09-25T10:00:00.000Z",
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
    result: {
      ...order,
      history: [
        {
          fromStatus: null,
          toStatus: "SUBMITTED",
          version: 1,
          reason: null,
          actorType: "CUSTOMER",
          at: "2026-09-25T10:00:00.000Z",
        },
      ],
    },
  },
});

let poll: (() => void) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  poll = undefined;
  vi.spyOn(window, "setInterval").mockImplementation((handler, delay) => {
    if (delay === 5_000) poll = handler as () => void;
    return 1 as unknown as NodeJS.Timeout;
  });
  vi.spyOn(window, "clearInterval").mockImplementation(() => {});
  api.get.mockImplementation(
    (path: string, options?: { params?: { status?: string } }) => {
      if (path === "/orders") {
        if (
          options?.params?.status === "REJECTED" ||
          options?.params?.status === "CANCELLED"
        )
          return Promise.resolve(page([]));
        return Promise.resolve(page([base]));
      }
      if (path === "/orders/41") return Promise.resolve(detail(base));
      return Promise.reject(new Error("Unexpected API call"));
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OPS-01 staff inbox", () => {
  it("removes cached Order snapshots when staff access is revoked during polling", async () => {
    render(<StaffOrderInboxPage />);
    expect(await screen.findByText("Tilaus #41")).toBeTruthy();
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
    expect(screen.queryByText("Tilaus #41")).toBeNull();
  });

  it("shows item notes and adds a new Order on the next poll without navigation", async () => {
    render(<StaffOrderInboxPage />);
    expect(await screen.findByText("Tilaus #41")).toBeTruthy();
    expect(screen.getByText("No onion", { exact: false })).toBeTruthy();
    expect(screen.getByText("Mild", { exact: false })).toBeTruthy();
    api.get.mockImplementation(
      (path: string, options?: { params?: { status?: string } }) => {
        if (path !== "/orders") return Promise.resolve(detail(base));
        if (options?.params?.status === "SUBMITTED")
          return Promise.resolve(page([base]));
        return Promise.resolve(page([{ ...base, id: 42, channel: "COUNTER" }]));
      },
    );
    await act(async () => poll?.());
    expect(await screen.findByText("Tilaus #42")).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith(
      "/orders",
      expect.objectContaining({
        params: expect.objectContaining({ updatedAfter: expect.any(String) }),
      }),
    );
  });

  it("sends expectedVersion and reason, removes rejection from queue, and retains it in handled history", async () => {
    const user = userEvent.setup();
    let serverStatus = "SUBMITTED";
    api.get.mockImplementation(
      (path: string, options?: { params?: { status?: string } }) => {
        if (path === "/orders") {
          if (options?.params?.status === "REJECTED")
            return Promise.resolve(
              page(
                serverStatus === "REJECTED"
                  ? [{ ...base, status: "REJECTED", version: 2 }]
                  : [],
              ),
            );
          if (options?.params?.status === "CANCELLED")
            return Promise.resolve(page([]));
          return Promise.resolve(
            page(serverStatus === "SUBMITTED" ? [base] : []),
          );
        }
        return Promise.resolve(detail(base));
      },
    );
    api.patch.mockImplementation(async () => {
      serverStatus = "REJECTED";
      return detail({
        ...base,
        status: "REJECTED",
        version: 2,
        rejectionReason: "Ei saatavilla",
      });
    });
    render(<StaffOrderInboxPage />);
    const card = (await screen.findByText("Tilaus #41")).closest("article")!;
    await user.click(within(card).getByRole("button", { name: "Avaa" }));
    await screen.findByText("Tapahtumat");
    await user.click(screen.getByRole("button", { name: "Hylkää" }));
    await user.type(
      screen.getByRole("textbox", { name: /Syy/ }),
      "Ei saatavilla",
    );
    await user.click(screen.getByRole("button", { name: "Hylkää" }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/orders/41/status", {
        expectedVersion: 1,
        nextStatus: "REJECTED",
        reason: "Ei saatavilla",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("article")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Sulje" }));
    await user.click(screen.getByRole("tab", { name: "Hylätyt ja perutut" }));
    expect(await screen.findByText("Tilaus #41")).toBeTruthy();
  });
});
