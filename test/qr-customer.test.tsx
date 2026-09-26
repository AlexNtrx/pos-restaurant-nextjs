import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QrCustomer from "@/app/order/[tableToken]/_components/qr-customer";

const { get, post, push, replace } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ publicApi: { get, post } }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ tableToken: "A".repeat(43), menuItemId: "7" }),
  useRouter: () => ({ push, replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const token = "A".repeat(43);
const menu = {
  state: "ORDERING",
  tableNo: 12,
  categories: [
    {
      id: 3,
      name: "Pääruoat",
      food: [
        {
          id: 7,
          name: "Basilikakana",
          remark: "Mieto",
          price: 20,
          foodTypeId: 3,
        },
      ],
      foodSizes: [{ id: 4, name: "Iso", moneyAdded: 5 }],
      tastes: [{ id: 5, name: "Tulinen" }],
    },
  ],
};

const mockLoad = (state: "ORDERING" | "MENU_ONLY" | "CLOSED" = "ORDERING") => {
  get.mockImplementation(async (path: string) => {
    if (path.endsWith("/context"))
      return {
        data: {
          result: { state, tableNo: 12, restaurantName: "Koivurannan Keittiö" },
        },
      };
    if (path.endsWith("/menu")) return { data: { result: { ...menu, state } } };
    throw new Error(`Unexpected GET ${path}`);
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mockLoad();
});
afterEach(() => cleanup());

describe("anonymous QR customer", () => {
  it("shows only the closed state when QR service is disabled", async () => {
    mockLoad("CLOSED");
    render(<QrCustomer view="menu" />);
    expect(await screen.findByText("QR-tilaaminen on suljettu")).toBeTruthy();
    expect(screen.queryByText("Basilikakana")).toBeNull();
    expect(get).not.toHaveBeenCalledWith(`/qr/${token}/menu`);
  });

  it("allows browsing but not adding an item in menu-only mode", async () => {
    mockLoad("MENU_ONLY");
    render(<QrCustomer view="menu" />);
    expect(await screen.findByText("Basilikakana")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Lisää Basilikakana" }),
    ).toBeNull();
  });

  it("adds a customized item to the browser cart", async () => {
    const user = userEvent.setup();
    render(<QrCustomer view="item" />);
    await screen.findByText("Basilikakana");
    await user.selectOptions(screen.getByLabelText("Koko"), "4");
    await user.selectOptions(screen.getByLabelText("Maku"), "5");
    await user.type(screen.getByLabelText("Huomautus keittiölle"), "Ei chiliä");
    await user.click(screen.getByRole("button", { name: /Lisää ostoskoriin/ }));
    const stored = JSON.parse(
      window.localStorage.getItem(`qr02:${token}:cart`) || "[]",
    );
    expect(stored).toEqual([
      {
        foodId: 7,
        foodSizeId: 4,
        tasteId: 5,
        quantity: 1,
        note: "Ei chiliä",
      },
    ]);
    expect(push).toHaveBeenCalledWith(`/order/${token}`);
  });

  it("retries an unknown submit with the exact key and clears the cart after success", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      `qr02:${token}:cart`,
      JSON.stringify([
        {
          foodId: 7,
          foodSizeId: 4,
          tasteId: 5,
          quantity: 1,
          note: "Ei chiliä",
        },
      ]),
    );
    post.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({
      data: { result: { orderId: 42, status: "SUBMITTED", total: 25 } },
    });
    render(<QrCustomer view="cart" />);
    await screen.findByText("Basilikakana");
    await user.click(screen.getByRole("button", { name: "Lähetä tilaus" }));
    await screen.findByText("Yhteys epäonnistui. Yritä uudelleen.");
    const pending = JSON.parse(
      window.localStorage.getItem(`qr02:${token}:pending`) || "null",
    );
    expect(pending.expectedTotal).toBe(25);
    await user.click(
      screen.getByRole("button", {
        name: "Yritä lähettää sama tilaus uudelleen",
      }),
    );
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[0][1]).toEqual(post.mock.calls[1][1]);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        `/order/${token}/confirmation?orderId=42`,
      ),
    );
    expect(window.localStorage.getItem(`qr02:${token}:pending`)).toBeNull();
    expect(
      JSON.parse(window.localStorage.getItem(`qr02:${token}:cart`) || "null"),
    ).toEqual([]);
  });

  it("can recover an already-submitted Order after QR mode closes", async () => {
    const user = userEvent.setup();
    mockLoad("CLOSED");
    const pending = {
      idempotencyKey: "36e85e2c-734a-4f3f-8b49-5d538d68df17",
      expectedTotal: 25,
      items: [{ foodId: 7, foodSizeId: 4, tasteId: 5, quantity: 1, note: "" }],
    };
    window.localStorage.setItem(
      `qr02:${token}:pending`,
      JSON.stringify(pending),
    );
    post.mockResolvedValue({
      data: { result: { orderId: 42, status: "SUBMITTED", total: 25 } },
    });
    render(<QrCustomer view="cart" />);
    await screen.findByText("QR-tilaaminen on suljettu");
    await user.click(
      screen.getByRole("button", { name: "Tarkista edellinen tilaus" }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/qr/${token}/orders`, pending),
    );
    expect(replace).toHaveBeenCalledWith(
      `/order/${token}/confirmation?orderId=42`,
    );
    expect(get).not.toHaveBeenCalledWith(`/qr/${token}/menu`);
  });
});
