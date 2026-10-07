import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderReceipt } from "@/app/backoffice/orders/history/orders/_components/order-receipt";

const { api } = vi.hoisted(() => ({ api: { post: vi.fn() } }));
vi.mock("@/lib/api", () => ({ default: api }));
const receipt = {
  billId: 41,
  amount: 25,
  status: "use" as const,
  orderCount: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:historic-receipt");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(window, "open").mockImplementation(() => null);
  api.post.mockResolvedValue({
    data: new Blob(["%PDF"], { type: "application/pdf" }),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HIS-02 Order history receipt reprint", () => {
  it("loads the original receipt only when requested", async () => {
    const user = userEvent.setup();
    render(<OrderReceipt receipt={receipt} />);
    expect(api.post).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Kuitti" }));
    await screen.findByText("Kuitin kopio");
    expect(api.post).toHaveBeenCalledWith(
      "/saleTemp/printBillAfterPay",
      { billId: 41 },
      expect.objectContaining({
        responseType: "blob",
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it("opens the authenticated historical PDF and releases its URL when closed", async () => {
    const user = userEvent.setup();
    render(<OrderReceipt receipt={receipt} />);
    await user.click(screen.getByRole("button", { name: "Kuitti" }));
    await screen.findByText("Kuitin kopio");
    await user.click(
      screen.getByRole("button", { name: "Tulosta kuitti uudelleen #41" }),
    );
    expect(window.open).toHaveBeenCalledWith(
      "blob:historic-receipt",
      "_blank",
      "noopener,noreferrer",
    );
    await user.click(screen.getByRole("button", { name: "Sulje" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:historic-receipt");
    expect(api.post).toHaveBeenCalledTimes(1);
  });
  it("shows the full shared bill amount and uses the same bill id", async () => {
    const user = userEvent.setup();
    render(
      <OrderReceipt receipt={{ ...receipt, amount: 50, orderCount: 2 }} />,
    );
    expect(screen.getByText(/Yhteinen kuitti · 2 tilausta/)).toBeTruthy();
    expect(screen.getByText(/Kuitin summa:.*50/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Kuitti" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/saleTemp/printBillAfterPay",
        { billId: 41 },
        expect.anything(),
      ),
    );
  });
  it("keeps a failed receipt read retryable without creating a payment", async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValueOnce(new Error("Connection lost"));
    render(<OrderReceipt receipt={receipt} />);
    await user.click(screen.getByRole("button", { name: "Kuitti" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Kuitin kopio")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Kuitti" }));
    await screen.findByText("Kuitin kopio");
    expect(
      api.post.mock.calls.every(
        ([path]) => path === "/saleTemp/printBillAfterPay",
      ),
    ).toBe(true);
  });
  it("ignores a late receipt after closing or switching the Order", async () => {
    const user = userEvent.setup();
    let resolveOld!: (value: unknown) => void;
    api.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const view = render(<OrderReceipt receipt={receipt} />);
    await user.click(screen.getByRole("button", { name: "Kuitti" }));
    view.unmount();
    await act(async () =>
      resolveOld({ data: new Blob(["%PDF"], { type: "application/pdf" }) }),
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("offers no receipt for an unpaid Order", () => {
    render(<OrderReceipt receipt={null} />);
    expect(screen.queryByRole("button", { name: "Kuitti" })).toBeNull();
  });
});
