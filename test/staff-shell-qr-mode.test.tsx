import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StaffShell from "@/app/backoffice/components/staff-shell";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: { get: mocks.get } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/backoffice/dashboard",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props} />
  ),
}));
let online = true;
beforeEach(() => {
  online = true;
  mocks.get.mockReset();
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const shell = () =>
  render(
    <StaffShell name="Demo" userLevel="admin">
      Content
    </StaffShell>,
  );

describe("staff shell QR mode refresh", () => {
  it("preserves a newer local mode without overlapping an unresolved server read", async () => {
    let resolve!: (value: unknown) => void;
    mocks.get.mockReturnValue(
      new Promise((yes) => {
        resolve = yes;
      }),
    );
    shell();
    expect(screen.queryByLabelText("Yhteystarkistus")).toBeNull();
    act(() => {
      window.dispatchEvent(
        new CustomEvent("qr-mode-changed", { detail: "ORDERING" }),
      );
      window.dispatchEvent(new Event("focus"));
    });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ data: { result: { mode: "DISABLED" } } }));
    expect(screen.getAllByText("Tilaaminen käytössä").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByLabelText("Yhteystarkistus")).toBeNull();
  });
  it("clears a stale QR mode after failure and recovers after a valid read", async () => {
    mocks.get.mockResolvedValueOnce({
      data: { result: { mode: "MENU_ONLY" } },
    });
    shell();
    await waitFor(() =>
      expect(screen.getAllByText("Vain ruokalista").length).toBeGreaterThan(0),
    );
    mocks.get.mockRejectedValueOnce(new Error("network unavailable"));
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() =>
      expect(screen.getAllByText("Tila ei saatavilla").length).toBeGreaterThan(
        0,
      ),
    );
    expect(screen.queryByText("Vain ruokalista")).toBeNull();
    mocks.get.mockResolvedValueOnce({ data: { result: { mode: "ORDERING" } } });
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() =>
      expect(screen.getAllByText("Tilaaminen käytössä").length).toBeGreaterThan(
        0,
      ),
    );
  });
  it("skips reads while offline and refreshes the QR mode on return", async () => {
    online = false;
    shell();
    await waitFor(() =>
      expect(screen.getAllByText("Tila ei saatavilla").length).toBeGreaterThan(
        0,
      ),
    );
    expect(mocks.get).not.toHaveBeenCalled();
    mocks.get.mockResolvedValueOnce({ data: { result: { mode: "DISABLED" } } });
    online = true;
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() =>
      expect(screen.getAllByText("Ei käytössä").length).toBeGreaterThan(0),
    );
    online = false;
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.queryByText("Ei käytössä")).toBeNull();
    expect(screen.getAllByText("Tila ei saatavilla").length).toBeGreaterThan(0);
  });
  it("does not show an ordering mode for a malformed server response", async () => {
    mocks.get.mockResolvedValue({ data: { result: { mode: "BROKEN" } } });
    shell();
    await waitFor(() =>
      expect(screen.getAllByText("Tila ei saatavilla").length).toBeGreaterThan(
        0,
      ),
    );
    expect(screen.queryByText("Tilaaminen käytössä")).toBeNull();
  });
});
