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
          img: "qr-menu-photo.webp",
          detailImg: "qr-detail-poster.jpg",
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
    if (path.endsWith("/service-call")) return { data: { result: null } };
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
  it("shows uploaded food photos in the menu and item detail", async () => {
    render(<QrCustomer view="menu" />);
    await screen.findByText("Basilikakana");
    expect(
      document.querySelector(
        'img[src="http://localhost:3001/uploads/qr-menu-photo.webp"]',
      ),
    ).toBeTruthy();

    cleanup();
    render(<QrCustomer view="item" />);
    expect(await screen.findByAltText("Basilikakana")).toBeTruthy();
  });

  it("opens the separate More info image without changing the list image", async () => {
    const user = userEvent.setup();
    render(<QrCustomer view="menu" />);
    await screen.findByText("Basilikakana");
    expect(
      document.querySelector(
        'img[src="http://localhost:3001/uploads/qr-menu-photo.webp"]',
      ),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Lisätiedot: Basilikakana" }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      document.querySelector(
        'img[src="http://localhost:3001/uploads/qr-detail-poster.jpg"]',
      ),
    ).toBeTruthy();
  });

  it("lets a customer start another order from the status page while ordering is open", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(`qr02:${token}:lastOrder`, "42");
    get.mockImplementation(async (path: string) => {
      if (path.endsWith("/context"))
        return {
          data: {
            result: {
              state: "ORDERING",
              tableNo: 12,
              restaurantName: "Ravintola",
            },
          },
        };
      if (path.endsWith("/orders/42"))
        return {
          data: {
            result: {
              id: 42,
              status: "SUBMITTED",
              tableNo: 12,
              total: 25,
              submittedAt: "2026-09-27T12:00:00.000Z",
              items: [],
              history: [],
            },
          },
        };
      throw new Error(`Unexpected GET ${path}`);
    });
    render(<QrCustomer view="status" />);
    await screen.findByText("Tilaus #42");
    await user.click(screen.getByRole("button", { name: "Tilaa lisää" }));
    expect(push).toHaveBeenCalledWith(`/order/${token}`);
  });

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
      screen.queryByRole("button", { name: /Lisää Basilikakana/ }),
    ).toBeNull();
  });

  it("changes quantity and taste directly in the menu and updates the cart count", async () => {
    const user = userEvent.setup();
    render(<QrCustomer view="menu" />);
    await screen.findByText("Basilikakana");
    expect(
      screen.getByRole("button", { name: "Ostoskori, 0 tuotetta" }),
    ).toBeTruthy();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Maku: Basilikakana" }),
      "5",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Lisää Basilikakana, Tavallinen, Tulinen",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Lisää Basilikakana, Tavallinen, Tulinen",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Ostoskori, 2 tuotetta" }),
    ).toBeTruthy();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Maku: Basilikakana" }),
      "",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Lisää Basilikakana, Tavallinen, Ei valintaa",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Ostoskori, 3 tuotetta" }),
    ).toBeTruthy();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Maku: Basilikakana" }),
      "5",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Vähennä Basilikakana, Tavallinen, Tulinen",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Ostoskori, 2 tuotetta" }),
    ).toBeTruthy();
    expect(
      JSON.parse(localStorage.getItem(`qr02:${token}:cart`) || "[]"),
    ).toEqual([
      { foodId: 7, foodSizeId: null, tasteId: 5, quantity: 1, note: "" },
      { foodId: 7, foodSizeId: null, tasteId: null, quantity: 1, note: "" },
    ]);
    expect(
      screen.getByRole("button", { name: "Lisätiedot: Basilikakana" }),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /Huomautus/ })).toBeNull();
  });

  it("selects a size inline and keeps the restaurant remark between name and price", async () => {
    const user = userEvent.setup();
    render(<QrCustomer view="menu" />);
    const heading = await screen.findByRole("heading", {
      name: "Basilikakana",
    });
    const remark = screen.getByText("Huomautus:").parentElement;
    const price = screen.getByText(/20,00/);
    expect(remark?.textContent).toContain("Mieto");
    expect(
      Boolean(
        heading.compareDocumentPosition(remark!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(
      Boolean(
        remark!.compareDocumentPosition(price) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Koko: Basilikakana" }),
      "4",
    );
    expect(screen.getByText(/25,00/)).toBeTruthy();
    await user.click(
      screen.getByRole("button", {
        name: "Lisää Basilikakana, Iso, Ei valintaa",
      }),
    );
    expect(
      JSON.parse(localStorage.getItem(`qr02:${token}:cart`) || "[]"),
    ).toEqual([
      { foodId: 7, foodSizeId: 4, tasteId: null, quantity: 1, note: "" },
    ]);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Koko: Basilikakana" }),
      "",
    );
    expect(
      screen.getByRole("button", {
        name: "Lisää Basilikakana, Tavallinen, Ei valintaa",
      }),
    ).toBeTruthy();
  });

  it("locks inline edits while an earlier submission has an unknown outcome", async () => {
    localStorage.setItem(
      `qr02:${token}:pending`,
      JSON.stringify({
        idempotencyKey: "36e85e2c-734a-4f3f-8b49-5d538d68df17",
        expectedTotal: 20,
        items: [
          { foodId: 7, foodSizeId: null, tasteId: null, quantity: 1, note: "" },
        ],
      }),
    );
    render(<QrCustomer view="menu" />);
    await screen.findByText("Basilikakana");
    expect(
      screen
        .getByRole("button", {
          name: "Lisää Basilikakana, Tavallinen, Ei valintaa",
        })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Ostoskori, 0 tuotetta" }),
    ).toBeTruthy();
  });

  it("keeps customized lines separate and stops at the 200-unit cart limit", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      `qr02:${token}:cart`,
      JSON.stringify([
        {
          foodId: 7,
          foodSizeId: 4,
          tasteId: null,
          quantity: 199,
          note: "Extra",
        },
      ]),
    );
    render(<QrCustomer view="menu" />);
    await screen.findByText("Basilikakana");
    expect(
      screen.getByRole("button", { name: "Ostoskori, 199 tuotetta" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", {
        name: "Lisää Basilikakana, Tavallinen, Ei valintaa",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Ostoskori, 200 tuotetta" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", {
          name: "Lisää Basilikakana, Tavallinen, Ei valintaa",
        })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      JSON.parse(localStorage.getItem(`qr02:${token}:cart`) || "[]"),
    ).toEqual([
      { foodId: 7, foodSizeId: 4, tasteId: null, quantity: 199, note: "Extra" },
      { foodId: 7, foodSizeId: null, tasteId: null, quantity: 1, note: "" },
    ]);
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
