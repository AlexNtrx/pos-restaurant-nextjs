import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  readStaffCatalog,
  readQrCatalog,
  invalidateCatalogCache,
} from "@/lib/catalog-reads";
import { clearAuthSession, writeAuthSession } from "@/lib/auth-session";

const { staff, publicRead } = vi.hoisted(() => ({
  staff: vi.fn(),
  publicRead: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  default: { get: staff },
  publicApi: { get: publicRead },
}));
const parse = (data: unknown) =>
  typeof data === "object" && data !== null && "name" in data ? data : null;
beforeEach(() => {
  vi.clearAllMocks();
  invalidateCatalogCache();
  localStorage.clear();
  staff.mockResolvedValue({
    status: 200,
    data: { name: "Meal" },
    headers: { etag: '"v1"' },
  });
  publicRead.mockResolvedValue({
    status: 200,
    data: { name: "QR meal" },
    headers: { etag: '"qr"' },
  });
});
afterEach(() => {
  clearAuthSession();
});

it("rechecks every completed read and never shares a validator between staff sessions or QR tokens", async () => {
  writeAuthSession({ token: "staff-A", name: "A", userId: "1" });
  await readStaffCatalog("/food/list", parse);
  staff.mockResolvedValueOnce({ status: 304, data: "", headers: {} });
  expect(await readStaffCatalog("/food/list", parse)).toEqual({ name: "Meal" });
  expect(staff).toHaveBeenLastCalledWith(
    "/food/list",
    expect.objectContaining({ headers: { "If-None-Match": '"v1"' } }),
  );
  writeAuthSession({ token: "staff-B", name: "B", userId: "2" });
  await readStaffCatalog("/food/list", parse);
  expect(staff.mock.lastCall?.[1].headers).toBeUndefined();
  await readQrCatalog("token-A", parse);
  await readQrCatalog("token-B", parse);
  expect(publicRead.mock.lastCall?.[1].headers).toBeUndefined();
  publicRead.mockResolvedValueOnce({ status: 304, data: "", headers: {} });
  expect(await readQrCatalog("token-A", parse)).toEqual({ name: "QR meal" });
});

it("invalidates after mutation or logout and rejects financial resources", async () => {
  writeAuthSession({ token: "staff-A", name: "A", userId: "1" });
  await readStaffCatalog("/food/list", parse);
  invalidateCatalogCache();
  await readStaffCatalog("/food/list", parse);
  expect(staff.mock.lastCall?.[1].headers).toBeUndefined();
  clearAuthSession();
  writeAuthSession({ token: "staff-A", name: "A", userId: "1" });
  await readStaffCatalog("/food/list", parse);
  expect(staff.mock.lastCall?.[1].headers).toBeUndefined();
  await expect(
    readStaffCatalog("/counterOrder/checkout", parse),
  ).rejects.toThrow("Unsupported");
});

it("rejects malformed bodies and does not retain their validators", async () => {
  writeAuthSession({ token: "staff-A", name: "A", userId: "1" });
  staff.mockResolvedValueOnce({
    status: 200,
    data: { bad: true },
    headers: { etag: '"bad"' },
  });
  await expect(readStaffCatalog("/food/list", parse)).rejects.toThrow(
    "virheelliset",
  );
  await readStaffCatalog("/food/list", parse);
  expect(staff.mock.lastCall?.[1].headers).toBeUndefined();
});
