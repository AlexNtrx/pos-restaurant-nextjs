import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { api, toast } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/api", () => ({ default: api }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/app/config", () => ({
  default: { apiServer: "http://example.test", token: "test-token" },
}));
import SalePage from "@/app/backoffice/sale/page";
import CounterOrderCheckout from "@/app/backoffice/sale/_components/counter-order-checkout";

const food = { id: 1, name: "Test meal", img: "test-meal.jpg", price: 25 };
const cart = {
  results: [],
  summary: { baseAmount: 0, addedAmount: 0, total: 0 },
};
const servedCounterOrder = {
  id: 81,
  serviceType: "DINE_IN" as const,
  status: "SERVED",
  total: 80,
  version: 5,
  submittedAt: "2026-09-23T12:00:00.000Z",
  billSaleId: null,
  Items: [{ foodName: "Previously ordered meal", quantity: 2 }],
};
const sentDetail = {
  id: 81,
  channel: "COUNTER",
  status: "CONFIRMED",
  version: 2,
  tableNo: 1,
  submittedAt: "2026-09-23T12:00:00.000Z",
  paidAt: null,
  total: 80,
  items: [
    {
      name: "Previously ordered meal",
      quantity: 2,
      note: "Less salt",
      lineTotal: 80,
      modifiers: [],
    },
  ],
  history: [
    {
      version: 1,
      toStatus: "SUBMITTED",
      at: "2026-09-23T12:00:00.000Z",
      reason: null,
    },
    {
      version: 2,
      toStatus: "CONFIRMED",
      at: "2026-09-23T12:01:00.000Z",
      reason: null,
    },
  ],
};

describe("POS safety net", () => {
  afterEach(cleanup);
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ORD02_DRAFT_ENABLED = "false";
    localStorage.clear();
    localStorage.setItem("test-token", "token");
    localStorage.setItem("next_name", "Cashier");
    localStorage.setItem("next_user_id", "7");
    vi.clearAllMocks();
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/food/filter/drink")
        return Promise.resolve({ data: { results: [] } });
      if (path === "/saleTemp/list/") return Promise.resolve({ data: cart });
      return Promise.resolve({ data: { results: [] } });
    });
    api.post.mockResolvedValue({ data: {} });
  });

  it("recovers a legacy payment after its cart is empty without changing endpoint, key or confirmed amount", async () => {
    process.env.NEXT_PUBLIC_ORD02_DRAFT_ENABLED = "true";
    const payload = {
      tableNo: 1,
      payType: "bank",
      idempotencyKey: "legacy-committed-key",
    };
    localStorage.setItem(
      "counter-draft:v1:7:1:attempt",
      JSON.stringify({ kind: "legacy", payload, quotedTotal: 25 }),
    );
    api.post.mockImplementation(async (path: string) => {
      if (path === "/saleTemp/endSale")
        return {
          data: {
            billId: 401,
            amount: 25,
            inputMoney: 25,
            returnMoney: 0,
            replayed: true,
          },
        };
      throw new Error("Receipt unavailable");
    });
    render(<SalePage />);
    const pay = await screen.findByRole("button", { name: /^pay$/i });
    await waitFor(() =>
      expect((pay as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(pay);
    expect(
      (
        screen.getByRole("button", {
          name: /bank transfer/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    const complete = screen.getByRole("button", { name: /complete payment/i });
    expect((complete as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(complete);
    fireEvent.click(complete);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/saleTemp/endSale", payload),
    );
    expect(
      api.post.mock.calls.filter(([path]) => path === "/saleTemp/endSale"),
    ).toHaveLength(1);
    expect(
      api.post.mock.calls.some(([path]) => path === "/counterOrder/checkout"),
    ).toBe(false);
    await waitFor(() =>
      expect(localStorage.getItem("counter-draft:v1:7:1:attempt")).toBeNull(),
    );
  });

  it("shows an uncertain Counter Order payment even after that Order disappears from the active queue", async () => {
    const payload = {
      expectedVersion: 5,
      payType: "bank",
      idempotencyKey: "committed-order-payment",
    };
    localStorage.setItem(
      "pending-request:v1:7:counter-order:81",
      JSON.stringify({ order: servedCounterOrder, payload }),
    );
    api.post.mockResolvedValueOnce({
      data: { billId: 401, amount: 80, inputMoney: 80, returnMoney: 0 },
    });
    render(<SalePage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Tarkista maksu #81" }),
    );
    const complete = screen.getByRole("button", { name: /complete payment/i });
    await waitFor(() =>
      expect((complete as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(complete);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/counterOrder/81/settle", payload),
    );
    expect(
      api.post.mock.calls.filter(
        ([path]) => path === "/counterOrder/81/settle",
      ),
    ).toHaveLength(1);
  });

  it("waits for the legacy cart before editing dine-in but allows takeaway independently", async () => {
    process.env.NEXT_PUBLIC_ORD02_DRAFT_ENABLED = "true";
    localStorage.setItem("test-token", "token");
    localStorage.setItem("next_name", "Cashier");
    localStorage.setItem("next_user_id", "7");
    let resolveLegacy!: (response: unknown) => void;
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return new Promise((resolve) => {
          resolveLegacy = resolve;
        });
      return Promise.resolve({ data: { results: [] } });
    });
    render(<SalePage />);
    const product = await screen.findByRole("button", { name: /Test meal/ });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect((product as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(product);
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mukaan" }));
    await waitFor(() =>
      expect((product as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Paikan päällä" }));
    await waitFor(() =>
      expect((product as HTMLButtonElement).disabled).toBe(true),
    );
    await act(async () => {
      resolveLegacy({
        data: {
          results: [
            {
              id: 7,
              qty: 1,
              Food: food,
              saleTempDetails: [],
              pricing: { baseAmount: 25, addedAmount: 0, total: 25 },
            },
          ],
          summary: { baseAmount: 25, addedAmount: 0, total: 25 },
        },
      });
    });
    await waitFor(() =>
      expect(screen.getByTestId("cart-total").textContent).toContain("25"),
    );
    expect(localStorage.getItem("counter-draft:v1:7:1")).toBeNull();
  });

  it("reprints the displayed older bill instead of the latest checkout", async () => {
    let paid = false;
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/") return Promise.resolve({ data: cart });
      if (path === "/counterOrder/sent")
        return Promise.resolve({
          data: {
            results: [
              ...(paid ? [] : [servedCounterOrder]),
              {
                ...servedCounterOrder,
                id: 82,
                status: "CONFIRMED",
                billSaleId: 202,
              },
            ],
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });
    api.post.mockImplementation(
      (path: string, payload: { billId?: number }) => {
        if (path === "/counterOrder/81/settle") {
          paid = true;
          return Promise.resolve({
            data: { billId: 201, amount: 80, inputMoney: 80, returnMoney: 0 },
          });
        }
        if (payload.billId === 201)
          return Promise.reject(new Error("Latest receipt unavailable"));
        return Promise.resolve({
          data: new Blob(["pdf"], { type: "application/pdf" }),
          headers: { "content-type": "application/pdf" },
        });
      },
    );
    URL.createObjectURL = vi.fn(() => "blob:older-bill");
    URL.revokeObjectURL = vi.fn();
    render(<SalePage />);
    const pay = await screen.findByRole("button", { name: "Pay Order #81" });
    await waitFor(() =>
      expect((pay as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(pay);
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: /bank transfer/i,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: /bank transfer/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete payment/i }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    fireEvent.click(
      screen.getByRole("button", { name: "Print paid Order #82" }),
    );
    const preview = await screen.findByRole("dialog");
    fireEvent.click(
      within(preview).getByRole("button", {
        name: "Tulosta kuitti uudelleen #202",
      }),
    );
    await waitFor(() =>
      expect(
        api.post.mock.calls.filter(
          ([path, payload]) =>
            path === "/saleTemp/printBillAfterPay" && payload.billId === 202,
        ),
      ).toHaveLength(2),
    );
    expect(
      api.post.mock.calls.filter(
        ([path, payload]) =>
          path === "/saleTemp/printBillAfterPay" && payload.billId === 201,
      ),
    ).toHaveLength(1);
  });

  it("loads the staff catalog and current table cart on mount", async () => {
    render(<SalePage />);
    await screen.findByText("Test meal");
    expect(api.get).toHaveBeenCalledWith(
      "/food/filter/all",
      expect.any(Object),
    );
    expect(api.get).toHaveBeenCalledWith("/saleTemp/list/", {
      params: { tableNo: 1 },
    });
  });

  it("opens sent order history and cancels only before preparation", async () => {
    let detail: Omit<typeof sentDetail, "history"> & {
      history: {
        version: number;
        toStatus: string;
        at: string;
        reason: string | null;
      }[];
    } = sentDetail;
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/") return Promise.resolve({ data: cart });
      if (path === "/counterOrder/sent")
        return Promise.resolve({
          data: {
            results: [
              {
                ...servedCounterOrder,
                status: detail.status,
                version: detail.version,
              },
            ],
          },
        });
      if (path === "/counterOrder/81")
        return Promise.resolve({ data: { result: detail } });
      return Promise.resolve({ data: { results: [] } });
    });
    api.patch.mockImplementation(() => {
      detail = {
        ...detail,
        status: "CANCELLED",
        version: 3,
        history: [
          ...detail.history,
          {
            version: 3,
            toStatus: "CANCELLED",
            at: "2026-09-23T12:02:00.000Z",
            reason: "Customer request",
          },
        ],
      };
      return Promise.resolve({ data: { result: detail } });
    });
    render(<SalePage />);
    fireEvent.click(
      await screen.findByRole(
        "button",
        { name: "View Order #81" },
        { timeout: 5_000 },
      ),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Huom: Less salt")).toBeTruthy();
    expect(within(dialog).getByText("Tapahtumat")).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Peruuta tilaus" }),
    );
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "Customer request" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Vahvista peruutus" }),
    );
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/counterOrder/81/cancel", {
        expectedVersion: 2,
        reason: "Customer request",
      }),
    );
    expect(await within(dialog).findByText(/Customer request/)).toBeTruthy();
    expect(
      within(dialog).queryByRole("button", { name: "Peruuta tilaus" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Pay Order #81" })).toBeNull();
  });

  it("shows ongoing sent orders by default and opens finished history when the active list is empty", async () => {
    api.get.mockImplementation(
      (path: string, options?: { params?: { view?: string } }) => {
        if (path === "/food/filter/all")
          return Promise.resolve({ data: { results: [food] } });
        if (path === "/saleTemp/list/") return Promise.resolve({ data: cart });
        if (path === "/counterOrder/sent")
          return Promise.resolve({
            data: {
              results:
                options?.params?.view === "history"
                  ? [
                      {
                        ...servedCounterOrder,
                        status: "COMPLETED",
                        billSaleId: 301,
                      },
                    ]
                  : [],
            },
          });
        if (path === "/counterOrder/81")
          return Promise.resolve({
            data: { result: { ...sentDetail, status: "COMPLETED" } },
          });
        return Promise.resolve({ data: { results: [] } });
      },
    );
    render(<SalePage />);
    expect(await screen.findByText("Ei keskeneräisiä tilauksia.")).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith(
      "/counterOrder/sent",
      expect.objectContaining({
        params: { tableNo: 1, view: "active" },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Historia" }));
    expect(
      await screen.findByRole("button", { name: "View Order #81" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Print paid Order #81" }),
    ).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith(
      "/counterOrder/sent",
      expect.objectContaining({
        params: { tableNo: 1, view: "history" },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Käynnissä" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "View Order #81" }),
      ).toBeNull(),
    );
  });

  it("does not offer cancellation after preparation or payment", async () => {
    for (const detail of [
      { ...sentDetail, status: "PREPARING" },
      { ...sentDetail, status: "READY" },
      { ...sentDetail, paidAt: "2026-09-23T12:03:00.000Z" },
    ]) {
      api.get.mockImplementation((path: string) => {
        if (path === "/food/filter/all")
          return Promise.resolve({ data: { results: [food] } });
        if (path === "/saleTemp/list/") return Promise.resolve({ data: cart });
        if (path === "/counterOrder/sent")
          return Promise.resolve({
            data: {
              results: [{ ...servedCounterOrder, status: detail.status }],
            },
          });
        if (path === "/counterOrder/81")
          return Promise.resolve({ data: { result: detail } });
        return Promise.resolve({ data: { results: [] } });
      });
      const view = render(<SalePage />);
      fireEvent.click(
        await screen.findByRole("button", { name: "View Order #81" }),
      );
      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).queryByRole("button", { name: "Peruuta tilaus" }),
      ).toBeNull();
      view.unmount();
    }
  });

  it("allows payment and preview printing while Kitchen still prepares an Order", async () => {
    let status = "CONFIRMED";
    const interval = vi.spyOn(window, "setTimeout");
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/") return Promise.resolve({ data: cart });
      if (path === "/counterOrder/sent")
        return Promise.resolve({
          data: { results: [{ ...servedCounterOrder, status }] },
        });
      return Promise.resolve({ data: { results: [] } });
    });
    api.post.mockImplementation((path: string) =>
      path === "/counterOrder/81/prebill"
        ? Promise.resolve({
            data: new Blob(["pdf"], { type: "application/pdf" }),
            headers: { "content-type": "application/pdf" },
          })
        : Promise.resolve({ data: {} }),
    );
    URL.createObjectURL = vi.fn(() => "blob:sent-order");
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    render(<SalePage />);
    await screen.findByText(/#81 · CONFIRMED/);
    expect(screen.getByRole("button", { name: "Pay Order #81" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Print Order #81" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/counterOrder/81/prebill",
        {},
        { responseType: "blob" },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sulje" }));

    status = "PREPARING";
    const refresh = interval.mock.calls.find(
      ([, delay]) => delay === 10_000,
    )?.[0];
    expect(refresh).toBeTypeOf("function");
    await act(async () => (refresh as () => void)());
    expect(
      await screen.findByRole("button", { name: "Pay Order #81" }),
    ).toBeTruthy();
    expect(await screen.findByText(/#81 · PREPARING/)).toBeTruthy();
    interval.mockRestore();
  });

  it("keeps a new Counter draft through reload and pays with its selected taste", async () => {
    process.env.NEXT_PUBLIC_ORD02_DRAFT_ENABLED = "true";
    localStorage.setItem("test-token", "token");
    localStorage.setItem("next_name", "Cashier");
    localStorage.setItem("next_user_id", "7");
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/") return Promise.resolve({ data: cart });
      if (path === "/counterOrder/options/1")
        return Promise.resolve({
          data: {
            results: { tastes: [{ id: 3, name: "Spicy" }], foodSizes: [] },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });
    api.post.mockImplementation(
      (
        path: string,
        payload: {
          items?: Array<{
            foodId: number;
            quantity: number;
            tasteId?: number | null;
          }>;
        },
      ) => {
        if (path === "/counterOrder/quote") {
          const quantity =
            payload.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
          return Promise.resolve({
            data: {
              results: {
                subtotal: quantity * 25,
                modifierTotal: 0,
                total: quantity * 25,
                items:
                  payload.items?.map((item) => ({
                    foodId: item.foodId,
                    foodName: food.name,
                    quantity: item.quantity,
                    unitBasePrice: 25,
                    lineTotal: item.quantity * 25,
                    modifiers: [],
                  })) ?? [],
              },
            },
          });
        }
        if (path === "/counterOrder/checkout")
          return Promise.resolve({
            data: {
              billId: 90,
              amount: 25,
              inputMoney: 25,
              returnMoney: 0,
            },
          });
        return Promise.resolve({ data: {} });
      },
    );
    render(<SalePage />);
    const image = await screen.findByAltText("Test meal");
    await waitFor(() => expect(image.closest("button")?.disabled).toBe(false));
    fireEvent.click(image);
    await waitFor(() =>
      expect(screen.getByTestId("cart-total").textContent).toContain("25"),
    );
    expect(api.post).not.toHaveBeenCalledWith(
      "/saleTemp/create",
      expect.anything(),
    );
    expect(
      JSON.parse(localStorage.getItem("counter-draft:v1:7:1") ?? "[]"),
    ).toHaveLength(1);
    cleanup();
    render(<SalePage />);
    fireEvent.click(await screen.findByRole("button", { name: /customize/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Spicy" }));
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem("counter-draft:v1:7:1") ?? "[]")[0]
          .tasteId,
      ).toBe(3),
    );
    fireEvent.click(screen.getByRole("button", { name: "Tallenna" }));
    expect(
      screen.queryByRole("button", { name: /^send to kitchen$/i }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^pay$/i }));
    fireEvent.click(screen.getByRole("button", { name: /bank transfer/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete payment/i }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: /^confirm payment$/i,
      }),
    );
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/counterOrder/checkout",
        expect.objectContaining({
          tableNo: 1,
          items: [{ foodId: 1, quantity: 1, foodSizeId: null, tasteId: 3 }],
          payType: "bank",
        }),
      ),
    );
    await waitFor(() =>
      expect(localStorage.getItem("counter-draft:v1:7:1")).toBeNull(),
    );
  });

  it("keeps takeaway separate from a table cart with payment as its only submit action", async () => {
    localStorage.setItem("test-token", "token");
    localStorage.setItem("next_name", "Cashier");
    localStorage.setItem("next_user_id", "7");
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({
          data: {
            results: [{ id: 44, Food: food, quantity: 1 }],
            summary: { baseAmount: 25, addedAmount: 0, total: 25 },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });
    api.post.mockImplementation((path: string) => {
      if (path === "/counterOrder/quote")
        return Promise.resolve({
          data: {
            results: {
              subtotal: 25,
              modifierTotal: 0,
              total: 25,
              items: [
                {
                  foodId: 1,
                  foodName: food.name,
                  quantity: 1,
                  unitBasePrice: 25,
                  lineTotal: 25,
                  modifiers: [],
                },
              ],
            },
          },
        });
      return Promise.resolve({ data: {} });
    });
    render(<SalePage />);
    await screen.findByText("Test meal");
    fireEvent.click(screen.getByRole("button", { name: "Mukaan" }));
    expect(screen.queryByLabelText("Pöytä")).toBeNull();
    const image = screen.getByAltText("Test meal");
    await waitFor(() => expect(image.closest("button")?.disabled).toBe(false));
    fireEvent.click(image);
    await waitFor(() =>
      expect(
        localStorage.getItem("counter-draft:v1:7:takeaway"),
      ).not.toBeNull(),
    );
    expect(screen.getByRole("button", { name: /^pay$/i })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /^send to kitchen$/i }),
    ).toBeNull();
    expect(api.post).not.toHaveBeenCalledWith(
      "/counterOrder/submit",
      expect.anything(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Paikan päällä" }));
    expect(screen.getByLabelText("Pöytä")).toBeTruthy();
    expect(api.post).not.toHaveBeenCalledWith(
      "/saleTemp/clear",
      expect.anything(),
    );
  });

  it("pays takeaway immediately and receives a pickup number", async () => {
    localStorage.setItem("test-token", "token");
    localStorage.setItem("next_name", "Cashier");
    localStorage.setItem("next_user_id", "7");
    localStorage.setItem(
      "counter-draft:v1:7:takeaway",
      JSON.stringify([{ id: 1, foodId: 1, foodSizeId: null, tasteId: null }]),
    );
    api.post.mockImplementation((path: string) => {
      if (path === "/counterOrder/quote")
        return Promise.resolve({
          data: {
            results: {
              subtotal: 25,
              modifierTotal: 0,
              total: 25,
              items: [
                {
                  foodId: 1,
                  foodName: food.name,
                  quantity: 1,
                  unitBasePrice: 25,
                  lineTotal: 25,
                  modifiers: [],
                },
              ],
            },
          },
        });
      if (path === "/counterOrder/checkout")
        return Promise.resolve({
          data: {
            billId: 306,
            pickupNo: 92,
            amount: 25,
            inputMoney: 25,
            returnMoney: 0,
          },
        });
      return Promise.reject(new Error("receipt unavailable"));
    });
    render(<SalePage />);
    fireEvent.click(screen.getByRole("button", { name: "Mukaan" }));
    const pay = await screen.findByRole("button", { name: /^pay$/i });
    await waitFor(() =>
      expect((pay as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(pay);
    fireEvent.click(screen.getByRole("button", { name: /bank transfer/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete payment/i }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: /^confirm payment$/i,
      }),
    );
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/counterOrder/checkout",
        expect.objectContaining({ serviceType: "TAKEAWAY", payType: "bank" }),
      ),
    );
    const checkout = api.post.mock.calls.find(
      ([path]) => path === "/counterOrder/checkout",
    );
    expect(checkout?.[1]).not.toHaveProperty("tableNo");
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Nouto #92 lähetetty keittiöön",
      ),
    );
    expect(localStorage.getItem("counter-draft:v1:7:takeaway")).toBeNull();
  });

  it("retries the same draft checkout after reload when the network result is unknown", async () => {
    process.env.NEXT_PUBLIC_ORD02_DRAFT_ENABLED = "true";
    localStorage.setItem("test-token", "token");
    localStorage.setItem("next_name", "Cashier");
    localStorage.setItem("next_user_id", "7");
    localStorage.setItem(
      "counter-draft:v1:7:1",
      JSON.stringify([{ id: 1, foodId: 1, foodSizeId: null, tasteId: null }]),
    );
    let checkoutCalls = 0;
    api.post.mockImplementation((path: string) => {
      if (path === "/counterOrder/quote")
        return Promise.resolve({
          data: {
            results: {
              subtotal: 25,
              modifierTotal: 0,
              total: 25,
              items: [
                {
                  foodId: 1,
                  foodName: food.name,
                  quantity: 1,
                  unitBasePrice: 25,
                  lineTotal: 25,
                  modifiers: [],
                },
              ],
            },
          },
        });
      if (path === "/counterOrder/checkout") {
        checkoutCalls += 1;
        return checkoutCalls === 1
          ? Promise.reject(new Error("network lost"))
          : Promise.resolve({
              data: {
                billId: 305,
                amount: 25,
                inputMoney: 25,
                returnMoney: 0,
                replayed: true,
              },
            });
      }
      return Promise.reject(new Error("receipt unavailable"));
    });
    vi.stubGlobal("crypto", { randomUUID: () => "draft-retry-key" });
    render(<SalePage />);
    const pay = await screen.findByRole("button", { name: /^pay$/i });
    await waitFor(() =>
      expect((pay as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(pay);
    fireEvent.click(screen.getByRole("button", { name: /bank transfer/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete payment/i }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: /^confirm payment$/i,
      }),
    );
    await waitFor(() => expect(checkoutCalls).toBe(1));
    expect(localStorage.getItem("counter-draft:v1:7:1:attempt")).toContain(
      "draft-retry-key",
    );
    cleanup();
    render(<SalePage />);
    const retry = await screen.findByRole("button", { name: /^pay$/i });
    await waitFor(() =>
      expect((retry as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(retry);
    fireEvent.click(screen.getByRole("button", { name: /complete payment/i }));
    await waitFor(() => expect(checkoutCalls).toBe(2));
    const requests = api.post.mock.calls.filter(
      ([path]) => path === "/counterOrder/checkout",
    );
    expect(requests[0][1]).toEqual(requests[1][1]);
    await waitFor(() => {
      expect(localStorage.getItem("counter-draft:v1:7:1")).toBeNull();
      expect(localStorage.getItem("counter-draft:v1:7:1:attempt")).toBeNull();
    });
    expect(api.post).not.toHaveBeenCalledWith(
      "/saleTemp/endSale",
      expect.anything(),
    );
  });

  it("unlocks a draft when an old unpaid kitchen attempt was never committed", async () => {
    process.env.NEXT_PUBLIC_ORD02_DRAFT_ENABLED = "true";
    localStorage.setItem("test-token", "token");
    localStorage.setItem("next_name", "Cashier");
    localStorage.setItem("next_user_id", "7");
    const items = [{ foodId: 1, quantity: 1, foodSizeId: null, tasteId: null }];
    localStorage.setItem(
      "counter-draft:v1:7:1",
      JSON.stringify([{ id: 1, foodId: 1, foodSizeId: null, tasteId: null }]),
    );
    localStorage.setItem(
      "counter-draft:v1:7:1:attempt",
      JSON.stringify({
        kind: "kitchen",
        payload: { tableNo: 1, items, idempotencyKey: "old-key" },
      }),
    );
    api.post.mockImplementation((path: string) => {
      if (path === "/counterOrder/quote")
        return Promise.resolve({
          data: {
            results: {
              subtotal: 25,
              modifierTotal: 0,
              total: 25,
              items: [
                {
                  foodId: 1,
                  foodName: food.name,
                  quantity: 1,
                  unitBasePrice: 25,
                  lineTotal: 25,
                  modifiers: [],
                },
              ],
            },
          },
        });
      if (path === "/counterOrder/submit")
        return Promise.reject({
          response: { status: 409, data: { code: "PAYMENT_REQUIRED" } },
        });
      return Promise.resolve({ data: {} });
    });
    render(<SalePage />);
    const pay = await screen.findByRole("button", { name: /^pay$/i });
    const recover = await screen.findByRole("button", {
      name: "Tarkista aiempi lähetys",
    });
    expect((pay as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(recover);
    await waitFor(() => {
      expect(localStorage.getItem("counter-draft:v1:7:1:attempt")).toBeNull();
      expect((pay as HTMLButtonElement).disabled).toBe(false);
    });
    expect(localStorage.getItem("counter-draft:v1:7:1")).not.toBeNull();
    expect(api.post).toHaveBeenCalledWith("/counterOrder/submit", {
      tableNo: 1,
      items,
      idempotencyKey: "old-key",
    });
  });

  it("pays a sent Order, keeps the new cart, and reprints its saved bill after a receipt failure", async () => {
    let paid = false;
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({
          data: {
            results: [
              {
                id: 7,
                qty: 1,
                Food: food,
                saleTempDetails: [],
                pricing: { baseAmount: 25, addedAmount: 0, total: 25 },
              },
            ],
            summary: { baseAmount: 25, addedAmount: 0, total: 25 },
          },
        });
      if (path === "/counterOrder/sent")
        return Promise.resolve({
          data: {
            results: paid
              ? []
              : [
                  servedCounterOrder,
                  {
                    ...servedCounterOrder,
                    id: 82,
                    status: "SUBMITTED",
                    version: 1,
                  },
                ],
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });
    api.post.mockImplementation((path: string) => {
      if (path === "/counterOrder/81/settle") {
        paid = true;
        return Promise.resolve({
          data: { billId: 201, amount: 80, inputMoney: 80, returnMoney: 0 },
        });
      }
      return Promise.reject(new Error("receipt unavailable"));
    });
    vi.stubGlobal("crypto", { randomUUID: () => "served-payment-key" });
    render(<SalePage />);
    expect(
      await screen.findByRole("button", { name: "Pay Order #82" }),
    ).toBeTruthy();
    fireEvent.click(
      await screen.findByRole("button", { name: "Pay Order #81" }),
    );
    expect(screen.getByText("Maksu · #81")).toBeTruthy();
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: /bank transfer/i,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: /bank transfer/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete payment/i }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/counterOrder/81/settle", {
        expectedVersion: 5,
        idempotencyKey: "served-payment-key",
        payType: "bank",
      }),
    );
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        "Maksu tallennettu",
        expect.any(Object),
      ),
    );
    expect(screen.getByTestId("cart-total").textContent).toContain("25");
    expect(
      api.get.mock.calls.filter(([path]) => path === "/saleTemp/list/"),
    ).toHaveLength(1);
    expect(
      api.post.mock.calls.some(([path]) => path === "/saleTemp/endSale"),
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Tulosta kuitti uudelleen #201" }),
    );
    await waitFor(() =>
      expect(
        api.post.mock.calls.filter(
          ([path]) => path === "/saleTemp/printBillAfterPay",
        ),
      ).toHaveLength(2),
    );
    expect(
      api.post.mock.calls.filter(
        ([path]) => path === "/counterOrder/81/settle",
      ),
    ).toHaveLength(1);
  });

  it("locks uncertain cash payment details and retries the identical Order payload without double submission", async () => {
    let rejectPayment!: (error: Error) => void;
    api.post.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectPayment = reject;
        }),
    );
    const onPaid = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const newKey = vi.fn(() => "cash-order-key");
    vi.stubGlobal("crypto", { randomUUID: newKey });
    const view = render(
      <CounterOrderCheckout
        order={servedCounterOrder}
        onClose={onClose}
        onPaid={onPaid}
        onBusyChange={vi.fn()}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    fireEvent.change(screen.getByLabelText("Vastaanotettu"), {
      target: { value: "100" },
    });
    const complete = screen.getByRole("button", { name: /complete payment/i });
    await waitFor(() =>
      expect((complete as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(complete);
    fireEvent.click(complete);
    expect(api.post).toHaveBeenCalledTimes(1);
    rejectPayment(new Error("connection lost after commit"));
    await screen.findByText(/Maksun tulos on epävarma/);
    expect(
      (screen.getByLabelText("Vastaanotettu") as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: /bank transfer/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Peruuta" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    api.post.mockResolvedValueOnce({
      data: { billId: 202, amount: 80, inputMoney: 100, returnMoney: 20 },
    });
    view.unmount();
    render(
      <CounterOrderCheckout
        order={servedCounterOrder}
        onClose={onClose}
        onPaid={onPaid}
        onBusyChange={vi.fn()}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const retry = screen.getByRole("button", { name: /complete payment/i });
    await waitFor(() =>
      expect((retry as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(retry);
    await waitFor(() => expect(onPaid).toHaveBeenCalledWith(202));
    expect(api.post.mock.calls[0]).toEqual(api.post.mock.calls[1]);
    expect(api.post.mock.calls[1][1]).toEqual({
      expectedVersion: 5,
      idempotencyKey: "cash-order-key",
      payType: "cash",
      inputMoney: 100,
    });
    expect(newKey).toHaveBeenCalledTimes(1);
  });

  it("refreshes a stale Order after a rejected payment without retrying it automatically", async () => {
    api.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { code: "STALE_VERSION" } },
    });
    const onClose = vi.fn();
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const onPaid = vi.fn();
    render(
      <CounterOrderCheckout
        order={servedCounterOrder}
        onClose={onClose}
        onPaid={onPaid}
        onBusyChange={vi.fn()}
        onRefresh={onRefresh}
      />,
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: /bank transfer/i,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: /bank transfer/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete payment/i }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPaid).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("renders the approved responsive product card without helper content", async () => {
    render(<SalePage />);

    const product = await screen.findByRole("button", { name: /test meal/i });
    expect(product.className).toContain("h-[202px]");
    expect(product.className).toContain("w-[158px]");
    expect(product.className).toContain("xl:h-[220px]");
    expect(product.className).toContain("xl:w-[181px]");
    expect(screen.queryByText("Valitse ja muokkaa")).toBeNull();
  });

  it("shows the catalog loading and empty states", async () => {
    let resolveFoods: (value: {
      data: { results: Array<typeof food> };
    }) => void;
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all") {
        return new Promise((resolve) => {
          resolveFoods = resolve;
        });
      }
      if (path === "/food/filter/drink") {
        return Promise.resolve({ data: { results: [] } });
      }
      if (path === "/saleTemp/list/") return Promise.resolve({ data: cart });
      return Promise.resolve({ data: { results: [] } });
    });

    render(<SalePage />);
    expect(screen.getByLabelText("Ruokalistaa ladataan")).toBeTruthy();
    await waitFor(() => expect(resolveFoods).toBeTypeOf("function"));
    resolveFoods!({ data: { results: [food] } });
    await screen.findByText("Test meal");

    fireEvent.click(screen.getByRole("button", { name: /drinks/i }));
    expect(await screen.findByText("Ei tuotteita")).toBeTruthy();
    expect(
      screen.getByText("Valitussa tuoteryhmässä ei ole tuotteita."),
    ).toBeTruthy();
  });

  it("shows the catalog error state and retries the active filter", async () => {
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all") {
        return Promise.reject(new Error("network unavailable"));
      }
      if (path === "/saleTemp/list/") return Promise.resolve({ data: cart });
      return Promise.resolve({ data: { results: [] } });
    });

    render(<SalePage />);
    expect(await screen.findByText("Ruokalistaa ei voitu ladata")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yritä uudelleen" }));

    await waitFor(() =>
      expect(
        api.get.mock.calls.filter(([path]) => path === "/food/filter/all"),
      ).toHaveLength(2),
    );
  });

  it("filters categories and adds a menu item using the selected table", async () => {
    const view = render(<SalePage />);
    await screen.findByText("Test meal");
    const searchInput = screen.getByRole("textbox", { name: "Hae tuotetta" });
    fireEvent.change(searchInput, { target: { value: "missing" } });
    expect(screen.getByText("Ei tuotteita")).toBeTruthy();
    view.rerender(<SalePage />);
    expect(screen.getByRole("textbox", { name: "Hae tuotetta" })).toBe(
      searchInput,
    );
    expect((searchInput as HTMLInputElement).value).toBe("missing");
    fireEvent.change(searchInput, { target: { value: "Test meal" } });
    fireEvent.click(screen.getByAltText("Test meal"));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/saleTemp/create", {
        tableNo: 1,
        foodId: 1,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /drinks/i }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/food/filter/drink",
        expect.any(Object),
      ),
    );
  });

  it("reloads the cart for the newly selected table", async () => {
    render(<SalePage />);
    await screen.findByText("Test meal");
    const tableInput = screen.getByDisplayValue("1");
    fireEvent.change(tableInput, { target: { value: "2" } });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/saleTemp/list/", {
        params: { tableNo: 2 },
      }),
    );
  });

  it("prevents duplicate cart additions while an add request is pending", async () => {
    let resolveAdd: (value: { data: object }) => void;
    api.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAdd = resolve;
        }),
    );
    render(<SalePage />);
    const image = await screen.findByAltText("Test meal");
    const productCard = image.closest("button")!;
    expect(productCard.className).not.toContain("disabled:opacity");
    await waitFor(() =>
      expect((productCard as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(image);
    fireEvent.click(image);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByAltText("Test meal")).toBe(image);
    expect(screen.queryByLabelText("Ruokalistaa ladataan")).toBeNull();
    resolveAdd!({ data: {} });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/saleTemp/list/", {
        params: { tableNo: 1 },
      }),
    );
    expect(screen.getByAltText("Test meal")).toBe(image);
    expect(
      api.get.mock.calls.filter(([path]) => path === "/food/filter/all"),
    ).toHaveLength(1);
  });

  it("keeps product images mounted across different additions and quantity refreshes", async () => {
    const secondFood = {
      id: 2,
      name: "Second meal",
      img: "second.jpg",
      price: 18,
    };
    const cartWithItem = {
      results: [
        {
          id: 7,
          qty: 1,
          Food: food,
          saleTempDetails: [],
          pricing: { baseAmount: 25, addedAmount: 0, total: 25 },
        },
      ],
      summary: { baseAmount: 25, addedAmount: 0, total: 25 },
    };
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all") {
        return Promise.resolve({ data: { results: [food, secondFood] } });
      }
      if (path === "/saleTemp/list/") {
        return Promise.resolve({ data: cartWithItem });
      }
      return Promise.resolve({ data: { results: [] } });
    });

    render(<SalePage />);
    const firstImage = await screen.findByAltText("Test meal");
    const secondImage = screen.getByAltText("Second meal");
    await waitFor(() =>
      expect((firstImage.closest("button") as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );

    fireEvent.click(firstImage);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        (secondImage.closest("button") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(secondImage);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /increase/i }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(await screen.findByRole("button", { name: /increase/i }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/saleTemp/updateQty", {
        qty: 2,
        id: 7,
      }),
    );

    expect(screen.getByAltText("Test meal")).toBe(firstImage);
    expect(screen.getByAltText("Second meal")).toBe(secondImage);
    expect(
      api.get.mock.calls.filter(([path]) => path === "/food/filter/all"),
    ).toHaveLength(1);
  });

  it("removes a confirmed cart item and refreshes the cart", async () => {
    const cartWithItem = {
      results: [
        {
          id: 7,
          qty: 1,
          Food: food,
          saleTempDetails: [],
          pricing: { baseAmount: 25, addedAmount: 0, total: 25 },
        },
      ],
      summary: { baseAmount: 25, addedAmount: 0, total: 25 },
    };
    api.get.mockImplementation((path: string) =>
      Promise.resolve({
        data: path === "/food/filter/all" ? { results: [food] } : cartWithItem,
      }),
    );
    render(<SalePage />);
    fireEvent.click(await screen.findByRole("button", { name: /^remove$/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /remove item/i }),
    );

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/saleTemp/remove/7"),
    );
    expect(
      api.get.mock.calls.filter(([path]) => path === "/saleTemp/list/"),
    ).toHaveLength(2);
  });

  it("does not mutate a cart item when removal is cancelled", async () => {
    const cartWithItem = {
      results: [
        {
          id: 7,
          qty: 1,
          Food: food,
          saleTempDetails: [],
          pricing: { baseAmount: 25, addedAmount: 0, total: 25 },
        },
      ],
      summary: { baseAmount: 25, addedAmount: 0, total: 25 },
    };
    api.get.mockImplementation((path: string) =>
      Promise.resolve({
        data: path === "/food/filter/all" ? { results: [food] } : cartWithItem,
      }),
    );

    render(<SalePage />);
    fireEvent.click(await screen.findByRole("button", { name: /^remove$/i }));

    expect(await screen.findByText("Remove this item?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("clears a confirmed cart and refreshes the selected table", async () => {
    const cartWithItem = {
      results: [
        {
          id: 7,
          qty: 1,
          Food: food,
          saleTempDetails: [],
          pricing: { baseAmount: 25, addedAmount: 0, total: 25 },
        },
      ],
      summary: { baseAmount: 25, addedAmount: 0, total: 25 },
    };
    api.get.mockImplementation((path: string) =>
      Promise.resolve({
        data: path === "/food/filter/all" ? { results: [food] } : cartWithItem,
      }),
    );
    render(<SalePage />);
    const clear = screen.getByRole("button", {
      name: /^clear$/i,
    }) as HTMLButtonElement;
    await waitFor(() => expect(clear.disabled).toBe(false));
    fireEvent.click(clear);
    fireEvent.click(
      await screen.findByRole("button", { name: /clear order/i }),
    );

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/saleTemp/removeAll", {
        data: { tableNo: 1 },
      }),
    );
    expect(
      api.get.mock.calls.filter(([path]) => path === "/saleTemp/list/"),
    ).toHaveLength(2);
  });

  it("does not mutate a cart when clear is cancelled", async () => {
    const cartWithItem = {
      results: [
        {
          id: 7,
          qty: 1,
          Food: food,
          saleTempDetails: [],
          pricing: { baseAmount: 25, addedAmount: 0, total: 25 },
        },
      ],
      summary: { baseAmount: 25, addedAmount: 0, total: 25 },
    };
    api.get.mockImplementation((path: string) =>
      Promise.resolve({
        data: path === "/food/filter/all" ? { results: [food] } : cartWithItem,
      }),
    );

    render(<SalePage />);
    const clear = screen.getByRole("button", {
      name: /^clear$/i,
    }) as HTMLButtonElement;
    await waitFor(() => expect(clear.disabled).toBe(false));
    fireEvent.click(clear);

    expect(await screen.findByText("Clear this order?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("submits a server-refreshed bank checkout with an idempotency key", async () => {
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({
          data: {
            results: [],
            summary: { baseAmount: 25, addedAmount: 0, total: 25 },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });
    api.post.mockImplementation((path: string) => {
      if (path === "/saleTemp/endSale")
        return Promise.resolve({
          data: {
            billId: 9,
            amount: 25,
            inputMoney: 25,
            returnMoney: 0,
            replayed: false,
          },
        });
      return Promise.resolve({
        data: new Blob(["pdf"], { type: "application/pdf" }),
        headers: { "content-type": "application/pdf" },
      });
    });
    // Coordinates random uuid behavior for this module.
    vi.stubGlobal("crypto", { randomUUID: () => "checkout-key" });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    URL.createObjectURL = vi.fn(() => "blob:test");
    render(<SalePage />);
    await screen.findByText("Test meal");
    fireEvent.click(screen.getByRole("button", { name: /^pay$/i }));
    fireEvent.click(screen.getByRole("button", { name: /bank transfer/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete payment/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /^confirm payment$/i }),
    );
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/saleTemp/endSale", {
        tableNo: 1,
        payType: "bank",
        idempotencyKey: "checkout-key",
      }),
    );
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/counterOrder/sent",
        expect.objectContaining({
          params: { tableNo: 1, view: "active" },
        }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Tilaus lähetetty keittiöön");
  });

  it("offers payment but no unpaid kitchen send for a legacy cart", async () => {
    const cartWithItem = {
      results: [
        {
          id: 7,
          qty: 1,
          Food: food,
          saleTempDetails: [],
          pricing: { baseAmount: 25, addedAmount: 0, total: 25 },
        },
      ],
      summary: { baseAmount: 25, addedAmount: 0, total: 25 },
    };
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({ data: cartWithItem });
      return Promise.resolve({ data: { results: [] } });
    });
    render(<SalePage />);
    expect(await screen.findByRole("button", { name: /^pay$/i })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /^send to kitchen$/i }),
    ).toBeNull();
    expect(api.post).not.toHaveBeenCalledWith(
      "/saleTemp/submitToKitchen",
      expect.anything(),
    );
  });

  it("reuses the idempotency key after a retryable checkout failure", async () => {
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({
          data: {
            results: [],
            summary: { baseAmount: 25, addedAmount: 0, total: 25 },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });
    api.post.mockRejectedValueOnce(new Error("network unavailable"));
    // Coordinates random uuid behavior for this module.
    vi.stubGlobal("crypto", { randomUUID: () => "retry-key" });
    render(<SalePage />);
    await screen.findByText("Test meal");
    fireEvent.click(screen.getByRole("button", { name: /^pay$/i }));
    fireEvent.click(screen.getByRole("button", { name: /bank transfer/i }));
    const complete = screen.getByRole("button", { name: /complete payment/i });
    fireEvent.click(complete);
    fireEvent.click(
      await screen.findByRole("button", { name: /^confirm payment$/i }),
    );
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/saleTemp/endSale", {
        tableNo: 1,
        payType: "bank",
        idempotencyKey: "retry-key",
      }),
    );
    api.post.mockResolvedValueOnce({
      data: {
        billId: 10,
        amount: 25,
        inputMoney: 25,
        returnMoney: 0,
        replayed: true,
      },
    });
    fireEvent.click(complete);
    await waitFor(() =>
      expect(
        api.post.mock.calls.filter(([path]) => path === "/saleTemp/endSale"),
      ).toHaveLength(2),
    );
    expect(
      api.post.mock.calls.filter(
        ([path]) => path === "/saleTemp/endSale",
      )[1][1],
    ).toEqual({ tableNo: 1, payType: "bank", idempotencyKey: "retry-key" });
  });

  it("creates and revokes the pre-bill Blob URL with the POS lifecycle", async () => {
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({
          data: {
            results: [],
            summary: { baseAmount: 25, addedAmount: 0, total: 25 },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });
    api.post.mockResolvedValue({
      data: new Blob(["pdf"], { type: "application/pdf" }),
      headers: { "content-type": "application/pdf" },
    });
    const createObjectURL = vi.fn(() => "blob:receipt");
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    const view = render(<SalePage />);
    await screen.findByText("Test meal");
    fireEvent.click(screen.getByRole("button", { name: /print pre-bill/i }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:receipt");
  });

  it("labels a browser-draft pre-bill as unpaid", async () => {
    process.env.NEXT_PUBLIC_ORD02_DRAFT_ENABLED = "true";
    localStorage.setItem("test-token", "token");
    localStorage.setItem("next_name", "Cashier");
    localStorage.setItem("next_user_id", "7");
    localStorage.setItem(
      "counter-draft:v1:7:1",
      JSON.stringify([{ id: 1, foodId: 1, foodSizeId: null, tasteId: null }]),
    );
    api.post.mockImplementation((path: string) => {
      if (path === "/counterOrder/quote")
        return Promise.resolve({
          data: {
            results: {
              subtotal: 25,
              modifierTotal: 0,
              total: 25,
              items: [
                {
                  foodId: 1,
                  foodName: food.name,
                  quantity: 1,
                  unitBasePrice: 25,
                  lineTotal: 25,
                  modifiers: [],
                },
              ],
            },
          },
        });
      if (path === "/counterOrder/prebill")
        return Promise.resolve({
          data: new Blob(["pdf"], { type: "application/pdf" }),
          headers: { "content-type": "application/pdf" },
        });
      return Promise.resolve({ data: {} });
    });
    URL.createObjectURL = vi.fn(() => "blob:prebill");
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    render(<SalePage />);
    await waitFor(() =>
      expect(screen.getByTestId("cart-total").textContent).toContain("25"),
    );
    fireEvent.click(screen.getByRole("button", { name: /print pre-bill/i }));
    expect(await screen.findByText("Esilasku valmis")).toBeTruthy();
    expect(screen.queryByText("Maksu hyväksytty")).toBeNull();
    expect(api.post).toHaveBeenCalledWith(
      "/counterOrder/prebill",
      {
        tableNo: 1,
        items: [{ foodId: 1, quantity: 1, foodSizeId: null, tasteId: null }],
      },
      { responseType: "blob" },
    );
  });

  it("ignores a stale cart response after switching tables", async () => {
    let resolveTableOne: (value: { data: typeof cart }) => void;
    api.get.mockImplementation(
      (path: string, options?: { params?: { tableNo?: number } }) => {
        if (path === "/food/filter/all")
          return Promise.resolve({ data: { results: [food] } });
        if (path === "/saleTemp/list/" && options?.params?.tableNo === 1) {
          return new Promise((resolve) => {
            resolveTableOne = resolve;
          });
        }
        if (path === "/saleTemp/list/" && options?.params?.tableNo === 2) {
          return Promise.resolve({
            data: {
              results: [],
              summary: { baseAmount: 222, addedAmount: 0, total: 222 },
            },
          });
        }
        return Promise.resolve({ data: { results: [] } });
      },
    );
    render(<SalePage />);
    await screen.findByText("Test meal");
    fireEvent.change(screen.getByDisplayValue("1"), { target: { value: "2" } });
    await waitFor(() =>
      expect(screen.getByTestId("cart-total").textContent?.trim()).toBe(
        "222,00 €",
      ),
    );
    resolveTableOne!({
      data: {
        results: [],
        summary: { baseAmount: 111, addedAmount: 0, total: 111 },
      },
    });
    await waitFor(() =>
      expect(screen.getByTestId("cart-total").textContent?.trim()).toBe(
        "222,00 €",
      ),
    );
  });

  it("ignores a pending cart response after changing to an invalid table", async () => {
    let resolveTableOne: (value: { data: typeof cart }) => void;
    api.get.mockImplementation(
      (path: string, options?: { params?: { tableNo?: number } }) => {
        if (path === "/food/filter/all")
          return Promise.resolve({ data: { results: [food] } });
        if (path === "/saleTemp/list/" && options?.params?.tableNo === 1) {
          return new Promise((resolve) => {
            resolveTableOne = resolve;
          });
        }
        return Promise.resolve({ data: { results: [] } });
      },
    );

    render(<SalePage />);
    await screen.findByText("Test meal");
    fireEvent.change(screen.getByDisplayValue("1"), { target: { value: "" } });
    expect(screen.getByTestId("cart-total").textContent?.trim()).toBe("0,00 €");

    resolveTableOne!({
      data: {
        results: [],
        summary: { baseAmount: 111, addedAmount: 0, total: 111 },
      },
    });
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(screen.getByTestId("cart-total").textContent?.trim()).toBe("0,00 €");
  });

  it("does not refresh the old cart after an add completes following a table change", async () => {
    let resolveAdd: (value: { data: object }) => void;
    api.get.mockImplementation(
      (path: string, options?: { params?: { tableNo?: number } }) => {
        if (path === "/food/filter/all")
          return Promise.resolve({ data: { results: [food] } });
        if (path === "/saleTemp/list/" && options?.params?.tableNo === 1) {
          return Promise.resolve({
            data: {
              results: [],
              summary: { baseAmount: 111, addedAmount: 0, total: 111 },
            },
          });
        }
        if (path === "/saleTemp/list/" && options?.params?.tableNo === 2) {
          return Promise.resolve({
            data: {
              results: [],
              summary: { baseAmount: 222, addedAmount: 0, total: 222 },
            },
          });
        }
        return Promise.resolve({ data: { results: [] } });
      },
    );
    api.post.mockImplementation((path: string) => {
      if (path === "/saleTemp/create") {
        return new Promise((resolve) => {
          resolveAdd = resolve;
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<SalePage />);
    fireEvent.click(await screen.findByAltText("Test meal"));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/saleTemp/create", {
        tableNo: 1,
        foodId: 1,
      }),
    );

    fireEvent.change(screen.getByDisplayValue("1"), { target: { value: "2" } });
    await waitFor(() =>
      expect(screen.getByTestId("cart-total").textContent?.trim()).toBe(
        "222,00 €",
      ),
    );

    resolveAdd!({ data: {} });
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(screen.getByTestId("cart-total").textContent?.trim()).toBe(
      "222,00 €",
    );
    expect(
      api.get.mock.calls.filter(
        ([path, options]) =>
          path === "/saleTemp/list/" && options?.params?.tableNo === 1,
      ),
    ).toHaveLength(1);
  });

  it("loads customization options and sends the canonical taste mutation", async () => {
    const cartWithItem = {
      results: [
        {
          id: 7,
          qty: 1,
          Food: food,
          saleTempDetails: [],
          pricing: { baseAmount: 25, addedAmount: 0, total: 25 },
        },
      ],
      summary: { baseAmount: 25, addedAmount: 0, total: 25 },
    };
    const detail = {
      id: 11,
      saleTempId: 7,
      tasteId: null,
      foodSizeId: null,
      Food: food,
    };
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({ data: cartWithItem });
      if (path === "/saleTemp/info/7")
        return Promise.resolve({
          data: {
            results: {
              saleTempDetails: [detail],
              Food: {
                FoodType: { tastes: [{ id: 3, name: "Spicy" }], foodSizes: [] },
              },
            },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });
    render(<SalePage />);
    await screen.findByRole("button", { name: /customize/i });
    fireEvent.click(screen.getByRole("button", { name: /customize/i }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/saleTemp/generateSaleTempDetail",
        { saleTempId: 7 },
      ),
    );
    await screen.findByRole("button", { name: "Spicy" });
    fireEvent.click(screen.getByRole("button", { name: "Spicy" }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/saleTemp/selectTaste", {
        saleTempDetailId: 11,
        tasteId: 3,
      }),
    );
  });

  it("unselects a selected taste through the canonical endpoint", async () => {
    const cartWithItem = {
      results: [
        {
          id: 7,
          qty: 1,
          Food: food,
          saleTempDetails: [],
          pricing: { baseAmount: 25, addedAmount: 0, total: 25 },
        },
      ],
      summary: { baseAmount: 25, addedAmount: 0, total: 25 },
    };
    const detail = {
      id: 11,
      saleTempId: 7,
      tasteId: 3,
      foodSizeId: null,
      Food: food,
    };
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({ data: cartWithItem });
      if (path === "/saleTemp/info/7")
        return Promise.resolve({
          data: {
            results: {
              saleTempDetails: [detail],
              Food: {
                FoodType: { tastes: [{ id: 3, name: "Spicy" }], foodSizes: [] },
              },
            },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });

    render(<SalePage />);
    fireEvent.click(await screen.findByRole("button", { name: /customize/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Spicy" }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/saleTemp/unSelectTaste", {
        saleTempDetailId: 11,
      }),
    );
  });

  it("selects a size and refreshes cart and customization data", async () => {
    const cartWithItem = {
      results: [
        {
          id: 7,
          qty: 1,
          Food: food,
          saleTempDetails: [],
          pricing: { baseAmount: 25, addedAmount: 0, total: 25 },
        },
      ],
      summary: { baseAmount: 25, addedAmount: 0, total: 25 },
    };
    const detail = {
      id: 11,
      saleTempId: 7,
      tasteId: null,
      foodSizeId: null,
      Food: food,
    };
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({ data: cartWithItem });
      if (path === "/saleTemp/info/7")
        return Promise.resolve({
          data: {
            results: {
              saleTempDetails: [detail],
              Food: {
                FoodType: {
                  tastes: [],
                  foodSizes: [{ id: 4, name: "Large", moneyAdded: 5 }],
                },
              },
            },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });

    render(<SalePage />);
    await screen.findByAltText("Test meal");
    fireEvent.click(await screen.findByRole("button", { name: /customize/i }));
    fireEvent.click(await screen.findByRole("button", { name: /\+5 large/i }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/saleTemp/selectSize", {
        sizeId: 4,
        saleTempDetailId: 11,
      }),
    );
    expect(
      api.get.mock.calls.filter(([path]) => path === "/saleTemp/list/"),
    ).toHaveLength(3);
    expect(
      api.get.mock.calls.filter(([path]) => path === "/saleTemp/info/7"),
    ).toHaveLength(2);
  });

  it("clears a selected size with the existing toggle payload", async () => {
    const cartWithItem = {
      results: [
        {
          id: 7,
          qty: 1,
          Food: food,
          saleTempDetails: [],
          pricing: { baseAmount: 25, addedAmount: 5, total: 30 },
        },
      ],
      summary: { baseAmount: 25, addedAmount: 5, total: 30 },
    };
    const detail = {
      id: 11,
      saleTempId: 7,
      tasteId: null,
      foodSizeId: 4,
      Food: food,
    };
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({ data: cartWithItem });
      if (path === "/saleTemp/info/7")
        return Promise.resolve({
          data: {
            results: {
              saleTempDetails: [detail],
              Food: {
                FoodType: {
                  tastes: [],
                  foodSizes: [{ id: 4, name: "Large", moneyAdded: 5 }],
                },
              },
            },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });

    render(<SalePage />);
    await screen.findByAltText("Test meal");
    fireEvent.click(await screen.findByRole("button", { name: /customize/i }));
    fireEvent.click(await screen.findByRole("button", { name: /\+5 large/i }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/saleTemp/selectSize", {
        sizeId: null,
        saleTempDetailId: 11,
      }),
    );
  });

  it("creates a customization detail and refreshes cart and detail data", async () => {
    const cartWithItem = {
      results: [
        {
          id: 7,
          qty: 1,
          Food: food,
          saleTempDetails: [],
          pricing: { baseAmount: 25, addedAmount: 0, total: 25 },
        },
      ],
      summary: { baseAmount: 25, addedAmount: 0, total: 25 },
    };
    const detail = {
      id: 11,
      saleTempId: 7,
      tasteId: null,
      foodSizeId: null,
      Food: food,
    };
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({ data: cartWithItem });
      if (path === "/saleTemp/info/7")
        return Promise.resolve({
          data: {
            results: {
              saleTempDetails: [detail],
              Food: { FoodType: { tastes: [], foodSizes: [] } },
            },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });

    render(<SalePage />);
    fireEvent.click(await screen.findByRole("button", { name: /customize/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^add$/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/saleTemp/createSaleTempDetail", {
        saleTempId: 7,
      }),
    );
    expect(
      api.get.mock.calls.filter(([path]) => path === "/saleTemp/list/"),
    ).toHaveLength(3);
    expect(
      api.get.mock.calls.filter(([path]) => path === "/saleTemp/info/7"),
    ).toHaveLength(2);
  });

  it("removes one customization detail and refreshes the remaining detail state", async () => {
    const cartWithItem = {
      results: [
        {
          id: 7,
          qty: 2,
          Food: food,
          saleTempDetails: [],
          pricing: { baseAmount: 50, addedAmount: 0, total: 50 },
        },
      ],
      summary: { baseAmount: 50, addedAmount: 0, total: 50 },
    };
    const details = [
      { id: 11, saleTempId: 7, tasteId: null, foodSizeId: null, Food: food },
      { id: 12, saleTempId: 7, tasteId: null, foodSizeId: null, Food: food },
    ];
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({ data: cartWithItem });
      if (path === "/saleTemp/info/7")
        return Promise.resolve({
          data: {
            results: {
              saleTempDetails: details,
              Food: { FoodType: { tastes: [], foodSizes: [] } },
            },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });

    render(<SalePage />);
    fireEvent.click(await screen.findByRole("button", { name: /customize/i }));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("row")
          .some((row) => row.textContent?.includes("Test meal")),
      ).toBe(true),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: /poista annos/i })[0],
    );

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(
        "/saleTemp/removeSaleTempDetailModal",
        { data: { saleTempDetailId: 11 } },
      ),
    );
    expect(
      api.get.mock.calls.filter(([path]) => path === "/saleTemp/list/"),
    ).toHaveLength(3);
    expect(
      api.get.mock.calls.filter(([path]) => path === "/saleTemp/info/7"),
    ).toHaveLength(2);
  });

  it("closes and resets customization state after removing its final detail", async () => {
    const cartWithItem = {
      results: [
        {
          id: 7,
          qty: 1,
          Food: food,
          saleTempDetails: [],
          pricing: { baseAmount: 25, addedAmount: 0, total: 25 },
        },
      ],
      summary: { baseAmount: 25, addedAmount: 0, total: 25 },
    };
    const detail = {
      id: 11,
      saleTempId: 7,
      tasteId: null,
      foodSizeId: null,
      Food: food,
    };
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({ data: cartWithItem });
      if (path === "/saleTemp/info/7")
        return Promise.resolve({
          data: {
            results: {
              saleTempDetails: [detail],
              Food: { FoodType: { tastes: [], foodSizes: [] } },
            },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });

    render(<SalePage />);
    fireEvent.click(await screen.findByRole("button", { name: /customize/i }));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("row")
          .some((row) => row.textContent?.includes("Test meal")),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: /poista annos/i }));

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(
        "/saleTemp/removeSaleTempDetailModal",
        { data: { saleTempDetailId: 11 } },
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText("Muokkaa tilausta")).toBeNull(),
    );
    expect(
      (screen.getByRole("button", { name: /^add$/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("keeps checkout unavailable when cash received is below the refreshed total", async () => {
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({
          data: {
            results: [],
            summary: { baseAmount: 25, addedAmount: 0, total: 25 },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });

    render(<SalePage />);
    await screen.findByText("Test meal");
    fireEvent.click(screen.getByRole("button", { name: /^pay$/i }));
    const complete = screen.getByRole("button", {
      name: /complete payment/i,
    }) as HTMLButtonElement;
    expect(complete.disabled).toBe(true);
    fireEvent.click(complete);
    expect(
      api.post.mock.calls.filter(([path]) => path === "/saleTemp/endSale"),
    ).toHaveLength(0);
  });

  it("rejects malformed nested cart data without rendering invalid state", async () => {
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({
          data: {
            results: [{ id: 7 }],
            summary: { baseAmount: 25, addedAmount: 0, total: 25 },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });

    render(<SalePage />);
    await screen.findByText("Test meal");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Something went wrong",
        expect.objectContaining({ description: "Invalid cart response" }),
      ),
    );
    expect(screen.queryByRole("button", { name: /^remove$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^pay$/i })).toBeNull();
  });

  it("prevents duplicate checkout submission while the server confirmation is pending", async () => {
    let resolveCheckout: (value: {
      data: {
        billId: number;
        amount: number;
        inputMoney: number;
        returnMoney: number;
        replayed: boolean;
      };
    }) => void;
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({
          data: {
            results: [],
            summary: { baseAmount: 25, addedAmount: 0, total: 25 },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });
    api.post.mockImplementation((path: string) => {
      if (path === "/saleTemp/endSale") {
        return new Promise((resolve) => {
          resolveCheckout = resolve;
        });
      }
      return Promise.resolve({
        data: new Blob(["pdf"], { type: "application/pdf" }),
        headers: { "content-type": "application/pdf" },
      });
    });
    // Coordinates random uuid behavior for this module.
    vi.stubGlobal("crypto", { randomUUID: () => "duplicate-key" });
    URL.createObjectURL = vi.fn(() => "blob:duplicate");
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    render(<SalePage />);
    await screen.findByText("Test meal");
    fireEvent.click(screen.getByRole("button", { name: /^pay$/i }));
    fireEvent.click(screen.getByRole("button", { name: /bank transfer/i }));
    const complete = screen.getByRole("button", { name: /complete payment/i });
    fireEvent.click(complete);
    fireEvent.click(complete);
    fireEvent.click(
      await screen.findByRole("button", { name: /^confirm payment$/i }),
    );

    await waitFor(() =>
      expect(
        api.post.mock.calls.filter(([path]) => path === "/saleTemp/endSale"),
      ).toHaveLength(1),
    );
    resolveCheckout!({
      data: {
        billId: 31,
        amount: 25,
        inputMoney: 25,
        returnMoney: 0,
        replayed: false,
      },
    });
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/saleTemp/printBillAfterPay",
        { billId: 31 },
        { responseType: "blob" },
      ),
    );
  });

  it("shows the receipt preview after a successful checkout", async () => {
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({
          data: {
            results: [],
            summary: { baseAmount: 25, addedAmount: 0, total: 25 },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });
    api.post.mockImplementation((path: string) => {
      if (path === "/saleTemp/endSale")
        return Promise.resolve({
          data: {
            billId: 32,
            amount: 25,
            inputMoney: 25,
            returnMoney: 0,
            replayed: false,
          },
        });
      return Promise.resolve({
        data: new Blob(["pdf"], { type: "application/pdf" }),
        headers: { "content-type": "application/pdf" },
      });
    });
    // Coordinates random uuid behavior for this module.
    vi.stubGlobal("crypto", { randomUUID: () => "receipt-key" });
    URL.createObjectURL = vi.fn(() => "blob:paid-receipt");
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    render(<SalePage />);
    await screen.findByText("Test meal");
    fireEvent.click(screen.getByRole("button", { name: /^pay$/i }));
    fireEvent.click(screen.getByRole("button", { name: /bank transfer/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete payment/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /^confirm payment$/i }),
    );

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/saleTemp/endSale", {
        tableNo: 1,
        payType: "bank",
        idempotencyKey: "receipt-key",
      }),
    );
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/saleTemp/printBillAfterPay",
        { billId: 32 },
        { responseType: "blob" },
      ),
    );
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(screen.getByTitle("Kuitin esikatselu").getAttribute("src")).toBe(
      "blob:paid-receipt#toolbar=0&navpanes=0&view=FitH",
    );
  });

  it("keeps a completed sale and reports when its receipt cannot be opened", async () => {
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({
          data: {
            results: [],
            summary: { baseAmount: 25, addedAmount: 0, total: 25 },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });
    api.post.mockImplementation((path: string) => {
      if (path === "/saleTemp/endSale")
        return Promise.resolve({
          data: {
            billId: 33,
            amount: 25,
            inputMoney: 25,
            returnMoney: 0,
            replayed: false,
          },
        });
      if (path === "/saleTemp/printBillAfterPay")
        return Promise.reject(new Error("printer unavailable"));
      return Promise.resolve({ data: {} });
    });
    // Coordinates random uuid behavior for this module.
    vi.stubGlobal("crypto", { randomUUID: () => "receipt-failure-key" });

    render(<SalePage />);
    await screen.findByText("Test meal");
    fireEvent.click(screen.getByRole("button", { name: /^pay$/i }));
    fireEvent.click(screen.getByRole("button", { name: /bank transfer/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete payment/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /^confirm payment$/i }),
    );

    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        "Maksu tallennettu",
        expect.objectContaining({
          description:
            "Kuitti #33 tallennettiin. Yritä avata kuitti uudelleen.",
        }),
      ),
    );
    expect(
      screen.getByRole("button", { name: /tulosta kuitti uudelleen #33/i }),
    ).toBeTruthy();
  });

  it("reports a reprint failure while preserving the completed sale state", async () => {
    let receiptRequests = 0;
    api.get.mockImplementation((path: string) => {
      if (path === "/food/filter/all")
        return Promise.resolve({ data: { results: [food] } });
      if (path === "/saleTemp/list/")
        return Promise.resolve({
          data: {
            results: [],
            summary: { baseAmount: 25, addedAmount: 0, total: 25 },
          },
        });
      return Promise.resolve({ data: { results: [] } });
    });
    api.post.mockImplementation((path: string) => {
      if (path === "/saleTemp/endSale")
        return Promise.resolve({
          data: {
            billId: 34,
            amount: 25,
            inputMoney: 25,
            returnMoney: 0,
            replayed: false,
          },
        });
      if (path === "/saleTemp/printBillAfterPay") {
        receiptRequests += 1;
        return receiptRequests === 1
          ? Promise.resolve({
              data: new Blob(["pdf"], { type: "application/pdf" }),
              headers: { "content-type": "application/pdf" },
            })
          : Promise.reject(new Error("reprint unavailable"));
      }
      return Promise.resolve({ data: {} });
    });
    // Coordinates random uuid behavior for this module.
    vi.stubGlobal("crypto", { randomUUID: () => "reprint-failure-key" });
    URL.createObjectURL = vi.fn(() => "blob:paid-receipt");
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    render(<SalePage />);
    await screen.findByText("Test meal");
    fireEvent.click(screen.getByRole("button", { name: /^pay$/i }));
    fireEvent.click(screen.getByRole("button", { name: /bank transfer/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete payment/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /^confirm payment$/i }),
    );
    const reprint = await screen.findByRole("button", {
      name: /tulosta kuitti uudelleen #34/i,
    });
    fireEvent.click(reprint);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Kuittia ei voitu avata",
        expect.objectContaining({
          description: "Yritä avata kuitti uudelleen.",
        }),
      ),
    );
    expect(
      screen.getByRole("button", { name: /tulosta kuitti uudelleen #34/i }),
    ).toBeTruthy();
  });
});
