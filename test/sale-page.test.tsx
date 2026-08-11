import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { api, swal } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  swal: { fire: vi.fn() },
}));

vi.mock("@/lib/api", () => ({ default: api }));
vi.mock("sweetalert2", () => ({ default: swal }));
vi.mock("@/app/config", () => ({
  default: { apiServer: "http://example.test" },
}));
vi.mock("@/app/backoffice/components/mymodal", () => ({
  // Coordinates default behavior for this module.
  default: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <>
      {id === "modalEdit" ? (
        <button id="modalEdit_btnClose">Close customization</button>
      ) : null}
      {children}
    </>
  ),
}));

import SalePage from "@/app/backoffice/sale/page";

const food = { id: 1, name: "Test meal", img: "", price: 25 };
const cart = {
  results: [],
  summary: { baseAmount: 0, addedAmount: 0, total: 0 },
};

describe("POS safety net", () => {
  afterEach(cleanup);
  beforeEach(() => {
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
    swal.fire.mockResolvedValue({ isConfirmed: false });
  });

  it("loads the staff catalog and current table cart on mount", async () => {
    render(<SalePage />);
    await screen.findByText("Test meal");
    expect(api.get).toHaveBeenCalledWith("/food/filter/all");
    expect(api.get).toHaveBeenCalledWith("/saleTemp/list/", {
      params: { tableNo: 1 },
    });
  });

  it("filters categories and adds a menu item using the selected table", async () => {
    render(<SalePage />);
    await screen.findByText("Test meal");
    fireEvent.click(screen.getByAltText("Test meal"));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/saleTemp/create", {
        tableNo: 1,
        foodId: 1,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /drinks/i }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/food/filter/drink"),
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
    fireEvent.click(image);
    fireEvent.click(image);
    expect(api.post).toHaveBeenCalledTimes(1);
    resolveAdd!({ data: {} });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/saleTemp/list/", {
        params: { tableNo: 1 },
      }),
    );
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
    swal.fire.mockResolvedValue({ isConfirmed: true });

    render(<SalePage />);
    fireEvent.click(await screen.findByRole("button", { name: /^remove$/i }));

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

    await waitFor(() =>
      expect(swal.fire).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Remove this item?" }),
      ),
    );
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
    swal.fire.mockResolvedValue({ isConfirmed: true });

    render(<SalePage />);
    const clear = screen.getByRole("button", {
      name: /^clear$/i,
    }) as HTMLButtonElement;
    await waitFor(() => expect(clear.disabled).toBe(false));
    fireEvent.click(clear);

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

    await waitFor(() =>
      expect(swal.fire).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Clear this order?" }),
      ),
    );
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
    swal.fire.mockResolvedValue({ isConfirmed: true });
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
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/saleTemp/endSale", {
        tableNo: 1,
        payType: "bank",
        idempotencyKey: "checkout-key",
      }),
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
    swal.fire.mockResolvedValue({ isConfirmed: true });
    // Coordinates random uuid behavior for this module.
    vi.stubGlobal("crypto", { randomUUID: () => "retry-key" });
    render(<SalePage />);
    await screen.findByText("Test meal");
    fireEvent.click(screen.getByRole("button", { name: /^pay$/i }));
    fireEvent.click(screen.getByRole("button", { name: /bank transfer/i }));
    const complete = screen.getByRole("button", { name: /complete payment/i });
    fireEvent.click(complete);
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
    await screen.findByDisplayValue("222");
    resolveTableOne!({
      data: {
        results: [],
        summary: { baseAmount: 111, addedAmount: 0, total: 111 },
      },
    });
    await waitFor(() => expect(screen.getByDisplayValue("222")).toBeTruthy());
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
    expect(document.querySelector(".alert")?.textContent?.trim()).toBe("0");

    resolveTableOne!({
      data: {
        results: [],
        summary: { baseAmount: 111, addedAmount: 0, total: 111 },
      },
    });
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(document.querySelector(".alert")?.textContent?.trim()).toBe("0");
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
      expect(document.querySelector(".alert")?.textContent?.trim()).toBe("222"),
    );

    resolveAdd!({ data: {} });
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(document.querySelector(".alert")?.textContent?.trim()).toBe("222");
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
    const detailRow = screen
      .getAllByRole("row")
      .find((row) => row.textContent?.includes("Test meal"))!;
    fireEvent.click(detailRow.querySelector("button.btn-danger")!);

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
    const closeButton = document.getElementById("modalEdit_btnClose")!;
    const closeSpy = vi.spyOn(closeButton, "click");
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("row")
          .some((row) => row.textContent?.includes("Test meal")),
      ).toBe(true),
    );
    const detailRow = screen
      .getAllByRole("row")
      .find((row) => row.textContent?.includes("Test meal"))!;
    fireEvent.click(detailRow.querySelector("button.btn-danger")!);

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(
        "/saleTemp/removeSaleTempDetailModal",
        { data: { saleTempDetailId: 11 } },
      ),
    );
    expect(closeSpy).toHaveBeenCalledTimes(1);
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
      expect(swal.fire).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Something went wrong",
          text: "Invalid cart response",
          icon: "error",
        }),
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
    swal.fire.mockResolvedValue({ isConfirmed: true });
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
    swal.fire.mockResolvedValue({ isConfirmed: true });
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
    expect(screen.getByTitle("Receipt PDF").getAttribute("src")).toBe(
      "blob:paid-receipt",
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
    swal.fire.mockResolvedValue({ isConfirmed: true });
    // Coordinates random uuid behavior for this module.
    vi.stubGlobal("crypto", { randomUUID: () => "receipt-failure-key" });

    render(<SalePage />);
    await screen.findByText("Test meal");
    fireEvent.click(screen.getByRole("button", { name: /^pay$/i }));
    fireEvent.click(screen.getByRole("button", { name: /bank transfer/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete payment/i }));

    await waitFor(() =>
      expect(swal.fire).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Sale completed",
          text: expect.stringContaining("printer unavailable"),
          icon: "warning",
        }),
      ),
    );
    expect(
      screen.getByRole("button", { name: /reprint receipt #33/i }),
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
    swal.fire.mockResolvedValue({ isConfirmed: true });
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
    const reprint = await screen.findByRole("button", {
      name: /reprint receipt #34/i,
    });
    fireEvent.click(reprint);

    await waitFor(() =>
      expect(swal.fire).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Receipt unavailable",
          text: "reprint unavailable",
          icon: "error",
        }),
      ),
    );
    expect(
      screen.getByRole("button", { name: /reprint receipt #34/i }),
    ).toBeTruthy();
  });
});
