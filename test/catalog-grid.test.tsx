import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import CatalogGrid from "@/app/backoffice/sale/_components/catalog-grid";

afterEach(cleanup);

it("bounds a thousand-item catalog and selects items on later pages by keyboard", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const foods = Array.from({ length: 1000 }, (_, index) => ({
    id: index + 1,
    name: `Meal ${index + 1}`,
    img: "meal.jpg",
    price: 20,
  }));
  const props = {
    foods,
    onSelect,
    disabled: false,
    status: "ready" as const,
    emptyDescription: "",
    onRetry: vi.fn(),
  };
  const { rerender } = render(<CatalogGrid {...props} />);
  expect(screen.getAllByRole("img")).toHaveLength(24);
  expect(screen.queryByRole("button", { name: /Meal 25 / })).toBeNull();
  screen.getByRole("button", { name: "Seuraava" }).focus();
  await user.keyboard("{Enter}");
  expect(screen.getByText("25–48 / 1000")).toBeTruthy();
  screen.getByRole("button", { name: /Meal 25 / }).focus();
  await user.keyboard(" ");
  expect(onSelect).toHaveBeenLastCalledWith(25);
  rerender(<CatalogGrid {...props} disabled />);
  expect(
    (screen.getByRole("button", { name: /Meal 25 / }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  rerender(<CatalogGrid {...props} foods={foods.slice(0, 2)} />);
  expect(screen.getByText("1–2 / 2")).toBeTruthy();
  expect(screen.getAllByRole("img")).toHaveLength(2);
});
