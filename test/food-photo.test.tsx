import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import FoodPhoto from "@/components/catalog/food-photo";
import CatalogGrid from "@/app/backoffice/sale/_components/catalog-grid";

afterEach(cleanup);
const props = {
  filename: "meal.jpg",
  alt: "Meal",
  className: "h-32",
  sizes: "160px",
};

it("loads only a lazy card derivative, retaining its reserved layout", () => {
  render(<FoodPhoto {...props} />);
  const image = screen.getByAltText("Meal");
  expect(image.getAttribute("src")).toContain(
    "/uploads/variants/card/meal.jpg",
  );
  expect(image.getAttribute("loading")).toBe("lazy");
  expect(image.parentElement?.className).toContain("h-32");
  expect(document.querySelector('img[src*="/detail/"]')).toBeNull();
});

it("falls back once for an older API, then shows a placeholder without a retry loop", () => {
  render(<FoodPhoto {...props} />);
  fireEvent.error(screen.getByAltText("Meal"));
  expect(screen.getByAltText("Meal").getAttribute("src")).toBe(
    "http://localhost:3001/uploads/meal.jpg",
  );
  fireEvent.error(screen.getByAltText("Meal"));
  expect(screen.queryByAltText("Meal")).toBeNull();
});

it("preserves mounted images during cart rerenders and resets fallback for a new image", () => {
  const { rerender } = render(<FoodPhoto {...props} />);
  const image = screen.getByAltText("Meal");
  rerender(<FoodPhoto {...props} />);
  expect(screen.getByAltText("Meal")).toBe(image);
  fireEvent.error(image);
  rerender(<FoodPhoto {...props} filename="new.jpg" variant="detail" />);
  expect(screen.getByAltText("Meal").getAttribute("src")).toContain(
    "/uploads/variants/detail/new.jpg",
  );
});

it.each(["", "../secret.png", "https://outside.example/image.jpg"])(
  "skips invalid filenames %j",
  (filename) => {
    render(<FoodPhoto {...props} filename={filename} />);
    expect(screen.queryByAltText("Meal")).toBeNull();
  },
);

it("keeps a catalog item without an image available for ordering", () => {
  const onSelect = vi.fn();
  render(
    <CatalogGrid
      foods={[{ id: 7, name: "Keitto", img: "", price: 12 }]}
      disabled={false}
      status="ready"
      emptyDescription=""
      onRetry={() => {}}
      onSelect={onSelect}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Keitto/ }));
  expect(onSelect).toHaveBeenCalledWith(7);
  expect(document.querySelector("img")).toBeNull();
});
