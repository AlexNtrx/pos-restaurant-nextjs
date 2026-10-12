import React, { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CheckoutModal from "@/components/payments/checkout-modal";
import { readQrPending } from "@/lib/qr/storage";
import { parseWaiterPending } from "@/lib/waiter-pending";
import {
  readDraftAttempt,
  draftAttemptKey,
} from "@/app/backoffice/sale/_lib/counter-attempt";
import { writeAuthSession } from "@/lib/auth-session";

vi.mock("client-only", () => ({}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

function Cash({
  complete,
  initial = 50,
  total = 40.2,
}: {
  complete: () => void;
  initial?: number;
  total?: number;
}) {
  const [received, setReceived] = useState(initial);
  return (
    <CheckoutModal
      open
      onOpenChange={() => {}}
      total={total}
      payType="cash"
      receivedAmount={received}
      checkoutBusy={false}
      receiptBusy={false}
      onSelectPaymentType={() => {}}
      onChangeReceivedAmount={setReceived}
      onReceivedAmountInput={(value) => setReceived(Number(value))}
      onCompletePayment={complete}
    />
  );
}

it("cash input keeps comma text, validates precision and computes exact change", () => {
  const complete = vi.fn();
  render(<Cash complete={complete} />);
  expect(screen.getByText(/9,80/)).toBeTruthy();
  const input = screen.getByLabelText("Vastaanotettu");
  fireEvent.change(input, { target: { value: "50,10" } });
  expect((input as HTMLInputElement).value).toBe("50,10");
  expect(screen.getByText(/9,90/)).toBeTruthy();
  fireEvent.change(input, { target: { value: "50,101" } });
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(
    (
      screen.getByRole("button", {
        name: "Maksa",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Maksa" }));
  expect(complete).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "40,20" } });
  fireEvent.click(screen.getByRole("button", { name: "20 €" }));
  expect((input as HTMLInputElement).value).toBe("60.2");
  fireEvent.click(screen.getByRole("button", { name: "Maksa" }));
  expect(complete).toHaveBeenCalledOnce();
});

it("cash quick additions disable amounts beyond safe cents", () => {
  render(<Cash complete={() => {}} initial={90071992547400} />);
  expect(
    (screen.getByRole("button", { name: "100 €" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("lossy change blocks payment without crashing or rounding", () => {
  render(<Cash complete={() => {}} initial={90071992547400} total={0.07} />);
  expect(screen.getByRole("alert").textContent).toContain(
    "tarkalle vaihtorahalle",
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Maksa",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

it.each([20, 40.2])(
  "preserves saved EUR bodies and keys for counter, waiter and QR: %s",
  (total) => {
    writeAuthSession({ token: "synthetic", name: "Synthetic", userId: "900" });
    const items = [
      { foodId: 1, foodSizeId: null, tasteId: null, quantity: 1, note: "" },
    ];
    const qr = { idempotencyKey: "unchanged-key", expectedTotal: total, items };
    const raw = JSON.stringify(qr);
    localStorage.setItem("qr02:synthetic:pending", raw);
    expect(readQrPending("synthetic")).toEqual(qr);
    expect(localStorage.getItem("qr02:synthetic:pending")).toBe(raw);
    const waiter = { ...qr, tableId: 1, tableNo: 1, tableSessionId: 1 };
    expect(parseWaiterPending(waiter)).toBe(waiter);
    const counter = {
      kind: "checkout",
      payload: {
        ...qr,
        serviceType: "TAKEAWAY",
        payType: "cash",
        inputMoney: 50,
      },
    };
    const key = draftAttemptKey("TAKEAWAY")!;
    const saved = JSON.stringify(counter);
    localStorage.setItem(key, saved);
    expect(readDraftAttempt("TAKEAWAY")).toEqual(counter);
    expect(localStorage.getItem(key)).toBe(saved);
  },
);

it("invalid saved precision blocks QR without discarding its retry intent", () => {
  const raw = JSON.stringify({
    idempotencyKey: "unchanged-key",
    expectedTotal: 0.301,
    items: [
      { foodId: 1, foodSizeId: null, tasteId: null, quantity: 3, note: "" },
    ],
  });
  localStorage.setItem("qr02:synthetic:pending", raw);
  expect(() => readQrPending("synthetic")).toThrow();
  expect(localStorage.getItem("qr02:synthetic:pending")).toBe(raw);
});
