import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import useCounterDraft, {
  type DraftScope,
} from "@/app/backoffice/sale/_hooks/use-counter-draft";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: { post } }));
vi.mock("@/lib/auth-session", () => ({
  readAuthSession: () => ({ userId: 7 }),
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

it("coalesces identical in-flight quotes, guards rapid cart edits and still requests a fresh completed quote", async () => {
  const response = {
    data: {
      results: {
        subtotal: 25,
        modifierTotal: 0,
        total: 25,
        items: [
          {
            foodId: 1,
            foodName: "Meal",
            quantity: 1,
            unitBasePrice: 25,
            lineTotal: 25,
            modifiers: [],
          },
        ],
      },
    },
  };
  let resolve!: (value: typeof response) => void;
  post.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const onError = vi.fn();
  const view = renderHook(() => useCounterDraft(1, onError));
  await waitFor(() => expect(view.result.current.quoteReady).toBe(true));
  let mutation!: Promise<unknown>;
  let quotes!: Promise<unknown>[];
  act(() => {
    mutation = view.result.current.addItem(1);
    void view.result.current.addItem(1);
    quotes = Array.from({ length: 20 }, () =>
      view.result.current.refreshCart(),
    );
  });
  expect(post).toHaveBeenCalledTimes(1);
  expect(view.result.current.units).toHaveLength(1);
  await act(async () => {
    resolve(response);
    await mutation;
    await Promise.all(quotes);
  });
  expect(view.result.current.summary.total).toBe(25);
  post.mockResolvedValue({
    ...response,
    data: { results: { ...response.data.results, total: 30, subtotal: 30 } },
  });
  await act(async () => {
    await view.result.current.refreshCart();
  });
  expect(post).toHaveBeenCalledTimes(2);
  expect(view.result.current.summary.total).toBe(30);
  expect(onError).not.toHaveBeenCalled();
});

it("ignores failed mutations from a previous scope, including returning to the same table", async () => {
  let rejectOld!: (error: Error) => void;
  post.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectOld = reject;
      }),
  );
  const onError = vi.fn();
  const view = renderHook(
    ({ scope }: { scope: DraftScope }) => useCounterDraft(scope, onError),
    { initialProps: { scope: 1 as DraftScope } },
  );
  await waitFor(() => expect(view.result.current.quoteReady).toBe(true));
  let pending!: ReturnType<typeof view.result.current.addItem>;
  act(() => {
    pending = view.result.current.addItem(1);
  });
  view.rerender({ scope: "TAKEAWAY" });
  await waitFor(() => {
    expect(view.result.current.loadedScope).toBe("TAKEAWAY");
    expect(view.result.current.quoteReady).toBe(true);
    expect(view.result.current.cartBusy).toBe(false);
  });
  await act(async () => {
    rejectOld(new Error("Old request timed out"));
    await pending;
  });
  expect(view.result.current.quoteReady).toBe(true);
  expect(onError).not.toHaveBeenCalled();

  let rejectTakeaway!: (error: Error) => void;
  post.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectTakeaway = reject;
      }),
  );
  act(() => {
    pending = view.result.current.addItem(1);
  });
  post.mockResolvedValue({
    data: {
      results: {
        subtotal: 25,
        modifierTotal: 0,
        total: 25,
        items: [
          {
            foodId: 1,
            foodName: "Meal",
            quantity: 1,
            unitBasePrice: 25,
            lineTotal: 25,
            modifiers: [],
          },
        ],
      },
    },
  });
  view.rerender({ scope: 1 });
  await waitFor(() => expect(view.result.current.loadedScope).toBe(1));
  view.rerender({ scope: "TAKEAWAY" });
  await waitFor(() => {
    expect(view.result.current.loadedScope).toBe("TAKEAWAY");
    expect(view.result.current.quoteReady).toBe(true);
  });
  await act(async () => {
    rejectTakeaway(new Error("Stale same-scope request"));
    await pending;
  });
  expect(view.result.current.quoteReady).toBe(true);
  expect(view.result.current.cartBusy).toBe(false);
  expect(onError).not.toHaveBeenCalled();
});

it("preserves malformed saved data until the cashier explicitly discards it", async () => {
  const key = "counter-draft:v1:7:1";
  localStorage.setItem(key, "broken json");
  const onError = vi.fn();
  const view = renderHook(() => useCounterDraft(1, onError));
  await waitFor(() => expect(view.result.current.loadFailed).toBe(true));
  await act(async () => {
    await view.result.current.addItem(1);
    await view.result.current.refreshCart();
  });
  expect(localStorage.getItem(key)).toBe("broken json");
  expect(view.result.current.quoteReady).toBe(false);
  expect(post).not.toHaveBeenCalled();
  act(() => view.result.current.discardDraft());
  expect(localStorage.getItem(key)).toBeNull();
  expect(view.result.current.loadFailed).toBe(false);
  expect(view.result.current.quoteReady).toBe(true);
});

it("keeps the latest quote when editing interrupts the initial saved-draft read", async () => {
  localStorage.setItem(
    "counter-draft:v1:7:1",
    JSON.stringify([{ id: 1, foodId: 1, foodSizeId: null, tasteId: null }]),
  );
  let rejectInitial!: (error: Error) => void;
  post.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectInitial = reject;
      }),
  );
  const onError = vi.fn();
  const view = renderHook(() => useCounterDraft(1, onError));
  await waitFor(() => expect(view.result.current.loadedScope).toBe(1));
  post.mockResolvedValueOnce({
    data: {
      results: {
        subtotal: 50,
        modifierTotal: 0,
        total: 50,
        items: [1, 2].map((foodId) => ({
          foodId,
          foodName: `Meal ${foodId}`,
          quantity: 1,
          unitBasePrice: 25,
          lineTotal: 25,
          modifiers: [],
        })),
      },
    },
  });
  await act(async () => {
    await view.result.current.addItem(2);
  });
  await act(async () => {
    rejectInitial(new Error("Old quote aborted"));
  });
  expect(view.result.current.units.map((unit) => unit.foodId)).toEqual([1, 2]);
  expect(view.result.current.summary.total).toBe(50);
  expect(view.result.current.quoteReady).toBe(true);
  expect(view.result.current.quoteError).toBeNull();
  expect(onError).not.toHaveBeenCalled();
});

it("does not restore a discarded draft when an earlier refresh resolves", async () => {
  localStorage.setItem(
    "counter-draft:v1:7:1",
    JSON.stringify([{ id: 1, foodId: 1, foodSizeId: null, tasteId: null }]),
  );
  const response = {
    data: {
      results: {
        subtotal: 25,
        modifierTotal: 0,
        total: 25,
        items: [
          {
            foodId: 1,
            foodName: "Meal",
            quantity: 1,
            unitBasePrice: 25,
            lineTotal: 25,
            modifiers: [],
          },
        ],
      },
    },
  };
  post.mockResolvedValueOnce(response);
  const onError = vi.fn();
  const view = renderHook(() => useCounterDraft(1, onError));
  await waitFor(() => expect(view.result.current.quoteReady).toBe(true));
  let resolve!: (value: typeof response) => void;
  post.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  let refresh!: Promise<unknown>;
  act(() => {
    refresh = view.result.current.refreshCart();
  });
  act(() => view.result.current.discardDraft());
  await act(async () => {
    resolve(response);
    await refresh;
  });
  expect(view.result.current.units).toEqual([]);
  expect(view.result.current.items).toEqual([]);
  expect(view.result.current.summary.total).toBe(0);
  expect(view.result.current.quoteReady).toBe(true);
  expect(localStorage.getItem("counter-draft:v1:7:1")).toBeNull();
});
