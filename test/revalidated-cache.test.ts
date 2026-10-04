import { expect, it, vi } from "vitest";
import { RevalidatedCache } from "@/lib/revalidated-cache";

const pending = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

it("coalesces fifty reads and revalidates retained bodies without sharing mutable state", async () => {
  const cache = new RevalidatedCache();
  const deferred = pending<{ data: unknown; status: number; etag: string }>();
  const load = vi.fn(() => deferred.promise);
  const reads = Array.from({ length: 50 }, () =>
    cache.read("staff-A/menu", load),
  );
  await Promise.resolve();
  expect(load).toHaveBeenCalledTimes(1);
  deferred.resolve({ data: { price: 20 }, status: 200, etag: '"v1"' });
  const values = await Promise.all(reads);
  (values[0] as { price: number }).price = 1;
  expect(values[1]).toEqual({ price: 20 });
  const revalidate = vi.fn(async () => ({ data: "", status: 304 }));
  expect(await cache.read("staff-A/menu", revalidate)).toEqual({ price: 20 });
  expect(revalidate).toHaveBeenCalledWith('"v1"', expect.any(AbortSignal));
});

it("accepts changed prices and isolates staff sessions, endpoints and QR tokens", async () => {
  const cache = new RevalidatedCache();
  const load = vi.fn(async () => ({ data: { price: 20 }, etag: '"v1"' }));
  await cache.read("staff-A/menu", load);
  for (const key of [
    "staff-B/menu",
    "staff-A/categories",
    "qr-A/menu",
    "qr-B/menu",
  ]) {
    await cache.read(key, load);
    expect(load).toHaveBeenLastCalledWith(undefined, expect.any(AbortSignal));
  }
  expect(
    await cache.read("staff-A/menu", async () => ({
      data: { price: 25 },
      etag: '"v2"',
    })),
  ).toEqual({ price: 25 });
  expect(
    await cache.read("staff-A/menu", async () => ({ data: "", status: 304 })),
  ).toEqual({ price: 25 });
});

it.each(["401", "403", "QR_INVALID", "network"])(
  "purges a retained body on %s and never falls back",
  async (reason) => {
    const cache = new RevalidatedCache();
    await cache.read("scope", async () => ({
      data: { secret: "catalog" },
      etag: '"old"',
    }));
    await expect(
      cache.read("scope", async () => {
        throw new Error(reason);
      }),
    ).rejects.toThrow(reason);
    const load = vi.fn(async () => ({ data: {}, etag: '"new"' }));
    await cache.read("scope", load);
    expect(load).toHaveBeenLastCalledWith(undefined, expect.any(AbortSignal));
  },
);

it("does not cancel other consumers until the last subscriber aborts", async () => {
  const cache = new RevalidatedCache();
  const first = new AbortController();
  const second = new AbortController();
  const reply = pending<{ data: unknown; etag: string }>();
  const load = vi.fn((_etag, signal) => {
    expect(signal.aborted).toBe(false);
    return reply.promise;
  });
  const one = cache.read("same", load, first.signal);
  const two = cache.read("same", load, second.signal);
  const rejected = expect(one).rejects.toMatchObject({ name: "AbortError" });
  await Promise.resolve();
  first.abort();
  await rejected;
  expect(load.mock.calls[0][1].aborted).toBe(false);
  reply.resolve({ data: { name: "Meal" }, etag: '"v1"' });
  expect(await two).toEqual({ name: "Meal" });
  const waiting = pending<{ data: unknown }>();
  const last = new AbortController();
  const finalLoad = vi.fn((_etag, signal) =>
    waiting.promise.then((data) => ({ ...data, aborted: signal.aborted })),
  );
  const read = cache.read("other", finalLoad, last.signal);
  const cancelled = expect(read).rejects.toMatchObject({ name: "AbortError" });
  await Promise.resolve();
  last.abort();
  await cancelled;
  expect(finalLoad.mock.calls[0][1].aborted).toBe(true);
  expect(
    await cache.read("other", async () => ({ data: { fresh: true } })),
  ).toEqual({ fresh: true });
  waiting.resolve({ data: {} });
});

it("prevents invalidated in-flight data from refilling the cache", async () => {
  const cache = new RevalidatedCache();
  const old = pending<{ data: unknown; etag: string }>();
  const read = cache.read("menu", async () => old.promise);
  const cancelled = expect(read).rejects.toMatchObject({ name: "AbortError" });
  cache.clear();
  await cancelled;
  await cache.read("menu", async () => ({
    data: { price: 25 },
    etag: '"new"',
  }));
  old.resolve({ data: { price: 20 }, etag: '"old"' });
  await Promise.resolve();
  expect(
    await cache.read("menu", async () => ({ data: "", status: 304 })),
  ).toEqual({ price: 25 });
});

it("bounds entries and skips oversized or unvalidated responses", async () => {
  const cache = new RevalidatedCache();
  for (let index = 0; index < 9; index++)
    await cache.read(String(index), async () => ({
      data: index,
      etag: '"v1"',
    }));
  await expect(
    cache.read("0", async () => ({ data: "", status: 304 })),
  ).rejects.toThrow("body missing");
  await cache.read("large", async () => ({
    data: "a".repeat(2 * 1024 * 1024),
    etag: '"v1"',
  }));
  await expect(
    cache.read("large", async () => ({ data: "", status: 304 })),
  ).rejects.toThrow("body missing");
  await cache.read("legacy", async () => ({ data: {} }));
  const load = vi.fn(async () => ({ data: {} }));
  await cache.read("legacy", load);
  expect(load).toHaveBeenCalledWith(undefined, expect.any(AbortSignal));
});
