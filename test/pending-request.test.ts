import { afterEach, beforeEach, expect, it } from "vitest";
import { isMutationRejected } from "@/lib/mutation-outcome";
import {
  clearPendingRequest,
  pendingRequestKey,
  pendingResources,
  readPendingRequest,
  savePendingRequest,
} from "@/lib/pending-request";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("mytokenfornextjsproject", "test-token");
  localStorage.setItem("next_name", "Staff");
  localStorage.setItem("next_user_id", "7");
});
afterEach(() => localStorage.clear());

it.each([408, 425, 429, 500, 502, 504, 401, 403, 404])(
  "retains uncertain HTTP %s outcomes",
  (status) => {
    expect(isMutationRejected({ response: { status } })).toBe(false);
  },
);
it.each([
  "IDEMPOTENCY_CONFLICT",
  "TABLE_SESSION_INACTIVE",
  "QR_ORDERING_CLOSED",
])("retains %s outcomes that cannot prove an earlier write failed", (code) => {
  expect(
    isMutationRejected({ response: { status: 409, data: { code } } }),
  ).toBe(false);
});
it.each([400, 409, 422])(
  "allows a definite HTTP %s rejection to be corrected",
  (status) => {
    expect(
      isMutationRejected({
        response: { status, data: { code: "QUOTE_CHANGED" } },
      }),
    ).toBe(true);
  },
);
it("keeps network errors and invalid responses uncertain", () => {
  expect(isMutationRejected(new Error("timeout"))).toBe(false);
  expect(isMutationRejected({})).toBe(false);
});
it("isolates pending attempts and prevents an old response from deleting a new user's attempt", () => {
  const originalKey = pendingRequestKey("counter-order:9");
  savePendingRequest("counter-order:9", { key: "original" });
  localStorage.setItem("next_user_id", "8");
  expect(pendingResources("counter-order:")).toEqual([]);
  savePendingRequest("counter-order:9", { key: "other" });
  expect(() => clearPendingRequest("counter-order:9", originalKey)).toThrow();
  expect(() =>
    savePendingRequest("counter-order:9", {}, originalKey),
  ).toThrow();
  expect(
    JSON.parse(localStorage.getItem(pendingRequestKey("counter-order:9")!)!),
  ).toEqual({ key: "other" });
  expect(JSON.parse(localStorage.getItem(originalKey!)!)).toEqual({
    key: "original",
  });
});
it("fails closed on corrupted intent and refuses storage without a signed-in account", () => {
  localStorage.setItem(pendingRequestKey("waiter-order")!, "{bad json");
  expect(() => readPendingRequest("waiter-order", () => null)).toThrow();
  localStorage.removeItem("next_user_id");
  expect(() => savePendingRequest("waiter-order", {})).toThrow();
});
