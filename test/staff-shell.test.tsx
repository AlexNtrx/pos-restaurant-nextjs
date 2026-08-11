import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StaffShell from "@/app/backoffice/components/staff-shell";
import {
  canAccessBackofficePath,
  getBackofficeLanding,
  getVisibleBackofficeNavigation,
} from "@/lib/access-control";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/backoffice/dashboard",
  useRouter: () => ({ replace }),
}));

vi.mock("next/link", () => ({
  default: ({ href, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props} />
  ),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  replace.mockClear();
});

describe("TW-03 staff shell and navigation", () => {
  it("keeps canonical and legacy routes under the same role rules", () => {
    expect(
      canAccessBackofficePath("/backoffice/catalog/menu-items", "admin"),
    ).toBe(true);
    expect(canAccessBackofficePath("/backoffice/food", "admin")).toBe(true);
    expect(canAccessBackofficePath("/backoffice/orders/new", "user")).toBe(
      true,
    );
    expect(canAccessBackofficePath("/backoffice/sale", "user")).toBe(true);
    expect(canAccessBackofficePath("/backoffice/user", "user")).toBe(false);
    expect(canAccessBackofficePath("/backoffice/kitchen", "admin")).toBe(false);
    expect(getBackofficeLanding("admin")).toBe("/backoffice/dashboard");
    expect(getBackofficeLanding("user")).toBe("/backoffice/sale");
  });

  it("shows only navigation groups permitted by the existing role contract", () => {
    expect(
      getVisibleBackofficeNavigation("user").map(({ label }) => label),
    ).toEqual(["Tilaukset"]);
    expect(
      getVisibleBackofficeNavigation("admin").map(({ label }) => label),
    ).toEqual([
      "Yhteenveto",
      "Ruokalista",
      "Tilaukset",
      "Keittiö",
      "Raportit",
      "Asetukset",
    ]);
  });

  it("renders the responsive shell without changing page content", () => {
    render(
      <StaffShell name="Ada Korhonen" userLevel="admin">
        <h1>Legacy page content</h1>
      </StaffShell>,
    );

    expect(
      screen.getByRole("heading", { name: "Legacy page content" }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("link", { name: "Yhteenveto" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Keittiö").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Helsinki · Keskusta").length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("QR-tilaaminen").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ei käytössä").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Yhteys kunnossa").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ruokalistan tuotteet")).toBeNull();
    expect(screen.queryByText("Tulossa")).toBeNull();
    expect(screen.getAllByLabelText("Kirjaudu ulos").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Ylläpitäjä: Ada Korhonen").length,
    ).toBeGreaterThan(0);

    const activeOverview = screen.getAllByRole("link", {
      name: "Yhteenveto",
    })[0];
    expect(activeOverview.style.backgroundColor).toBe("rgb(112, 111, 94)");
    expect(activeOverview.style.textDecoration).toBe("none");

    const desktopSidebar = screen.getAllByRole("complementary", {
      name: "Päänavigointi",
    })[1];
    expect(desktopSidebar.className).toContain("h-dvh");
    expect(desktopSidebar.parentElement?.className).toContain("sticky");
    expect(desktopSidebar.parentElement?.className).toContain("top-0");
    expect(desktopSidebar.parentElement?.className).toContain("h-dvh");
    expect(desktopSidebar.firstElementChild?.className).not.toContain(
      "max-h-[900px]",
    );

    const mainContent = screen.getByRole("main");
    expect(mainContent.parentElement?.parentElement?.className).toContain(
      "min-h-dvh",
    );
  });

  it("shows the localized staff role and name next to sign-out", () => {
    render(
      <StaffShell name="Aino" userLevel="user">
        <div>Content</div>
      </StaffShell>,
    );

    expect(screen.getAllByText("Työntekijä: Aino").length).toBeGreaterThan(0);
  });

  it("uses the same NavItem geometry for Keittiö and every desktop item", () => {
    render(
      <StaffShell name="Ada Korhonen" userLevel="admin">
        <div>Content</div>
      </StaffShell>,
    );

    const desktopSidebar = screen.getAllByRole("complementary", {
      name: "Päänavigointi",
    })[1];
    const navigationItems = Array.from(
      desktopSidebar.querySelectorAll<HTMLElement>('[data-slot="nav-item"]'),
    );

    expect(navigationItems).toHaveLength(6);
    for (const item of navigationItems) {
      expect(item.className).toContain("h-10");
      expect(item.className).toContain("min-h-10");
      expect(item.className).toContain("!gap-[8px]");
      expect(item.className).toContain("!px-[12px]");
      expect(item.className).toContain("!py-[8px]");
      expect(item.className).toContain("!rounded-[8px]");
      expect(
        item.querySelector('[data-slot="nav-item-icon"]')?.className,
      ).toContain("size-4");
    }

    const kitchenItem = navigationItems.find(
      (item) => item.textContent === "Keittiö",
    );
    expect(kitchenItem?.tagName).toBe("A");
    expect(kitchenItem?.getAttribute("aria-disabled")).toBe("true");
    expect(kitchenItem?.getAttribute("href")).toBeNull();
  });

  it("preserves confirmed sign-out behavior", async () => {
    const user = userEvent.setup();
    localStorage.setItem("mytokenfornextjsproject", "token");
    localStorage.setItem("next_name", "Ada Korhonen");
    localStorage.setItem("next_user_id", "42");

    render(
      <StaffShell name="Ada Korhonen" userLevel="admin">
        <div>Content</div>
      </StaffShell>,
    );

    await user.click(screen.getAllByLabelText("Kirjaudu ulos")[0]);
    const confirmation = screen.getByRole("alertdialog");
    await user.click(
      within(confirmation).getByRole("button", { name: "Kirjaudu ulos" }),
    );

    expect(localStorage.getItem("mytokenfornextjsproject")).toBeNull();
    expect(replace).toHaveBeenCalledWith("/signin");
  });
});
