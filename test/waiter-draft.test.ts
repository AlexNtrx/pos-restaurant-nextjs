import { beforeEach, describe, expect, it } from "vitest";
import {
  clearWaiterDraft,
  emptyWaiterDraft,
  hasWaiterDraft,
  parseWaiterDraft,
  readWaiterDraft,
  saveWaiterDraft,
  waiterDraftKey,
} from "@/lib/waiter-draft";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("mytokenfornextjsproject", "token");
  localStorage.setItem("next_name", "Waiter");
  localStorage.setItem("next_user_id", "7");
});

describe("waiter unsent draft storage", () => {
  it("stores intent without prices, sessions or submission keys", () => {
    const draft = {
      ...emptyWaiterDraft(7),
      items: [
        {
          foodId: 5,
          foodSizeId: 4,
          tasteId: 3,
          quantity: 2,
          note: "Ei sipulia",
          price: 123,
        },
      ],
      total: 246,
      tableSessionId: 11,
      idempotencyKey: "never-store",
    };
    const key = waiterDraftKey();
    saveWaiterDraft(draft, key);
    const saved = readWaiterDraft(key)!;
    expect(saved).toEqual({
      ...emptyWaiterDraft(7),
      items: [
        {
          foodId: 5,
          foodSizeId: 4,
          tasteId: 3,
          quantity: 2,
          note: "Ei sipulia",
        },
      ],
    });
    expect(hasWaiterDraft(saved)).toBe(true);
    clearWaiterDraft(key);
    expect(readWaiterDraft(key)).toBeNull();
  });

  it("isolates accounts and refuses stale-owner reads, writes and clears", () => {
    const key = waiterDraftKey();
    saveWaiterDraft({ ...emptyWaiterDraft(7), note: "Account 7" }, key);
    localStorage.setItem("next_user_id", "8");
    expect(readWaiterDraft(waiterDraftKey())).toBeNull();
    expect(() => readWaiterDraft(key)).toThrow(/Käyttäjä vaihtui/);
    expect(() => saveWaiterDraft(emptyWaiterDraft(8), key)).toThrow(
      /Käyttäjä vaihtui/,
    );
    expect(() => clearWaiterDraft(key)).toThrow(/Käyttäjä vaihtui/);
    localStorage.setItem("next_user_id", "7");
    expect(readWaiterDraft(key)?.note).toBe("Account 7");
  });

  it.each([
    {
      tableId: null,
      items: [
        { foodId: 5, foodSizeId: null, tasteId: null, quantity: 1, note: "" },
      ],
    },
    {
      items: [
        { foodId: 5, foodSizeId: null, tasteId: null, quantity: 201, note: "" },
      ],
    },
    {
      items: [
        { foodId: 5, foodSizeId: -1, tasteId: null, quantity: 1, note: "" },
      ],
    },
    {
      items: [
        { foodId: 5, foodSizeId: null, tasteId: null, quantity: 0, note: "" },
      ],
    },
    { note: "x".repeat(501) },
    { foodId: "5" },
    { quantity: Infinity },
  ])("rejects malformed or oversized drafts: %j", (changes) => {
    expect(parseWaiterDraft({ ...emptyWaiterDraft(7), ...changes })).toBeNull();
  });

  it("retains a malformed stored draft instead of replacing it", () => {
    const key = waiterDraftKey()!;
    localStorage.setItem(key, "{bad-json");
    expect(() => readWaiterDraft(key)).toThrow();
    expect(localStorage.getItem(key)).toBe("{bad-json");
  });
});
