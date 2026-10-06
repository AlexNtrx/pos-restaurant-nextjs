import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import api from "@/lib/api";
import { OrderRefund } from "@/components/orders/order-refund";
import type { StaffOrderDetail } from "@/lib/orders/contracts";
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const order = {
  id: 1,
  version: 3,
  status: "CONFIRMED",
  paidAt: "2026-10-02T12:00:00Z",
  preparingAt: null,
} as StaffOrderDetail;
const pending = {
  id: 4,
  amount: 20,
  method: "bank",
  status: "PENDING",
  idempotencyKey: "test-refund",
  reference: null,
  failureReason: null,
};
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("mytokenfornextjsproject", "test-token");
  localStorage.setItem("next_name", "Admin");
  localStorage.setItem("next_user_id", "7");
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: { result: null } });
});
afterEach(cleanup);
it("reuses the exact reservation after an uncertain response without claiming a refund succeeded", async () => {
  vi.mocked(api.post)
    .mockRejectedValueOnce(new Error("Connection failed"))
    .mockResolvedValueOnce({ data: { result: pending } });
  const user = userEvent.setup();
  const view = render(
    <OrderRefund
      order={order}
      onChanged={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  await user.type(
    await screen.findByLabelText("Peruutuksen syy"),
    "Customer request",
  );
  const reserve = screen.getByRole("button", {
    name: "Varaa peruutus ja palautus",
  });
  await user.click(reserve);
  await screen.findByRole("alert");
  expect(screen.queryByText(/Palautus vahvistettu/)).toBeNull();
  expect(
    (screen.getByLabelText("Peruutuksen syy") as HTMLTextAreaElement).disabled,
  ).toBe(true);
  view.unmount();
  render(
    <OrderRefund
      order={order}
      onChanged={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  const retry = await screen.findByRole("button", {
    name: "Varaa peruutus ja palautus",
  });
  await user.click(retry);
  await screen.findByText(/Palautus kesken/);
  expect(vi.mocked(api.post).mock.calls[1][1]).toEqual(
    vi.mocked(api.post).mock.calls[0][1],
  );
});
it("reserves cancellation first and only records returned money after explicit proof", async () => {
  const changed = vi.fn().mockResolvedValue(undefined);
  vi.mocked(api.post)
    .mockResolvedValueOnce({ data: { result: pending } })
    .mockResolvedValueOnce({
      data: {
        result: {
          ...pending,
          status: "COMPLETED",
          reference: "Bank proof 123",
        },
      },
    });
  const user = userEvent.setup();
  render(<OrderRefund order={order} onChanged={changed} />);
  await user.type(
    await screen.findByLabelText("Peruutuksen syy"),
    "Customer request",
  );
  await user.selectOptions(screen.getByLabelText("Palautustapa"), "bank");
  await user.click(
    screen.getByRole("button", { name: "Varaa peruutus ja palautus" }),
  );
  await screen.findByText(/Palautus kesken/);
  expect(screen.queryByText(/Palautus vahvistettu/)).toBeNull();
  expect(vi.mocked(api.post).mock.calls[0][1]).toEqual(
    expect.objectContaining({
      expectedVersion: 3,
      method: "bank",
      reason: "Customer request",
    }),
  );
  const confirm = screen.getByRole("button", {
    name: "Vahvista rahat palautetuiksi",
  });
  expect((confirm as HTMLButtonElement).disabled).toBe(true);
  await user.type(
    screen.getByLabelText("Tosite / viite tai epäonnistumisen syy"),
    "Bank proof 123",
  );
  await user.click(confirm);
  await screen.findByText(/Palautus vahvistettu/);
  expect(api.post).toHaveBeenLastCalledWith("/orders/1/refund/complete", {
    idempotencyKey: "test-refund",
    reference: "Bank proof 123",
  });
});
it("retains a pending refund when completion fails and reloads existing reservations", async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { result: pending } });
  vi.mocked(api.post).mockRejectedValue(new Error("Connection failed"));
  const user = userEvent.setup();
  render(
    <OrderRefund
      order={{ ...order, status: "CANCELLED" }}
      onChanged={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  await user.type(
    await screen.findByLabelText("Tosite / viite tai epäonnistumisen syy"),
    "Bank proof 123",
  );
  await user.click(
    screen.getByRole("button", { name: "Vahvista rahat palautetuiksi" }),
  );
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.getByText(/Palautus kesken/)).toBeTruthy();
  expect(screen.queryByText(/Palautus vahvistettu/)).toBeNull();
});
