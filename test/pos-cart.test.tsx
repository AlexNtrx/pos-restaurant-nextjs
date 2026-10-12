import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import usePosCart from "@/app/backoffice/sale/_hooks/use-pos-cart";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: { get } }));

const cart = (total: number) => ({
  data: {
    results: [],
    summary: { baseAmount: total, addedAmount: 0, total },
  },
});

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it("finishes a pending cart read when restoring the currently selected table", async () => {
  let resolve!: (response: ReturnType<typeof cart>) => void;
  get.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const onError = vi.fn();
  const view = renderHook(() => usePosCart({ checkoutBusy: false, onError }));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  act(() => view.result.current.setTable(1));
  await act(async () => resolve(cart(25)));
  expect(view.result.current.loadedTable).toBe(1);
  expect(view.result.current.summary.total).toBe(25);
  expect(get).toHaveBeenCalledTimes(1);
  expect(onError).not.toHaveBeenCalled();
});

it("keeps a loaded cart ready when the selected table is entered again", async () => {
  get.mockResolvedValue(cart(25));
  const onError = vi.fn();
  const view = renderHook(() => usePosCart({ checkoutBusy: false, onError }));
  await waitFor(() => expect(view.result.current.loadedTable).toBe(1));
  act(() => view.result.current.setTable(1));
  expect(view.result.current.loadedTable).toBe(1);
  expect(view.result.current.summary.total).toBe(25);
});

it("ignores an old response after leaving a table and returning to it", async () => {
  const requests: ((response: ReturnType<typeof cart>) => void)[] = [];
  get.mockImplementation(
    () =>
      new Promise((resolve) => {
        requests.push(resolve);
      }),
  );
  const onError = vi.fn();
  const view = renderHook(() => usePosCart({ checkoutBusy: false, onError }));
  await waitFor(() => expect(requests).toHaveLength(1));
  act(() => view.result.current.setTable(2));
  await waitFor(() => expect(requests).toHaveLength(2));
  act(() => view.result.current.setTable(1));
  await waitFor(() => expect(requests).toHaveLength(3));
  await act(async () => {
    requests[0](cart(111));
    requests[1](cart(222));
  });
  expect(view.result.current.loadedTable).toBeNull();
  await act(async () => requests[2](cart(25)));
  expect(view.result.current.loadedTable).toBe(1);
  expect(view.result.current.summary.total).toBe(25);
  expect(onError).not.toHaveBeenCalled();
});
