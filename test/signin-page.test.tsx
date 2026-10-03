import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  replace: vi.fn(),
  error: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/lib/api", () => ({ publicApi: { post: mocks.post } }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, warning: vi.fn() } }));

import SignInPage from "@/app/signin/page";
import { AUTH_REQUEST_TIMEOUT_MS } from "@/lib/auth-request-policy";

const response = {
  data: { token: "synthetic-token", name: "Cashier", id: 42 },
};

function submit() {
  fireEvent.change(screen.getByLabelText("Käyttäjätunnus"), {
    target: { value: " kassa01 " },
  });
  fireEvent.change(screen.getByLabelText("Salasana"), {
    target: { value: "synthetic-password" },
  });
  const form = screen
    .getByRole("button", { name: "Kirjaudu" })
    .closest("form")!;
  fireEvent.submit(form);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.post.mockReset();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("bounded login attempts", () => {
  it("stores one validated warm response and navigates once", async () => {
    mocks.post.mockResolvedValue(response);
    render(<SignInPage />);
    await act(async () => {
      submit();
    });
    expect(mocks.post).toHaveBeenCalledOnce();
    expect(mocks.post).toHaveBeenCalledWith(
      "/user/signIn",
      { username: "kassa01", password: "synthetic-password" },
      expect.objectContaining({
        timeout: AUTH_REQUEST_TIMEOUT_MS,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(localStorage.getItem("mytokenfornextjsproject")).toBe(
      "synthetic-token",
    );
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/backoffice");
  });

  it("waits through a 25-second response without duplicate submits or automatic retries", async () => {
    vi.useFakeTimers();
    mocks.post.mockImplementation(
      () =>
        new Promise((resolve) => setTimeout(() => resolve(response), 25_000)),
    );
    render(<SignInPage />);
    const form = submit();
    fireEvent.submit(form);
    expect(mocks.post).toHaveBeenCalledOnce();
    expect(
      screen
        .getByRole("button", { name: "Kirjaudutaan…" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByRole("status").textContent).toContain(
      "Palvelimen vastausta odotetaan",
    );
    await act(() => vi.advanceTimersByTimeAsync(19_999));
    expect(mocks.replace).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/backoffice");
    expect(mocks.post).toHaveBeenCalledOnce();
  });

  it("ends a transport timeout with a manual retry and no saved token", async () => {
    mocks.post.mockRejectedValue({ isAxiosError: true, code: "ECONNABORTED" });
    render(<SignInPage />);
    await act(async () => {
      submit();
    });
    expect(mocks.error).toHaveBeenCalledWith("Kirjautuminen epäonnistui", {
      description: "API-palvelin ei vastannut ajoissa. Yritä uudelleen.",
    });
    expect(
      screen.getByRole("button", { name: "Kirjaudu" }).hasAttribute("disabled"),
    ).toBe(false);
    expect(localStorage.getItem("mytokenfornextjsproject")).toBeNull();
    expect(mocks.post).toHaveBeenCalledOnce();
  });

  it("rejects wrong credentials without saving a session or retrying", async () => {
    mocks.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 401 },
    });
    render(<SignInPage />);
    await act(async () => {
      submit();
    });
    expect(mocks.error).toHaveBeenCalledWith("Kirjautuminen epäonnistui", {
      description: "Virheellinen käyttäjätunnus tai salasana.",
    });
    expect(localStorage.getItem("mytokenfornextjsproject")).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.post).toHaveBeenCalledOnce();
  });

  it("does not accept an invalid authentication response", async () => {
    mocks.post.mockResolvedValue({ data: { token: "", id: 42 } });
    render(<SignInPage />);
    await act(async () => {
      submit();
    });
    expect(mocks.error).toHaveBeenCalledWith("Kirjautuminen epäonnistui", {
      description: "API palautti virheellisen kirjautumisvastauksen.",
    });
    expect(localStorage.getItem("mytokenfornextjsproject")).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("aborts on unmount and ignores a late successful response", async () => {
    let resolve!: (value: typeof response) => void;
    mocks.post.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const view = render(<SignInPage />);
    submit();
    const signal = mocks.post.mock.calls[0][2].signal as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      resolve(response);
    });
    expect(localStorage.getItem("mytokenfornextjsproject")).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
