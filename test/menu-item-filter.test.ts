import { describe, expect, it } from "vitest";

import { filterMenuItems } from "@/app/backoffice/catalog/menu-items/menu-item-filter";
import type { Food } from "@/lib/catalog-contracts";

const foods: Food[] = [
  {
    id: 1,
    foodTypeId: 10,
    name: "Lohikeitto",
    remark: "Päivän ruoka",
    price: 14,
    img: "",
    foodType: "food",
    FoodType: { id: 10, name: "Keitot", remark: "" },
  },
  {
    id: 2,
    foodTypeId: 20,
    name: "Kahvi",
    remark: "Tumma paahto",
    price: 3,
    img: "",
    foodType: "drink",
    FoodType: { id: 20, name: "Juomat", remark: "" },
  },
];

describe("Ruokalista catalog filters", () => {
  it("keeps all menu items when the category filter is clear", () => {
    expect(filterMenuItems(foods, "all", "").map((food) => food.id)).toEqual([
      1, 2,
    ]);
  });

  it("keeps only items in the selected category", () => {
    expect(filterMenuItems(foods, 10, "").map((food) => food.id)).toEqual([1]);
  });

  it("searches names, remarks, and category names", () => {
    expect(
      filterMenuItems(foods, "all", "kahvi").map((food) => food.id),
    ).toEqual([2]);
    expect(
      filterMenuItems(foods, "all", "tumma").map((food) => food.id),
    ).toEqual([2]);
    expect(
      filterMenuItems(foods, "all", "keitot").map((food) => food.id),
    ).toEqual([1]);
  });
});
