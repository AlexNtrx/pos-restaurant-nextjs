import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TablePaymentsPage from "@/app/backoffice/orders/tables/page";
const mocks = vi.hoisted(() => ({ load: vi.fn(), pending: vi.fn() }));
vi.mock("@/lib/payments/table-payment-attempt", () => ({
  listPendingTablePayments: mocks.pending,
}));
vi.mock("@/lib/tables", () => ({ loadStaffTables: mocks.load }));
vi.mock("@/app/backoffice/sale/_components/qr-table-orders", () => ({
  default: ({ tableNo }: { tableNo: number }) => (
    <div>Orders for table {tableNo}</div>
  ),
}));
vi.mock("@/components/payments/table-session-checkout", () => ({
  default: ({ sessionId }: { sessionId: number }) => (
    <div>Pöydän maksu #{sessionId}</div>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue([
    { id: 1, tableNo: 4, openSession: { id: 12 } },
    { id: 2, tableNo: 5, openSession: null },
  ]);
  mocks.pending.mockReturnValue([]);
});
afterEach(cleanup);
it("opens table orders on demand without loading every table's order stream", async () => {
  const user = userEvent.setup();
  render(<TablePaymentsPage />);
  const details = await screen.findByRole("button", {
    name: "Näytä tilaukset · Pöytä 4",
  });
  expect(screen.queryByText("Orders for table 4")).toBeNull();
  await user.click(details);
  expect(screen.getByText("Orders for table 4")).toBeTruthy();
  expect(details.getAttribute("aria-expanded")).toBe("true");
  await user.click(screen.getByRole("button", { name: "Sulje tiedot" }));
  expect(screen.queryByText("Orders for table 4")).toBeNull();
});
it("opens existing table settlement from Kassa without QR or table administration", async () => {
  const user = userEvent.setup();
  render(<TablePaymentsPage />);
  await user.click(
    await screen.findByRole("button", { name: "Näytä tilaukset · Pöytä 4" }),
  );
  expect(screen.getByText("Orders for table 4")).toBeTruthy();
  await user.click(
    await screen.findByRole("button", { name: "Tarkista ja maksa" }),
  );
  expect(screen.getByText("Pöydän maksu #12")).toBeTruthy();
  expect(screen.queryByText("Pöytä 5")).toBeNull();
  expect(screen.queryByRole("button", { name: /QR|Lisää pöytä/ })).toBeNull();
});
it("allows reconciliation of a pending payment after its session has closed", async () => {
  mocks.load.mockResolvedValue([]);
  mocks.pending.mockReturnValue([{ sessionId: 13, tableNo: 5 }]);
  const user = userEvent.setup();
  render(<TablePaymentsPage />);
  await user.click(
    await screen.findByRole("button", { name: /Tarkista pöydän 5 maksu/ }),
  );
  expect(screen.getByText("Pöydän maksu #13")).toBeTruthy();
});
