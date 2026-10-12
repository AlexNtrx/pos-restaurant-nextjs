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

describe("connection evidence", () => {
  it("does not infer connectivity from local events or overlap an unresolved server read", async () => {
    let resolve!: (value: unknown) => void;
    mocks.get.mockReturnValue(
      new Promise((yes) => {
        resolve = yes;
      }),
    );
    shell();
    expect(
      screen.getAllByText("Yhteyttä tarkistetaan…").length,
    ).toBeGreaterThan(0);
    act(() => {
      window.dispatchEvent(
        new CustomEvent("qr-mode-changed", { detail: "ORDERING" }),
      );
      window.dispatchEvent(new Event("focus"));
    });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Palvelin vastasi")).toBeNull();
    await act(async () => resolve({ data: { result: { mode: "DISABLED" } } }));
    expect(screen.getAllByText("Palvelin vastasi").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tarkistettu/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tilaaminen käytössä").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText("Yhteys kunnossa")).toBeNull();
  });
  it("removes successful evidence after failure and recovers only after a new valid read", async () => {
    mocks.get.mockResolvedValueOnce({
      data: { result: { mode: "MENU_ONLY" } },
    });
    shell();
    await waitFor(() =>
      expect(screen.getAllByText("Palvelin vastasi").length).toBeGreaterThan(0),
    );
    mocks.get.mockRejectedValueOnce(new Error("network unavailable"));
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() =>
      expect(
        screen.getAllByText("Yhteyttä ei voitu varmistaa").length,
      ).toBeGreaterThan(0),
    );
    expect(screen.queryByText("Palvelin vastasi")).toBeNull();
    mocks.get.mockResolvedValueOnce({ data: { result: { mode: "ORDERING" } } });
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() =>
      expect(screen.getAllByText("Palvelin vastasi").length).toBeGreaterThan(0),
    );
  });
  it("treats browser offline as a device signal, then verifies the server on return", async () => {
    online = false;
    shell();
    await waitFor(() =>
      expect(screen.getAllByText("Laite offline").length).toBeGreaterThan(0),
    );
    expect(mocks.get).not.toHaveBeenCalled();
    mocks.get.mockResolvedValueOnce({ data: { result: { mode: "DISABLED" } } });
    online = true;
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() =>
      expect(screen.getAllByText("Palvelin vastasi").length).toBeGreaterThan(0),
    );
    online = false;
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.queryByText("Palvelin vastasi")).toBeNull();
    expect(screen.getAllByText("Laite offline").length).toBeGreaterThan(0);
  });
  it("does not turn a malformed server response into connection success", async () => {
    mocks.get.mockResolvedValue({ data: { result: { mode: "BROKEN" } } });
    shell();
    await waitFor(() =>
      expect(
        screen.getAllByText("Yhteyttä ei voitu varmistaa").length,
      ).toBeGreaterThan(0),
    );
    expect(screen.queryByText("Palvelin vastasi")).toBeNull();
  });
});
