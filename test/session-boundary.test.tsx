import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  pathname: "/backoffice/dashboard",
  replace: vi.fn(),
  apiGet: vi.fn(),
  router: { replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => mocks.router,
}));

vi.mock("@/lib/api", () => ({
  default: { get: mocks.apiGet },
}));

vi.mock("axios", () => ({
  isAxiosError: (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "isAxiosError" in error &&
    error.isAxiosError === true,
}));

vi.mock("@/app/backoffice/components/staff-shell", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="staff-shell">{children}</div>
  ),
}));

import SessionBoundary from "@/app/backoffice/components/session-boundary";
import { AUTH_REQUEST_TIMEOUT_MS } from "@/lib/auth-request-policy";

function storeSession() {
  localStorage.setItem("mytokenfornextjsproject", "token");
  localStorage.setItem("next_name", "Ada");
  localStorage.setItem("next_user_id", "42");
}

beforeEach(() => {
  mocks.pathname = "/backoffice/dashboard";
  mocks.replace.mockReset();
  mocks.router.replace = mocks.replace;
  mocks.apiGet.mockReset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("backoffice session boundary navigation", () => {
  it("bounds a slow verification, preserves credentials and never renders unverified content", async () => {
    vi.useFakeTimers();
    storeSession();
    mocks.apiGet.mockImplementation(
      (_path, { signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () =>
            reject({ isAxiosError: true, code: "ERR_CANCELED" }),
          );
        }),
    );
    render(
      <SessionBoundary>
        <div>Protected content</div>
      </SessionBoundary>,
    );
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByRole("status").textContent).toContain(
      "Palvelimen vastausta odotetaan",
    );
    expect(mocks.apiGet).toHaveBeenCalledExactlyOnceWith(
      "/user/getLevelByToken",
      expect.objectContaining({ timeout: AUTH_REQUEST_TIMEOUT_MS }),
    );
    await act(() =>
      vi.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS - 5_000),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Istunnon tarkistus kesti liian kauan",
    );
    expect(localStorage.getItem("mytokenfornextjsproject")).toBe("token");
    expect(screen.queryByText("Protected content")).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.apiGet).toHaveBeenCalledOnce();
  });
  it("redirects kitchen staff to their fullscreen board without rendering forbidden content", async () => {
    storeSession();
    mocks.pathname = "/backoffice/staff";
    mocks.apiGet.mockResolvedValue({ data: { level: "kitchen" } });
    const view = render(
      <SessionBoundary>
        <div>Restricted content</div>
      </SessionBoundary>,
    );
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/backoffice/kitchen"),
    );
    expect(screen.queryByText("Restricted content")).toBeNull();
    mocks.pathname = "/backoffice/kitchen";
    view.rerender(
      <SessionBoundary>
        <div>Kitchen content</div>
      </SessionBoundary>,
    );
    expect(await screen.findByText("Kitchen content")).toBeTruthy();
    expect(screen.queryByTestId("staff-shell")).toBeNull();
  });
  it("keeps a verified shell mounted and does not reverify on route changes", async () => {
    storeSession();
    mocks.apiGet.mockResolvedValue({ data: { level: "admin" } });

    const view = render(
      <SessionBoundary>
        <div>Dashboard content</div>
      </SessionBoundary>,
    );

    await screen.findByText("Dashboard content");
    expect(mocks.apiGet).toHaveBeenCalledTimes(1);

    mocks.pathname = "/backoffice/catalog/menu-items";
    view.rerender(
      <SessionBoundary>
        <div>Catalog content</div>
      </SessionBoundary>,
    );

    expect(await screen.findByText("Catalog content")).toBeTruthy();
    expect(screen.getByTestId("staff-shell")).toBeTruthy();
    expect(screen.queryByText("Istuntoa tarkistetaan…")).toBeNull();
    expect(mocks.apiGet).toHaveBeenCalledTimes(1);
  });

  it("redirects a verified user away from a direct unauthorized URL", async () => {
    storeSession();
    mocks.pathname = "/backoffice/staff";
    mocks.apiGet.mockResolvedValue({ data: { level: "kassa" } });

    render(
      <SessionBoundary>
        <div>Restricted content</div>
      </SessionBoundary>,
    );

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/backoffice/sale"),
    );
    expect(screen.queryByText("Restricted content")).toBeNull();
    expect(screen.getByText("Käyttöoikeutta tarkistetaan…")).toBeTruthy();
  });

  it("redirects an expired session to sign-in and clears local credentials", async () => {
    storeSession();
    mocks.apiGet.mockRejectedValue({
      isAxiosError: true,
      response: { status: 401 },
    });

    render(
      <SessionBoundary>
        <div>Protected content</div>
      </SessionBoundary>,
    );

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/signin"));
    expect(localStorage.getItem("mytokenfornextjsproject")).toBeNull();
    expect(screen.queryByText("Protected content")).toBeNull();
  });

  it("does not call the API when a direct visit has no session", async () => {
    render(
      <SessionBoundary>
        <div>Protected content</div>
      </SessionBoundary>,
    );

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/signin"));
    expect(mocks.apiGet).not.toHaveBeenCalled();
    expect(screen.queryByText("Protected content")).toBeNull();
  });
});
