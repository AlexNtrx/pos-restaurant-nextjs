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
