import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
  requestCall.mockImplementation(async () => {
    loadCurrent.mockResolvedValue(call);
    return call;
  });
  loadStaff.mockResolvedValue([call]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("lets a QR customer call once and shows the active state", async () => {
  const user = userEvent.setup();
  render(<ServiceCallCard token="table-token" />);
  const button = await screen.findByRole("button", {
    name: "Kutsu henkilökunta",
  });
  await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  await user.click(button);
  expect(requestCall).toHaveBeenCalledWith("table-token");
  expect(await screen.findByText("Kutsu lähetetty.")).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Kutsu lähetetty" })
      .hasAttribute("disabled"),
  ).toBe(true);
});

it("keeps the idle call card concise and hides resolved feedback after cooldown", async () => {
  const resolvedAt = new Date(Date.now() - 61_000).toISOString();
  loadCurrent.mockResolvedValue({ ...call, status: "RESOLVED", resolvedAt });
  render(<ServiceCallCard token="table-token" />);
  const button = screen.getByRole("button", { name: "Kutsu henkilökunta" });
  await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  expect(screen.queryByText("Edellinen pyyntö on hoidettu.")).toBeNull();
  expect(screen.queryByText("Kutsu henkilökunta pöytääsi.")).toBeNull();
});

it("shows resolved feedback while a new call is cooling down", async () => {
  loadCurrent.mockResolvedValue({
    ...call,
    status: "RESOLVED",
    resolvedAt: new Date().toISOString(),
  });
  render(<ServiceCallCard token="table-token" />);
  expect(await screen.findByText("Edellinen pyyntö on hoidettu.")).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Odota hetki" })
      .hasAttribute("disabled"),
  ).toBe(true);
});

it("hides resolved feedback after five seconds but keeps repeat calls disabled", async () => {
  vi.useFakeTimers();
  loadCurrent.mockResolvedValue({
    ...call,
    status: "RESOLVED",
    resolvedAt: new Date().toISOString(),
  });
  await act(async () => {
    render(<ServiceCallCard token="table-token" />);
  });
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(screen.getByText("Edellinen pyyntö on hoidettu.")).toBeTruthy();
  await act(async () => vi.advanceTimersByTimeAsync(4_999));
  expect(screen.getByText("Edellinen pyyntö on hoidettu.")).toBeTruthy();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(screen.queryByText("Edellinen pyyntö on hoidettu.")).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Odota hetki" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(10_000));
  expect(screen.queryByText("Edellinen pyyntö on hoidettu.")).toBeNull();
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
