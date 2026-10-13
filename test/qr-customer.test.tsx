import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  useParams: () => ({ tableToken: "A".repeat(43) }),
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

const mockLoad = (
  state: "ORDERING" | "MENU_ONLY" | "CLOSED" = "ORDERING",
  remark = "Mieto",
) => {
  get.mockImplementation(async (path: string) => {
    if (path.endsWith("/context"))
      return {
        data: {
          result: { state, tableNo: 12, restaurantName: "Koivurannan Keittiö" },
        },
      };
    if (path.endsWith("/menu"))
      return {
        data: {
          result: {
            ...menu,
            state,
            categories: menu.categories.map((category) => ({
              ...category,
              food: category.food.map((food) => ({ ...food, remark })),
            })),
          },
        },
      };
    if (path.endsWith("/service-call")) return { data: { result: null } };
    throw new Error(`Unexpected GET ${path}`);
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  post.mockReset();
  window.localStorage.clear();
  mockLoad();
});
afterEach(() => cleanup());

describe("anonymous QR customer", () => {
  it("edits only the chosen cart line, preserves matching portions and reloads the note without changing prices", async () => {
    const user = userEvent.setup();
    const items = [
      { foodId: 7, foodSizeId: 4, tasteId: 5, quantity: 2, note: "Ei sipulia" },
      { foodId: 7, foodSizeId: 4, tasteId: 5, quantity: 1, note: "Ei chiliä" },
    ];
    localStorage.setItem(`qr02:${token}:cart`, JSON.stringify(items));
    const view = render(<QrCustomer view="cart" />);
    const toggle = await screen.findByRole("button", {
      name: "Huomautus keittiölle: Basilikakana, rivi 1",
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    const note = screen.getByRole("textbox", {
      name: "Huomautus keittiölle: Basilikakana, rivi 1",
    });
    await user.clear(note);
    await user.type(note, "Ei chiliä");
    expect(JSON.parse(localStorage.getItem(`qr02:${token}:cart`)!)).toEqual([
      { ...items[0], note: "Ei chiliä" },
      items[1],
    ]);
    await user.clear(note);
    await user.type(note, "  Ei suolaa{Enter}Ei chiliä  ");
    const edited = { ...items[0], note: "  Ei suolaa\nEi chiliä  " };
    expect(JSON.parse(localStorage.getItem(`qr02:${token}:cart`)!)).toEqual([
      edited,
      items[1],
    ]);
    expect(
      within(
        screen.getByRole("region", { name: "Tilausyhteenveto" }),
      ).getByText(/75,00/),
    ).toBeTruthy();
    await user.click(toggle);
    expect(screen.queryByRole("textbox")).toBeNull();
    view.unmount();
    render(<QrCustomer view="cart" />);
    await user.click(
      await screen.findByRole("button", {
        name: "Huomautus keittiölle: Basilikakana, rivi 1",
      }),
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Huomautus keittiölle: Basilikakana, rivi 1",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe(edited.note);
    await user.click(
      screen.getByRole("button", {
        name: "Huomautus keittiölle: Basilikakana, rivi 2",
      }),
    );
    await user.clear(
      screen.getByRole("textbox", {
        name: "Huomautus keittiölle: Basilikakana, rivi 2",
      }),
    );
    expect(JSON.parse(localStorage.getItem(`qr02:${token}:cart`)!)).toEqual([
      edited,
      { ...items[1], note: "" },
    ]);
    expect(push).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("limits cart notes to 500 characters and keeps other fields unchanged", async () => {
    const item = {
      foodId: 7,
      foodSizeId: null,
      tasteId: null,
      quantity: 1,
      note: "",
    };
    localStorage.setItem(`qr02:${token}:cart`, JSON.stringify([item]));
    const user = userEvent.setup();
    render(<QrCustomer view="cart" />);
    await user.click(
      await screen.findByRole("button", {
        name: "Huomautus keittiölle: Basilikakana, rivi 1",
      }),
    );
    const note = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(note.maxLength).toBe(500);
    fireEvent.change(note, { target: { value: "x".repeat(500) } });
    fireEvent.change(note, { target: { value: "x".repeat(501) } });
    expect(JSON.parse(localStorage.getItem(`qr02:${token}:cart`)!)).toEqual([
      { ...item, note: "x".repeat(500) },
    ]);
    expect(note.value).toBe("x".repeat(500));
  });

  it("retains a failed note save in memory and blocks navigation and submit until saving succeeds", async () => {
    const item = {
      foodId: 7,
      foodSizeId: null,
      tasteId: null,
      quantity: 1,
      note: "Original",
    };
    localStorage.setItem(`qr02:${token}:cart`, JSON.stringify([item]));
    const user = userEvent.setup();
    render(<QrCustomer view="cart" />);
    await user.click(
      await screen.findByRole("button", {
        name: "Huomautus keittiölle: Basilikakana, rivi 1",
      }),
    );
    const original = Storage.prototype.setItem;
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (this: Storage, key, value) {
        if (key.endsWith(":cart")) throw new Error("Quota exceeded");
        original.call(this, key, value);
      });
    try {
      const note = screen.getByRole("textbox");
      await user.clear(note);
      await user.type(note, "Ei sipulia");
      expect((note as HTMLTextAreaElement).value).toBe("Ei sipulia");
      expect(screen.getByRole("alert").textContent).toContain(
        "Säilytä tämä sivu auki",
      );
      expect(
        (
          screen.getByRole("button", {
            name: "Lähetä tilaus",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      await user.click(screen.getByRole("button", { name: "Lähetä tilaus" }));
      await user.click(screen.getByRole("button", { name: "← Ruokalista" }));
      expect(post).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      expect(JSON.parse(localStorage.getItem(`qr02:${token}:cart`)!)).toEqual([
        item,
      ]);
    } finally {
      spy.mockRestore();
    }
    await user.click(
      screen.getByRole("button", { name: "Tallenna ostoskori uudelleen" }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Lähetä tilaus",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(JSON.parse(localStorage.getItem(`qr02:${token}:cart`)!)).toEqual([
      { ...item, note: "Ei sipulia" },
    ]);
  });

  it("locks the edited note during sending and unknown recovery, then retries the exact edited intent after reload", async () => {
    const item = {
      foodId: 7,
      foodSizeId: null,
      tasteId: null,
      quantity: 1,
      note: "",
    };
    localStorage.setItem(`qr02:${token}:cart`, JSON.stringify([item]));
    const user = userEvent.setup();
    let reject!: (cause: unknown) => void;
    post.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    const view = render(<QrCustomer view="cart" />);
    await user.click(
      await screen.findByRole("button", {
        name: "Huomautus keittiölle: Basilikakana, rivi 1",
      }),
    );
    await user.type(screen.getByRole("textbox"), "Ei sipulia");
    await user.click(screen.getByRole("button", { name: "Lähetä tilaus" }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Huomautus keittiölle/ }),
    ).toBeNull();
    const original = post.mock.calls[0];
    expect(original[1].items).toEqual([{ ...item, note: "Ei sipulia" }]);
    await act(async () => reject(new Error("Network timeout")));
    expect(screen.queryByRole("textbox")).toBeNull();
    view.unmount();
    post.mockResolvedValueOnce({
      data: { result: { orderId: 42, status: "CONFIRMED", total: 20 } },
    });
    render(<QrCustomer view="cart" />);
    await user.click(
      await screen.findByRole("button", {
        name: "Yritä lähettää sama tilaus uudelleen",
      }),
    );
    await screen.findByText("Tilaus #42 vastaanotettu.");
    expect(post.mock.calls[1]).toEqual(original);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it.each(["new", "retry", "closed"] as const)(
    "shows only progress during a %s request and confirms success without allowing a second click",
    async (flow) => {
      const user = userEvent.setup();
      const items = [
        { foodId: 7, foodSizeId: null, tasteId: null, quantity: 1, note: "" },
      ];
      localStorage.setItem(`qr02:${token}:cart`, JSON.stringify(items));
      const saved = {
        idempotencyKey: "saved-request",
        expectedTotal: 20,
        items,
      };
      if (flow !== "new")
        localStorage.setItem(`qr02:${token}:pending`, JSON.stringify(saved));
      if (flow === "closed") mockLoad("CLOSED");
      let resolve!: (value: unknown) => void;
      post.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      render(<QrCustomer view="cart" />);
      const send = await screen.findByRole("button", {
        name:
          flow === "new"
            ? "Lähetä tilaus"
            : flow === "closed"
              ? "Tarkista edellinen tilaus"
              : "Yritä lähettää sama tilaus uudelleen",
      });
      await user.dblClick(send);
      expect(post).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("status").textContent).toContain(
        flow === "closed" ? "Tarkistetaan tilausta" : "Lähetetään tilausta",
      );
      expect(screen.queryByText(/Edellisen lähetyksen tulos/)).toBeNull();
      expect(screen.queryByText(/vastaanotettu/)).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      if (flow !== "closed") {
        expect(
          (
            screen.getByRole("button", {
              name: "← Ruokalista",
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(true);
        expect(
          screen.queryByRole("button", { name: "Lisää Basilikakana" }),
        ).toBeNull();
      }
      if (flow !== "new") expect(post.mock.calls[0][1]).toEqual(saved);
      await act(async () =>
        resolve({
          data: { result: { orderId: 42, status: "CONFIRMED", total: 20 } },
        }),
      );
      expect(screen.getByRole("status").textContent).toBe(
        "Tilaus #42 vastaanotettu.",
      );
      const accepted = screen.getByRole("button", {
        name: "Tilaus vastaanotettu",
      }) as HTMLButtonElement;
      expect(accepted.disabled).toBe(true);
      await user.click(accepted);
      expect(post).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith(
        `/order/${token}/confirmation?orderId=42`,
      );
      expect(localStorage.getItem(`qr02:${token}:pending`)).toBeNull();
    },
  );

  it.each([400, 409, 422])(
    "unlocks the saved cart only after a definitive %s rejection",
    async (status) => {
      const user = userEvent.setup();
      const items = [
        {
          foodId: 7,
          foodSizeId: null,
          tasteId: null,
          quantity: 1,
          note: "Ilman sipulia",
        },
      ];
      localStorage.setItem(`qr02:${token}:cart`, JSON.stringify(items));
      post.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status, data: { code: "FOOD_UNAVAILABLE" } },
      });
      render(<QrCustomer view="cart" />);
      await user.click(
        await screen.findByRole("button", { name: "Lähetä tilaus" }),
      );
      expect((await screen.findByRole("alert")).textContent).toContain(
        "Tilausta ei hyväksytty.",
      );
      expect(screen.queryByText(/Edellisen lähetyksen tulos/)).toBeNull();
      expect(replace).not.toHaveBeenCalled();
      expect(localStorage.getItem(`qr02:${token}:pending`)).toBeNull();
      expect(JSON.parse(localStorage.getItem(`qr02:${token}:cart`)!)).toEqual(
        items,
      );
      await user.click(
        screen.getByRole("button", {
          name: "Huomautus keittiölle: Basilikakana, rivi 1",
        }),
      );
      await user.clear(screen.getByRole("textbox"));
      await user.type(screen.getByRole("textbox"), "Ei chiliä");
      await user.click(
        screen.getByRole("button", { name: "Lisää Basilikakana" }),
      );
      expect(
        JSON.parse(localStorage.getItem(`qr02:${token}:cart`)!)[0].quantity,
      ).toBe(2);
    },
  );

  it.each([
    "invalid-response",
    "IDEMPOTENCY_CONFLICT",
    "QR_ORDERING_CLOSED",
    "TABLE_SESSION_INACTIVE",
    "403",
  ])(
    "keeps %s locked for recovery without claiming rejection or success",
    async (failure) => {
      const user = userEvent.setup();
      localStorage.setItem(
        `qr02:${token}:cart`,
        JSON.stringify([
          { foodId: 7, foodSizeId: null, tasteId: null, quantity: 1, note: "" },
        ]),
      );
      if (failure === "invalid-response")
        post.mockResolvedValueOnce({ data: { result: {} } });
      else
        post.mockRejectedValueOnce({
          isAxiosError: true,
          response: {
            status: failure === "403" ? 403 : 409,
            data: { code: failure },
          },
        });
      render(<QrCustomer view="cart" />);
      await user.click(
        await screen.findByRole("button", { name: "Lähetä tilaus" }),
      );
      expect((await screen.findByRole("alert")).textContent).not.toContain(
        "Tilausta ei hyväksytty",
      );
      expect(screen.getByRole("status").textContent).toContain(
        "Edellisen lähetyksen tulos on epäselvä",
      );
      expect(screen.queryByText(/vastaanotettu/)).toBeNull();
      expect(localStorage.getItem(`qr02:${token}:pending`)).not.toBeNull();
      expect(
        screen.queryByRole("button", { name: "Lisää Basilikakana" }),
      ).toBeNull();
      expect(replace).not.toHaveBeenCalled();
    },
  );

  it("hides the closed-mode recovery warning during retry and restores it after an unknown response", async () => {
    mockLoad("CLOSED");
    const user = userEvent.setup();
    const pending = {
      idempotencyKey: "saved-request",
      expectedTotal: 20,
      items: [
        { foodId: 7, foodSizeId: null, tasteId: null, quantity: 1, note: "" },
      ],
    };
    localStorage.setItem(`qr02:${token}:pending`, JSON.stringify(pending));
    let reject!: (reason: unknown) => void;
    post.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    render(<QrCustomer view="cart" />);
    await user.click(
      await screen.findByRole("button", { name: "Tarkista edellinen tilaus" }),
    );
    expect(screen.queryByText(/Edellisen lähetyksen tulos/)).toBeNull();
    await act(async () => reject(new Error("timeout")));
    expect(screen.getByRole("status").textContent).toContain(
      "Edellisen lähetyksen tulos on epäselvä",
    );
    expect(JSON.parse(localStorage.getItem(`qr02:${token}:pending`)!)).toEqual(
      pending,
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it.each(["cart", "closed"] as const)(
    "preserves confirmed success after cleanup and replay failures in %s mode",
    async (mode) => {
      const user = userEvent.setup();
      const pending = {
        idempotencyKey: "saved-request",
        expectedTotal: 20,
        items: [
          { foodId: 7, foodSizeId: null, tasteId: null, quantity: 1, note: "" },
        ],
      };
      localStorage.setItem(`qr02:${token}:pending`, JSON.stringify(pending));
      localStorage.setItem(`qr02:${token}:cart`, JSON.stringify(pending.items));
      if (mode === "closed") mockLoad("CLOSED");
      post.mockResolvedValueOnce({
        data: { result: { orderId: 42, status: "CONFIRMED", total: 20 } },
      });
      render(<QrCustomer view="cart" />);
      const buttonName =
        mode === "closed"
          ? "Tarkista edellinen tilaus"
          : "Yritä lähettää sama tilaus uudelleen";
      const retry = await screen.findByRole("button", { name: buttonName });
      const original = Storage.prototype.removeItem;
      const spy = vi
        .spyOn(Storage.prototype, "removeItem")
        .mockImplementation(function (this: Storage, key) {
          if (key.endsWith(":pending")) throw new Error("Storage unavailable");
          original.call(this, key);
        });
      try {
        await user.click(retry);
        await screen.findByRole("alert");
        expect(screen.getByRole("status").textContent).toBe(
          "Tilaus #42 vastaanotettu.",
        );
        expect(screen.queryByText(/Edellisen lähetyksen tulos/)).toBeNull();
        expect(
          JSON.parse(localStorage.getItem(`qr02:${token}:pending`)!),
        ).toEqual(pending);
        expect(replace).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
      post.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 400, data: {} },
      });
      await user.click(screen.getByRole("button", { name: buttonName }));
      expect(screen.getByRole("status").textContent).toBe(
        "Tilaus #42 vastaanotettu.",
      );
      expect(screen.getByRole("alert").textContent).not.toContain(
        "Tilausta ei hyväksytty",
      );
      expect(
        JSON.parse(localStorage.getItem(`qr02:${token}:pending`)!),
      ).toEqual(pending);
      post.mockResolvedValueOnce({
        data: { result: { orderId: 42, status: "CONFIRMED", total: 20 } },
      });
      await user.click(screen.getByRole("button", { name: buttonName }));
      expect(post.mock.calls.map((call) => call[1])).toEqual([
        pending,
        pending,
        pending,
      ]);
      expect(replace).toHaveBeenCalledWith(
        `/order/${token}/confirmation?orderId=42`,
      );
    },
  );

  it("does not send an order when its pending request cannot be persisted", async () => {
    localStorage.setItem(
      `qr02:${token}:cart`,
      JSON.stringify([
        { foodId: 7, foodSizeId: null, tasteId: null, quantity: 1, note: "" },
      ]),
    );
    const user = userEvent.setup();
    render(<QrCustomer view="cart" />);
    const submit = await screen.findByRole("button", { name: "Lähetä tilaus" });
    const original = Storage.prototype.setItem;
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (this: Storage, key, value) {
        if (key.endsWith(":pending")) throw new Error("Quota exceeded");
        original.call(this, key, value);
      });
    try {
      await user.click(submit);
      await screen.findByRole("alert");
      expect(post).not.toHaveBeenCalled();
      expect(localStorage.getItem(`qr02:${token}:pending`)).toBeNull();
      expect(screen.getByRole("alert").textContent).toContain(
        "Tilausta ei lähetetty",
      );
      expect(screen.queryByText(/Edellisen lähetyksen tulos/)).toBeNull();
      expect(
        screen.getByRole("button", { name: "Lisää Basilikakana" }),
      ).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it("retains a confirmed request when clearing the cart fails, so recovery still uses the same key", async () => {
    localStorage.setItem(
      `qr02:${token}:cart`,
      JSON.stringify([
        { foodId: 7, foodSizeId: null, tasteId: null, quantity: 1, note: "" },
      ]),
    );
    post.mockResolvedValue({
      data: { result: { orderId: 42, status: "CONFIRMED", total: 20 } },
    });
    const user = userEvent.setup();
    render(<QrCustomer view="cart" />);
    const submit = await screen.findByRole("button", { name: "Lähetä tilaus" });
    const original = Storage.prototype.setItem;
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (this: Storage, key, value) {
        if (key.endsWith(":cart")) throw new Error("Storage unavailable");
        original.call(this, key, value);
      });
    try {
      await user.click(submit);
      await screen.findByRole("alert");
      expect(localStorage.getItem(`qr02:${token}:pending`)).not.toBeNull();
      expect(replace).not.toHaveBeenCalled();
      expect(screen.getByRole("status").textContent).toBe(
        "Tilaus #42 vastaanotettu.",
      );
      expect(screen.queryByText(/Edellisen lähetyksen tulos/)).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Lisää Basilikakana" }),
      ).toBeNull();
    } finally {
      spy.mockRestore();
    }
    await user.click(
      screen.getByRole("button", {
        name: "Yritä lähettää sama tilaus uudelleen",
      }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(post.mock.calls[1][1]).toEqual(post.mock.calls[0][1]);
  });
  it("bounds a thousand-item menu while keeping custom portions, full search and details across pages", async () => {
    const user = userEvent.setup();
    const load = get.getMockImplementation()!;
    get.mockImplementation(async (path: string) =>
      path.endsWith("/menu")
        ? {
            data: {
              result: {
                ...menu,
                categories: [
                  {
                    ...menu.categories[0],
                    food: Array.from({ length: 1000 }, (_, index) => ({
                      ...menu.categories[0].food[0],
                      id: index + 7,
                      name: `Meal ${index + 1}`,
                    })),
                  },
                ],
              },
            },
          }
        : load(path),
    );
    render(<QrCustomer view="menu" />);
    await screen.findByText("Meal 1");
    expect(screen.getAllByRole("article")).toHaveLength(12);
    expect(
      document.querySelectorAll('img[src*="/variants/detail/"]'),
    ).toHaveLength(0);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Koko: Meal 1" }),
      "4",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Maku: Meal 1" }),
      "5",
    );
    await user.click(
      screen.getByRole("button", { name: "Huomautus keittiölle: Meal 1" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Huomautus keittiölle: Meal 1" }),
      "No onion",
    );
    await user.click(
      screen.getByRole("button", { name: "Lisää Meal 1, Iso, Tulinen" }),
    );
    screen.getByRole("button", { name: "Seuraava" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("13–24 / 1000")).toBeTruthy();
    expect(screen.queryByText("Meal 1")).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: "Lisää Meal 13, Tavallinen, Ei valintaa",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Ostoskori, 2 tuotetta" }).textContent,
    ).toContain("45,00");
    await user.click(screen.getByRole("button", { name: "Pääruoat" }));
    expect(screen.getByText("1–12 / 1000")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Seuraava" }));
    await user.click(screen.getByRole("button", { name: "Edellinen" }));
    expect(
      (
        screen.getByRole("combobox", {
          name: "Koko: Meal 1",
        }) as HTMLSelectElement
      ).value,
    ).toBe("4");
    await user.click(
      screen.getByRole("button", { name: "Katso tiedot: Meal 1" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("1")).toBeTruthy();
    await user.click(
      dialog.getByRole("button", { name: "Vähennä Meal 1, Iso, Tulinen" }),
    );
    await user.click(dialog.getByRole("button", { name: "Sulje" }));
    await user.type(
      screen.getByRole("textbox", { name: "Hae ruokalistasta" }),
      "Meal 1000",
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await user.click(
      screen.getByRole("button", {
        name: "Lisää Meal 1000, Tavallinen, Ei valintaa",
      }),
    );
    expect(
      JSON.parse(localStorage.getItem(`qr02:${token}:cart`) || "[]"),
    ).toEqual([
      { foodId: 19, foodSizeId: null, tasteId: null, quantity: 1, note: "" },
      { foodId: 1006, foodSizeId: null, tasteId: null, quantity: 1, note: "" },
    ]);
  }, 15000);
  it("restores saved selections and notes when returning to the menu", async () => {
    const user = userEvent.setup();
    const item = {
      foodId: 7,
      foodSizeId: 4,
      tasteId: 5,
      quantity: 2,
      note: "Ilman sipulia",
    };
    localStorage.setItem(`qr02:${token}:cart`, JSON.stringify([item]));
    render(<QrCustomer view="menu" />);
    const toggle = await screen.findByRole("button", {
      name: "Huomautus keittiölle: Basilikakana",
    });
    expect(
      (
        screen.getByRole("combobox", {
          name: "Koko: Basilikakana",
        }) as HTMLSelectElement
      ).value,
    ).toBe("4");
    expect(
      (
        screen.getByRole("combobox", {
          name: "Maku: Basilikakana",
        }) as HTMLSelectElement
      ).value,
    ).toBe("5");
    await user.click(toggle);
    const note = screen.getByRole("textbox", {
      name: "Huomautus keittiölle: Basilikakana",
    });
    expect((note as HTMLTextAreaElement).value).toBe("Ilman sipulia");
    await user.clear(note);
    await user.type(note, "Ilman chiliä");
    expect(
      JSON.parse(localStorage.getItem(`qr02:${token}:cart`) || "[]"),
    ).toEqual([{ ...item, note: "Ilman chiliä" }]);
  });

  it("shows uploaded food photos in the menu", async () => {
    render(<QrCustomer view="menu" />);
    await screen.findByText("Basilikakana");
    expect(
      document.querySelector(
        'img[src="http://localhost:3001/uploads/variants/card/qr-menu-photo.webp"]',
      ),
    ).toBeTruthy();
  });

  it("opens the separate More info image without changing the list image", async () => {
    const user = userEvent.setup();
    render(<QrCustomer view="menu" />);
    await screen.findByText("Basilikakana");
    expect(
      document.querySelector(
        'img[src="http://localhost:3001/uploads/variants/card/qr-menu-photo.webp"]',
      ),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Katso tiedot: Basilikakana" }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      document.querySelector(
        'img[src="http://localhost:3001/uploads/variants/detail/qr-detail-poster.jpg"]',
      ),
    ).toBeTruthy();
  });

  it("shares the selected size, taste, note and quantity between the details dialog and menu", async () => {
    const user = userEvent.setup();
    const plainItem = {
      foodId: 7,
      foodSizeId: null,
      tasteId: null,
      quantity: 1,
      note: "",
    };
    localStorage.setItem(`qr02:${token}:cart`, JSON.stringify([plainItem]));
    const view = render(<QrCustomer view="menu" />);
    await screen.findByText("Basilikakana");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Koko: Basilikakana" }),
      "4",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Maku: Basilikakana" }),
      "5",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Huomautus keittiölle: Basilikakana",
      }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Huomautus keittiölle: Basilikakana",
      }),
      "Ilman sipulia",
    );
    const noteInput = screen.getByRole("textbox", {
      name: "Huomautus keittiölle: Basilikakana",
    });
    await user.click(
      screen.getByRole("button", { name: "Lisää Basilikakana, Iso, Tulinen" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Katso tiedot: Basilikakana" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/25,00/)).toBeTruthy();
    expect(dialog.getByText("1")).toBeTruthy();
    const add = dialog.getByRole("button", {
      name: "Lisää Basilikakana, Iso, Tulinen",
    });
    await user.click(add);
    await user.click(add);
    await user.click(
      dialog.getByRole("button", {
        name: "Vähennä Basilikakana, Iso, Tulinen",
      }),
    );
    expect(dialog.getByText("2")).toBeTruthy();
    expect(
      JSON.parse(localStorage.getItem(`qr02:${token}:cart`) || "[]"),
    ).toEqual([
      plainItem,
      {
        ...plainItem,
        foodSizeId: 4,
        tasteId: 5,
        quantity: 2,
        note: "Ilman sipulia",
      },
    ]);
    await user.click(dialog.getByRole("button", { name: "Sulje" }));
    view.rerender(<QrCustomer view="menu" />);
    expect(
      screen.getByRole("textbox", {
        name: "Huomautus keittiölle: Basilikakana",
      }),
    ).toBe(noteInput);
    expect((noteInput as HTMLTextAreaElement).value).toBe("Ilman sipulia");
    expect(
      screen
        .getByRole("button", { name: "Huomautus keittiölle: Basilikakana" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Ostoskori, 3 tuotetta" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", {
        name: "Vähennä Basilikakana, Iso, Tulinen",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Katso tiedot: Basilikakana" }),
    );
    expect(within(screen.getByRole("dialog")).getByText("1")).toBeTruthy();
  });

  it.each(["pending", "limit"] as const)(
    "preserves the %s guard in the details quantity controls",
    async (guard) => {
      const user = userEvent.setup();
      const item = {
        foodId: 7,
        foodSizeId: null,
        tasteId: null,
        quantity: guard === "limit" ? 200 : 1,
        note: "",
      };
      localStorage.setItem(`qr02:${token}:cart`, JSON.stringify([item]));
      if (guard === "pending")
        localStorage.setItem(
          `qr02:${token}:pending`,
          JSON.stringify({
            idempotencyKey: "36e85e2c-734a-4f3f-8b49-5d538d68df17",
            expectedTotal: 20,
            items: [item],
          }),
        );
      render(<QrCustomer view="menu" />);
      await user.click(
        await screen.findByRole("button", {
          name: "Katso tiedot: Basilikakana",
        }),
      );
      const dialog = within(screen.getByRole("dialog"));
      const add = dialog.getByRole("button", {
        name: "Lisää Basilikakana, Tavallinen, Ei valintaa",
      }) as HTMLButtonElement;
      const remove = dialog.getByRole("button", {
        name: "Vähennä Basilikakana, Tavallinen, Ei valintaa",
      }) as HTMLButtonElement;
      expect(add.disabled).toBe(true);
      expect(remove.disabled).toBe(guard === "pending");
      if (guard === "limit") {
        await user.click(remove);
        expect(dialog.getByText("199")).toBeTruthy();
        expect(add.disabled).toBe(false);
      }
    },
  );

  it.each(["SUBMITTED", "CONFIRMED"])(
    "lets a customer start another order from a %s status page while ordering is open",
    async (status) => {
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
                status,
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
      expect(
        screen.getByText(
          `Nykyinen tila: ${status === "CONFIRMED" ? "Keittiön jonossa" : "Vastaanotettu"}`,
        ),
      ).toBeTruthy();
      await user.click(screen.getByRole("button", { name: "Tilaa lisää" }));
      expect(push).toHaveBeenCalledWith(`/order/${token}`);
    },
  );

  it("shows only the closed state when QR service is disabled", async () => {
    mockLoad("CLOSED");
    render(<QrCustomer view="menu" />);
    expect(await screen.findByText("QR-tilaaminen on suljettu")).toBeTruthy();
    expect(screen.queryByText("Basilikakana")).toBeNull();
    expect(get).not.toHaveBeenCalledWith(`/qr/${token}/menu`);
  });

  it("allows browsing but not adding an item in menu-only mode", async () => {
    const user = userEvent.setup();
    mockLoad("MENU_ONLY");
    render(<QrCustomer view="menu" />);
    expect(await screen.findByText("Basilikakana")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Lisää Basilikakana/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: /Huomautus keittiölle/ }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Katso tiedot: Basilikakana" }),
    );
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", {
        name: /Lisää Basilikakana/,
      }),
    ).toBeNull();
  });

  it.each(["", "   "])(
    "shows Finnish ingredient guidance when the restaurant remark is empty (%j)",
    async (remark) => {
      const user = userEvent.setup();
      mockLoad("ORDERING", remark);
      render(<QrCustomer view="menu" />);
      expect(
        await screen.findByText(
          "Katso kaikki ainesosat kohdasta Katso tiedot.",
        ),
      ).toBeTruthy();
      expect(screen.queryByRole("textbox", { name: /Huomautus/ })).toBeNull();
      await user.click(
        screen.getByRole("button", {
          name: "Huomautus keittiölle: Basilikakana",
        }),
      );
      const note = screen.getByRole("textbox", {
        name: "Huomautus keittiölle: Basilikakana",
      }) as HTMLTextAreaElement;
      expect(note.value).toBe("");
      expect(note.maxLength).toBe(500);
      await user.click(
        screen.getByRole("button", {
          name: "Lisää Basilikakana, Tavallinen, Ei valintaa",
        }),
      );
      expect(
        JSON.parse(localStorage.getItem(`qr02:${token}:cart`) || "[]")[0].note,
      ).toBe("");
    },
  );

  it.each(["menu"] as const)(
    "keeps the %s note collapsed until clicked and preserves text when closed",
    async (view) => {
      const user = userEvent.setup();
      render(<QrCustomer view={view} />);
      const toggle = await screen.findByRole("button", {
        name: "Huomautus keittiölle: Basilikakana",
      });
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByRole("textbox", { name: /Huomautus/ })).toBeNull();
      await user.click(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      const note = screen.getByRole("textbox", {
        name: "Huomautus keittiölle: Basilikakana",
      }) as HTMLTextAreaElement;
      await user.type(note, "Ilman sipulia");
      await user.click(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByRole("textbox", { name: /Huomautus/ })).toBeNull();
      await user.click(toggle);
      expect(
        (
          screen.getByRole("textbox", {
            name: /Huomautus/,
          }) as HTMLTextAreaElement
        ).value,
      ).toBe("Ilman sipulia");
    },
  );

  it("saves a note typed after adding a portion and preserves differently customized portions", async () => {
    const user = userEvent.setup();
    const otherItem = {
      foodId: 7,
      foodSizeId: 4,
      tasteId: null,
      quantity: 1,
      note: "Ilman chiliä",
    };
    localStorage.setItem(`qr02:${token}:cart`, JSON.stringify([otherItem]));
    render(<QrCustomer view="menu" />);
    await screen.findByText("Basilikakana");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Koko: Basilikakana" }),
      "",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Huomautus keittiölle: Basilikakana",
      }),
    );
    const note = screen.getByRole("textbox", {
      name: "Huomautus keittiölle: Basilikakana",
    });
    const add = screen.getByRole("button", {
      name: "Lisää Basilikakana, Tavallinen, Ei valintaa",
    });
    await user.clear(note);
    await user.click(add);
    await user.type(note, "  Ilman sipulia  ");
    await user.click(add);
    expect(
      JSON.parse(localStorage.getItem(`qr02:${token}:cart`) || "[]"),
    ).toEqual([
      otherItem,
      {
        foodId: 7,
        foodSizeId: null,
        tasteId: null,
        quantity: 2,
        note: "Ilman sipulia",
      },
    ]);
    expect(
      screen.getByRole("button", { name: "Ostoskori, 3 tuotetta" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Ostoskori, 3 tuotetta" }),
    );
    expect(push).toHaveBeenCalledWith(`/order/${token}/cart`);
    cleanup();
    render(<QrCustomer view="cart" />);
    expect(
      await screen.findByText("Ilman sipulia", { selector: "p" }),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /Huomautus/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Muokkaa/ })).toBeNull();
    const back = screen.getByRole("button", { name: "← Ruokalista" });
    expect(back.getAttribute("data-variant")).toBe("secondary");
    await user.click(back);
    expect(push).toHaveBeenCalledWith(`/order/${token}`);
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
      screen.getByRole("button", { name: "Katso tiedot: Basilikakana" }),
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
      (
        screen.getByRole("button", {
          name: "Huomautus keittiölle: Basilikakana",
        }) as HTMLButtonElement
      ).disabled,
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
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Koko: Basilikakana" }),
      "",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Huomautus keittiölle: Basilikakana",
      }),
    );
    await user.clear(
      screen.getByRole("textbox", {
        name: "Huomautus keittiölle: Basilikakana",
      }),
    );
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

  it("shows a collapsed note and detailed summary in the cart and submits the saved selections", async () => {
    const user = userEvent.setup();
    const item = {
      foodId: 7,
      foodSizeId: 4,
      tasteId: 5,
      quantity: 1,
      note: "Ei chiliä",
    };
    localStorage.setItem(`qr02:${token}:cart`, JSON.stringify([item]));
    post.mockResolvedValueOnce({
      data: { result: { orderId: 42, status: "CONFIRMED", total: 25 } },
    });
    render(<QrCustomer view="cart" />);
    expect(
      await screen.findByText("Ei chiliä", { selector: "p" }),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /Huomautus/ })).toBeNull();
    const summary = within(
      screen.getByRole("region", { name: "Tilausyhteenveto" }),
    );
    const line = summary.getByRole("listitem");
    expect(line.textContent).toContain(
      "1 × Basilikakana · Iso · Tulinen (Ei chiliä)",
    );
    expect(line.textContent).toMatch(/25,00/);
    const expectedItem = item;
    expect(
      JSON.parse(localStorage.getItem(`qr02:${token}:cart`) || "[]"),
    ).toEqual([expectedItem]);
    await user.click(screen.getByRole("button", { name: "Lähetä tilaus" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/qr/${token}/orders`, {
        idempotencyKey: expect.any(String),
        expectedTotal: 25,
        items: [expectedItem],
      }),
    );
    expect(replace).toHaveBeenCalledWith(
      `/order/${token}/confirmation?orderId=42`,
    );
  });

  it.each([0, 500, 502, 408, 429])(
    "retries an unknown HTTP %s submit after reload with the exact key and clears the cart after success",
    async (status) => {
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
      post
        .mockRejectedValueOnce(
          status
            ? { isAxiosError: true, response: { status, data: {} } }
            : new Error("network"),
        )
        .mockResolvedValueOnce({
          data: { result: { orderId: 42, status: "CONFIRMED", total: 25 } },
        });
      render(<QrCustomer view="cart" />);
      await screen.findByText("Basilikakana");
      await user.click(screen.getByRole("button", { name: "Lähetä tilaus" }));
      await screen.findByText("Yhteys epäonnistui. Yritä uudelleen.");
      expect(screen.getByText("Huomautus keittiölle: Ei chiliä")).toBeTruthy();
      expect(
        screen.queryByRole("textbox", { name: /Huomautus keittiölle/ }),
      ).toBeNull();
      const pending = JSON.parse(
        window.localStorage.getItem(`qr02:${token}:pending`) || "null",
      );
      expect(pending.expectedTotal).toBe(25);
      cleanup();
      render(<QrCustomer view="cart" />);
      await screen.findByText("Basilikakana");
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
    },
  );

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
      data: { result: { orderId: 42, status: "CONFIRMED", total: 25 } },
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
