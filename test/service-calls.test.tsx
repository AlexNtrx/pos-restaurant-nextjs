import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ServiceCallCard from "@/app/order/[tableToken]/_components/service-call-card";
import ServiceCallsPage from "@/app/backoffice/service-calls/page";
import type { StaffServiceCall } from "@/lib/service-calls";

const { loadCurrent, requestCall, loadStaff, changeStatus } = vi.hoisted(
  () => ({
    loadCurrent: vi.fn(),
    requestCall: vi.fn(),
    loadStaff: vi.fn(),
    changeStatus: vi.fn(),
  }),
);

vi.mock("@/lib/service-calls", () => ({
  loadCurrentServiceCall: loadCurrent,
  requestServiceCall: requestCall,
  loadStaffServiceCalls: loadStaff,
  changeServiceCallStatus: changeStatus,
  serviceCallErrorText: () => "Yhteys epäonnistui.",
}));

const call = {
  id: 9,
  tableNo: 12,
  status: "REQUESTED" as const,
  version: 1,
  createdAt: "2026-09-29T12:00:00.000Z",
  acknowledgedAt: null,
  resolvedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  loadCurrent.mockResolvedValue(null);
  requestCall.mockResolvedValue(call);
  loadStaff.mockResolvedValue([call]);
});

afterEach(() => cleanup());

it("lets a QR customer call once and shows the active state", async () => {
  const user = userEvent.setup();
  render(<ServiceCallCard token="table-token" />);
  const button = await screen.findByRole("button", {
    name: "Kutsu henkilökunta",
  });
  await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  await user.click(button);
  expect(requestCall).toHaveBeenCalledWith("table-token");
  expect(
    await screen.findByText("Kutsu lähetetty. Henkilökunta näkee pöytäsi."),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Kutsu lähetetty" })
      .hasAttribute("disabled"),
  ).toBe(true);
});

it("lets staff acknowledge then resolve the same table call", async () => {
  const user = userEvent.setup();
  let current: StaffServiceCall = call;
  loadStaff.mockImplementation(async () => [current]);
  changeStatus.mockImplementation(async (_call, nextStatus) => {
    current = {
      ...current,
      status: nextStatus,
      version: current.version + 1,
    };
    return current;
  });
  render(<ServiceCallsPage />);
  expect(await screen.findByText("Pöytä P12")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Ota vastaan" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Merkitse hoidetuksi" }),
    ).toBeTruthy(),
  );
  expect(changeStatus).toHaveBeenCalledWith(call, "ACKNOWLEDGED");
  const acknowledged = { ...call, status: "ACKNOWLEDGED", version: 2 };
  await user.click(screen.getByRole("button", { name: "Merkitse hoidetuksi" }));
  await waitFor(() =>
    expect(changeStatus).toHaveBeenCalledWith(acknowledged, "RESOLVED"),
  );
});
