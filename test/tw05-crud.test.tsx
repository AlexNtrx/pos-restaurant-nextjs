import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CatalogManagementPage } from "@/app/backoffice/catalog/_components/catalog-management-page";
import MenuItemsPage from "@/app/backoffice/catalog/menu-items/menu-items-page";
import RestaurantSettingsPage from "@/app/backoffice/settings/restaurant/page";
import StaffPage from "@/app/backoffice/staff/page";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ default: api }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const category = { id: 3, name: "Pääruoat", remark: "" };
const food = {
  id: 8,
  foodTypeId: 3,
  name: "Lohikeitto",
  remark: "",
  price: 14,
  img: "",
  foodType: "food" as const,
  FoodType: category,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.post.mockResolvedValue({ data: {} });
  api.put.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue({ data: {} });
});

afterEach(cleanup);

describe("TW-05 CRUD dialogs", () => {
  it("creates a kitchen account and preserves its role when editing", async () => {
    const cook = { id: 9, name: "Cook", username: "cook", level: "kitchen" };
    api.get.mockResolvedValue({ data: { results: [cook] } });
    const user = userEvent.setup();
    render(<StaffPage />);
    expect(await screen.findByText("Cook")).toBeTruthy();
    expect(screen.getByText("Keittiöhenkilökunta")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Lisää työntekijä" }));
    await user.type(screen.getByLabelText(/^Nimi/), "New Cook");
    await user.type(screen.getByLabelText(/^Käyttäjätunnus/), "newcook");
    await user.type(screen.getByLabelText(/^Salasana/), "test-password-1");
    await user.selectOptions(screen.getByLabelText(/^Rooli/), "kitchen");
    await user.click(screen.getByRole("button", { name: "Tallenna" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/user/create", {
        name: "New Cook",
        username: "newcook",
        password: "test-password-1",
        level: "kitchen",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Muokkaa" }));
    expect((screen.getByLabelText(/^Rooli/) as HTMLSelectElement).value).toBe(
      "kitchen",
    );
    await user.click(screen.getByRole("button", { name: "Tallenna" }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/user/update", {
        id: 9,
        name: "Cook",
        username: "cook",
        level: "kitchen",
      }),
    );
  });
  it("creates and deletes a category through the canonical catalog route", async () => {
    api.get.mockResolvedValue({ data: { results: [category] } });
    const user = userEvent.setup();
    render(<CatalogManagementPage kind="categories" />);

    expect(await screen.findByText("Pääruoat")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Lisää kategoria" }));
    await user.type(screen.getByLabelText(/^Nimi/), "  Jälkiruoat  ");
    await user.type(screen.getByLabelText("Huomautus"), "Makeat");
    await user.click(screen.getByRole("button", { name: "Tallenna" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/foodtype/create", {
        name: "Jälkiruoat",
        remark: "Makeat",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Poista Pääruoat" }));
    await user.click(screen.getByRole("button", { name: "Poista" }));
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/foodtype/remove/3"),
    );
  });

  it("uploads separate list and More info images for a menu item", async () => {
    api.post.mockImplementation((path: string, body?: FormData) =>
      Promise.resolve({
        data:
          path === "/food/upload"
            ? { fileName: (body?.get("file") as File).name }
            : {},
      }),
    );
    api.get.mockImplementation((path: string) =>
      Promise.resolve({
        data: { results: path === "/food/list" ? [food] : [category] },
      }),
    );
    const user = userEvent.setup();
    render(<MenuItemsPage />);

    expect(await screen.findByText("Lohikeitto")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Lisää ruokalaji" }));
    await user.type(screen.getByLabelText(/^Nimi/), "Kahvi");
    const price = screen.getByLabelText(/^Hinta/);
    await user.clear(price);
    await user.type(price, "4");
    await user.selectOptions(screen.getByLabelText(/^Tyyppi/), "drink");
    await user.upload(
      screen.getByLabelText("Ruokalistan kuva"),
      new File(["image"], "coffee.webp", { type: "image/webp" }),
    );
    await user.upload(
      screen.getByLabelText("Lisätietokuva"),
      new File(["poster"], "details.jpg", { type: "image/jpeg" }),
    );
    await user.click(screen.getByRole("button", { name: "Tallenna" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/food/upload",
        expect.any(FormData),
      ),
    );
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/food/create", {
        foodTypeId: 3,
        name: "Kahvi",
        remark: "",
        price: 4,
        img: "coffee.webp",
        detailImg: "details.jpg",
        foodType: "drink",
      }),
    );
  });

  it("keeps edit and delete actions inside the menu item overflow", async () => {
    api.get.mockImplementation((path: string) =>
      Promise.resolve({
        data: { results: path === "/food/list" ? [food] : [category] },
      }),
    );
    const user = userEvent.setup();
    render(<MenuItemsPage />);

    expect(await screen.findByText("Lohikeitto")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Muokkaa: Lohikeitto" }),
    ).toBeNull();

    const editAction = screen.getByRole("button", { name: "Muokkaa" });
    expect(editAction.closest("details")).toBeTruthy();
    expect(
      screen.getByText("Lisää toimintoja: Lohikeitto").closest("summary"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Poista" }).closest("details"),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Poista" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Poistetaanko ruokalaji?" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Peruuta" }));

    await user.click(editAction);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Muokkaa ruokalajia" }),
    ).toBeTruthy();
    expect((screen.getByLabelText(/^Nimi/) as HTMLInputElement).value).toBe(
      "Lohikeitto",
    );
  });

  it("creates a size option with its category and integer surcharge", async () => {
    api.get.mockImplementation((path: string) =>
      Promise.resolve({
        data: {
          results:
            path === "/foodSize/list"
              ? [
                  {
                    id: 4,
                    name: "Iso",
                    remark: "",
                    foodTypeId: 3,
                    moneyAdded: 2,
                    FoodType: category,
                  },
                ]
              : [category],
        },
      }),
    );
    const user = userEvent.setup();
    render(<CatalogManagementPage kind="size-options" />);

    expect(await screen.findByText("Iso")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Lisää kokovaihtoehto" }),
    );
    await user.type(screen.getByLabelText(/^Nimi/), "Pieni");
    const surcharge = screen.getByLabelText(/^Hinnanlisä/);
    await user.clear(surcharge);
    await user.type(surcharge, "1");
    await user.click(screen.getByRole("button", { name: "Tallenna" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/foodSize/create", {
        foodTypeId: 3,
        moneyAdded: 1,
        name: "Pieni",
        remark: "",
      }),
    );
  });

  it("creates a modifier with the existing taste endpoint", async () => {
    api.get.mockImplementation((path: string) =>
      Promise.resolve({
        data: {
          results:
            path === "/taste/list"
              ? [
                  {
                    id: 5,
                    name: "Tulinen",
                    remark: "",
                    foodTypeId: 3,
                    FoodType: category,
                  },
                ]
              : [category],
        },
      }),
    );
    const user = userEvent.setup();
    render(<CatalogManagementPage kind="modifiers" />);

    expect(await screen.findByText("Tulinen")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Lisää lisävalinta" }));
    await user.type(screen.getByLabelText(/^Nimi/), "Mieto");
    await user.click(screen.getByRole("button", { name: "Tallenna" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/taste/create", {
        foodTypeId: 3,
        name: "Mieto",
        remark: "",
      }),
    );
  });

  it("keeps the signed-in staff account protected from self deletion", async () => {
    window.localStorage.setItem("next_user_id", "1");
    api.get.mockResolvedValue({
      data: {
        results: [
          { id: 1, name: "Admin", username: "admin", level: "admin" },
          { id: 2, name: "Aino", username: "aino", level: "user" },
        ],
      },
    });
    render(<StaffPage />);

    expect(await screen.findByText("Aino")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Poista admin" })).toBeNull();
    expect(screen.getByRole("button", { name: "Poista aino" })).toBeTruthy();
  });

  it("allows initial restaurant setup when the API has no organization", async () => {
    api.get.mockResolvedValue({ data: { result: null } });
    const user = userEvent.setup();
    render(<RestaurantSettingsPage />);
    await user.type(
      await screen.findByLabelText(/^Ravintolan nimi/),
      "New restaurant",
    );
    await user.type(screen.getByLabelText(/^Osoite/), "Test street 1");
    await user.type(screen.getByLabelText(/^Puhelin/), "123456");
    await user.type(screen.getByLabelText(/^Y-tunnus/), "TEST-1");
    await user.click(
      screen.getByRole("button", { name: "Tallenna muutokset" }),
    );
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/organization/create",
        expect.objectContaining({
          name: "New restaurant",
          taxCode: "TEST-1",
          logo: "",
        }),
      ),
    );
  });

  it("rejects malformed organization data instead of treating it as initial setup", async () => {
    api.get.mockResolvedValue({ data: {} });
    render(<RestaurantSettingsPage />);
    expect(await screen.findByText("Asetuksia ei voitu ladata")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Tallenna muutokset" }),
    ).toBeNull();
  });

  it("saves restaurant settings without uploading when the logo is unchanged", async () => {
    api.get.mockResolvedValue({
      data: {
        result: {
          id: 1,
          name: "Ravintola POS",
          address: "Keskuskatu 1",
          phone: "0401234567",
          email: "info@example.com",
          website: "https://example.com",
          bankNo: "FI001",
          logo: "logo.png",
          taxCode: "1234567-8",
        },
      },
    });
    const user = userEvent.setup();
    render(<RestaurantSettingsPage />);

    expect(await screen.findByDisplayValue("Ravintola POS")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Tallenna muutokset" }),
    );

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/organization/create", {
        name: "Ravintola POS",
        address: "Keskuskatu 1",
        phone: "0401234567",
        email: "info@example.com",
        website: "https://example.com",
        bankNo: "FI001",
        logo: "logo.png",
        taxCode: "1234567-8",
      }),
    );
    expect(api.post).not.toHaveBeenCalledWith(
      "/organization/upload",
      expect.any(FormData),
    );
  });

  it("uploads a newly selected restaurant logo before saving its filename", async () => {
    api.get.mockResolvedValue({
      data: {
        result: {
          id: 1,
          name: "Ravintola POS",
          address: "Keskuskatu 1",
          phone: "0401234567",
          email: "info@example.com",
          website: "https://example.com",
          bankNo: "FI001",
          logo: "old-logo.png",
          taxCode: "1234567-8",
        },
      },
    });
    api.post.mockImplementation((path: string) =>
      Promise.resolve({
        data:
          path === "/organization/upload" ? { fileName: "new-logo.webp" } : {},
      }),
    );
    const user = userEvent.setup();
    render(<RestaurantSettingsPage />);

    expect(await screen.findByDisplayValue("Ravintola POS")).toBeTruthy();
    await user.upload(
      screen.getByLabelText("Vaihda logo"),
      new File(["logo"], "new-logo.webp", { type: "image/webp" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Tallenna muutokset" }),
    );

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/organization/upload",
        expect.any(FormData),
      ),
    );
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/organization/create", {
        name: "Ravintola POS",
        address: "Keskuskatu 1",
        phone: "0401234567",
        email: "info@example.com",
        website: "https://example.com",
        bankNo: "FI001",
        logo: "new-logo.webp",
        taxCode: "1234567-8",
      }),
    );
  });

  it("shows the approved validation state without posting incomplete settings", async () => {
    api.get.mockResolvedValue({
      data: {
        result: {
          id: 1,
          name: "",
          address: "",
          phone: "",
          email: "",
          website: "",
          bankNo: "",
          logo: "",
          taxCode: "",
        },
      },
    });
    const user = userEvent.setup();
    render(<RestaurantSettingsPage />);

    expect(await screen.findByLabelText(/^Ravintolan nimi/)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Tallenna muutokset" }),
    );

    expect(
      await screen.findByText("Ravintolan nimi on pakollinen."),
    ).toBeTruthy();
    expect(
      screen.getByText("Tarkista merkityt kentät ennen tallentamista."),
    ).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });
});
