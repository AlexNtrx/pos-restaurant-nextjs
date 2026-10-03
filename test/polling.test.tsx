import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePolling } from "@/lib/use-polling";

const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));
let visible = true;
let online = true;
beforeEach(() => {
  vi.useFakeTimers();
  visible = true;
  online = true;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() =>
    visible ? "visible" : "hidden",
  );
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("waits for a slow round to settle before scheduling the next round", async () => {
  let release!: () => void;
  const poll = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  renderHook(() => usePolling(poll));
  await tick();
  await tick(20_000);
  expect(poll).toHaveBeenCalledTimes(1);
  await act(async () => release());
  await tick(4_999);
  expect(poll).toHaveBeenCalledTimes(1);
  await tick(1);
  expect(poll).toHaveBeenCalledTimes(2);
});

it("coalesces action refreshes, aborts the older read and reconciles after it settles", async () => {
  let release!: () => void;
  const poll = vi
    .fn<(signal: AbortSignal, full: boolean) => Promise<void>>()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  const { result } = renderHook(() => usePolling(poll));
  await tick();
  let refresh!: Promise<void>;
  act(() => {
    refresh = result.current();
    void result.current();
    void result.current();
  });
  expect(poll.mock.calls[0][0].aborted).toBe(true);
  expect(poll).toHaveBeenCalledTimes(1);
  await act(async () => {
    release();
    await refresh;
  });
  expect(poll).toHaveBeenCalledTimes(2);
  expect(poll.mock.calls[1][1]).toBe(true);
});

it("pauses hidden tabs and reconciles immediately when visible again", async () => {
  const poll = vi.fn().mockResolvedValue(undefined);
  renderHook(() => usePolling(poll));
  await tick();
  visible = false;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await tick(60_000);
  expect(poll).toHaveBeenCalledTimes(1);
  visible = true;
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(poll).toHaveBeenCalledTimes(2);
  expect(poll.mock.calls[1][1]).toBe(true);
  await tick(5_000);
  expect(poll.mock.calls[2][1]).toBe(false);
});

it("aborts a hidden in-flight read without starting overlapping work on resume", async () => {
  let release!: () => void;
  const poll = vi
    .fn<(signal: AbortSignal, full: boolean) => Promise<void>>()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  renderHook(() => usePolling(poll));
  await tick();
  visible = false;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(poll.mock.calls[0][0].aborted).toBe(true);
  visible = true;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(poll).toHaveBeenCalledTimes(1);
  await act(async () => release());
  expect(poll).toHaveBeenCalledTimes(2);
  expect(poll.mock.calls[1][1]).toBe(true);
});

it("backs off to 60 seconds after failures and restores the normal cadence after recovery", async () => {
  const poll = vi.fn().mockRejectedValue(new Error("Offline API"));
  renderHook(() => usePolling(poll));
  await tick();
  for (const delay of [10_000, 20_000, 40_000, 60_000, 60_000]) {
    const before = poll.mock.calls.length;
    await tick(delay - 1);
    expect(poll).toHaveBeenCalledTimes(before);
    await tick(1);
    expect(poll).toHaveBeenCalledTimes(before + 1);
  }
  poll.mockResolvedValue(undefined);
  await tick(60_000);
  const recovered = poll.mock.calls.length;
  await tick(5_000);
  expect(poll).toHaveBeenCalledTimes(recovered + 1);
});

it("does not request while offline and reconciles on reconnect", async () => {
  online = false;
  const poll = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => usePolling(poll));
  await tick(60_000);
  await act(async () => result.current());
  expect(poll).not.toHaveBeenCalled();
  online = true;
  await act(async () => window.dispatchEvent(new Event("online")));
  expect(poll).toHaveBeenCalledTimes(1);
  expect(poll.mock.calls[0][1]).toBe(true);
  online = false;
  act(() => window.dispatchEvent(new Event("offline")));
  await tick(60_000);
  expect(poll).toHaveBeenCalledTimes(1);
});

it("aborts an old scope and rejects its late result after rerender or unmount", async () => {
  let release!: () => void;
  const apply = vi.fn();
  const old = vi.fn(async (signal: AbortSignal) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    if (!signal.aborted) apply();
  });
  const next = vi.fn().mockResolvedValue(undefined);
  const { rerender, unmount } = renderHook(({ poll }) => usePolling(poll), {
    initialProps: { poll: old },
  });
  await tick();
  rerender({ poll: next });
  expect(old.mock.calls[0][0].aborted).toBe(true);
  await tick();
  await act(async () => release());
  expect(apply).not.toHaveBeenCalled();
  unmount();
  await tick(60_000);
  expect(next).toHaveBeenCalledTimes(1);
});

it("stops polling and manual refresh when the view loses access", async () => {
  const poll = vi.fn().mockResolvedValue(undefined);
  const { rerender, result } = renderHook(
    ({ enabled }) => usePolling(poll, { enabled }),
    { initialProps: { enabled: true } },
  );
  await tick();
  rerender({ enabled: false });
  await act(async () => result.current());
  await tick(60_000);
  expect(poll).toHaveBeenCalledTimes(1);
});
