import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TablesSettingsPage from "@/app/backoffice/settings/tables/page";

const { get, post, put, remove } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  default: { get, post, put, delete: remove },
}));
vi.mock("next/link", () => ({
  default: ({ href, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props} />
  ),
}));
vi.mock("qrcode", () => ({
  toDataURL: vi.fn(async () => "data:image/png;base64,cXJjb2Rl"),
}));

const openTable = {
  id: 9,
  tableNo: 12,
  name: "Ikkuna",
  openSession: {
    id: 28,
    openedAt: new Date(Date.now() - 60_000).toISOString(),
    qrTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    tokenVersion: 3,
  },
};
const qrPath = `/order/${"A".repeat(43)}`;

function mockLoad(level: "admin" | "kassa" = "admin") {
  get.mockImplementation(async (path: string) => {
    if (path === "/tables") return { data: { results: [openTable] } };
    if (path === "/qr-mode") return { data: { result: { mode: "DISABLED" } } };
    if (path === "/user/getLevelByToken") return { data: { level } };
    if (path === "/user/list")
      return {
        data: {
          results: [
            { id: 3, name: "Test Admin", username: "admin", level: "admin" },
          ],
        },
      };
    if (path === "/organization/info")
      return {
        data: {
          result: {
            id: 1,
            name: "Test Restaurant",
            address: "Test Street 1",
            phone: "123456",
            email: "test@example.com",
            website: "",
            bankNo: "",
            logo: "",
            taxCode: "1234567-8",
          },
        },
      };
    if (path === "/table-sessions/28/qr")
      return { data: { result: { path: qrPath } } };
    throw new Error(`Unexpected GET ${path}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoad();
  post.mockResolvedValue({ data: { result: {} } });
  put.mockResolvedValue({ data: { result: {} } });
  remove.mockResolvedValue({ data: { message: "success" } });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, "", window.location.pathname);
});

describe("QR-01 tables screen", () => {
  it("switches admin settings content without leaving the page", async () => {
    const user = userEvent.setup();
    const originalPath = window.location.pathname;
    render(<TablesSettingsPage />);
    const tab = (name: string) =>
      within(
        screen.getByRole("navigation", { name: "Asetusten välilehdet" }),
      ).getByRole("button", { name });
    await screen.findByRole("navigation", { name: "Asetusten välilehdet" });
    await user.click(tab("Henkilöstö"));
    expect(await screen.findByText("Test Admin")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Pöydät ja QR-istunnot" }),
    ).toBeNull();
    expect(tab("Henkilöstö").getAttribute("aria-pressed")).toBe("true");

    await user.click(tab("Ravintolan tiedot"));
    expect(
      await screen.findByRole("heading", { name: "Perustiedot" }),
    ).toBeTruthy();

    await user.click(tab("QR-tila"));
    expect(
      screen.getAllByRole("heading", { name: "QR-tilaaminen" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("heading", { name: "Pöydät ja QR-istunnot" }),
    ).toBeNull();

    await user.click(tab("Pöydät ja QR"));
    expect(
      screen.getByRole("heading", { name: "Pöydät ja QR-istunnot" }),
    ).toBeTruthy();
    expect(window.location.pathname).toBe(originalPath);
  });

  it("selects the QR panel for the existing QR settings hash", async () => {
    window.history.replaceState(null, "", "#qr-mode");
    render(<TablesSettingsPage />);
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "QR-tila" })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    expect(
      screen.queryByRole("heading", { name: "Pöydät ja QR-istunnot" }),
    ).toBeNull();
  });

  it("keeps an uncertain table payment recoverable after the session closes", async () => {
    localStorage.setItem("mytokenfornextjsproject", "test-token");
    localStorage.setItem("next_name", "Staff");
    localStorage.setItem("next_user_id", "7");
    localStorage.setItem(
      "table-payment:v1:7:28",
      JSON.stringify({
        tableNo: 12,
        orders: [{ id: 41, version: 5 }],
        idempotencyKey: "381d3c0d-9492-4d03-a3ab-ab525df2e497",
        payType: "bank",
        total: 40,
      }),
    );
    get.mockImplementation(async (path: string) => {
      if (path === "/tables")
        return { data: { results: [{ ...openTable, openSession: null }] } };
      if (path === "/qr-mode")
        return { data: { result: { mode: "DISABLED" } } };
      if (path === "/user/getLevelByToken") return { data: { level: "kassa" } };
      if (path === "/orders")
        return {
          data: {
            results: [],
            nextCursor: null,
            serverTime: new Date().toISOString(),
          },
        };
      throw new Error(`Unexpected GET ${path}`);
    });
    const user = userEvent.setup();
    render(<TablesSettingsPage />);
    expect(screen.queryByRole("button", { name: "Maksa istunto" })).toBeNull();
    await user.click(
      await screen.findByRole("button", { name: /Tarkista maksu · pöytä 12/ }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Pöytä 12 · maksu" }),
    ).toBeTruthy();
  });

  it("reissues the same QR through the staff API and renders it locally", async () => {
    const user = userEvent.setup();
    render(<TablesSettingsPage />);
    await user.click(
      await screen.findByRole("button", { name: /Näytä \/ tulosta QR/ }),
    );
    expect(get).toHaveBeenCalledWith("/table-sessions/28/qr");
    const dialog = await screen.findByRole("dialog", {
      name: /Pöytä 12 · QR-koodi/,
    });
    expect(
      within(dialog).getByRole("img", { name: /Pöydän 12 QR-koodi/ }),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/Jaa QR-koodi vasta käyttöönoton jälkeen/),
    ).toBeTruthy();
  });

  it("sends the listed token version when staff confirms rotation", async () => {
    const user = userEvent.setup();
    render(<TablesSettingsPage />);
    await user.click(await screen.findByRole("button", { name: "Uusi koodi" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Vahvista",
      }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/table-sessions/28/rotate-token", {
        expectedVersion: 3,
      }),
    );
  });

  it("hides admin mutations from staff but lets them close a session", async () => {
    mockLoad("kassa");
    const user = userEvent.setup();
    render(<TablesSettingsPage />);
    await screen.findByRole("heading", { name: "Pöydät ja QR-istunnot" });
    await screen.findByRole("button", { name: "Sulje istunto" });
    expect(screen.queryByRole("button", { name: "Henkilöstö" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lisää pöytä" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Muokkaa pöytää/ })).toBeNull();
    expect(screen.queryByRole("group", { name: "Valitse QR-tila" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Sulje istunto" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Vahvista",
      }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/table-sessions/28/close", {
        expectedVersion: 3,
      }),
    );
  });

  it("offers rotation for an older open session without a QR", async () => {
    mockLoad();
    get.mockImplementation(async (path: string) => {
      if (path === "/tables")
        return {
          data: {
            results: [
              {
                ...openTable,
                openSession: {
                  ...openTable.openSession,
                  qrTokenExpiresAt: null,
                  tokenVersion: 0,
                },
              },
            ],
          },
        };
      if (path === "/qr-mode")
        return { data: { result: { mode: "DISABLED" } } };
      if (path === "/user/getLevelByToken") return { data: { level: "admin" } };
      throw new Error(`Unexpected GET ${path}`);
    });
    const user = userEvent.setup();
    render(<TablesSettingsPage />);
    await screen.findByText("QR-koodia ei vielä ole");
    expect(
      screen.queryByRole("button", { name: /Näytä \/ tulosta QR/ }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Uusi koodi" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Vahvista",
      }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/table-sessions/28/rotate-token", {
        expectedVersion: 0,
      }),
    );
  });

  it("marks an expired QR and requires rotation instead of offering preview", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/tables")
        return {
          data: {
            results: [
              {
                ...openTable,
                openSession: {
                  ...openTable.openSession,
                  qrTokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
                },
              },
            ],
          },
        };
      if (path === "/qr-mode")
        return { data: { result: { mode: "DISABLED" } } };
      if (path === "/user/getLevelByToken") return { data: { level: "admin" } };
      throw new Error(`Unexpected GET ${path}`);
    });
    render(<TablesSettingsPage />);
    await screen.findByText(/QR-koodi on vanhentunut/);
    expect(
      screen.queryByRole("button", { name: /Näytä \/ tulosta QR/ }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Uusi koodi" })).toBeTruthy();
  });

  it("shows a Finnish business-rule message when unpaid orders block closing", async () => {
    post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          code: "UNSETTLED_ORDERS",
          error: "Settle or cancel session orders before closing",
        },
      },
    });
    const user = userEvent.setup();
    render(<TablesSettingsPage />);
    await user.click(
      await screen.findByRole("button", { name: "Sulje istunto" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Vahvista",
      }),
    );
    expect(
      await screen.findByText(
        "Maksa tai peruuta kaikki istunnon tilaukset ennen sulkemista.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText("Settle or cancel session orders before closing"),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Sulje istunto" })).toBeTruthy();
  });

  it("uses a Finnish fallback for an unknown HTTP error", async () => {
    post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: { error: "Internal server error" } },
    });
    const user = userEvent.setup();
    render(<TablesSettingsPage />);
    await user.click(
      await screen.findByRole("button", { name: "Sulje istunto" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Vahvista",
      }),
    );
    expect(
      await screen.findByText(
        "Toiminto epäonnistui. Päivitä tiedot ja yritä uudelleen.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Internal server error")).toBeNull();
  });
});
