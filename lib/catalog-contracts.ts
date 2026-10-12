import { isEuroAmount } from "./money.ts";

// EN: Public and waiter menus share these price boundaries before calculating client estimates.
// FI: Julkiset ja tarjoilijan valikot jakavat nämä hintarajat ennen asiakasarvioiden laskentaa.
export function hasValidMenuMoney(categories: unknown): boolean {
  return (
    Array.isArray(categories) &&
    categories.every(
      (category) =>
        category &&
        Array.isArray(category.food) &&
        Array.isArray(category.foodSizes) &&
        category.food.every(
          (food: { price?: unknown } | null) =>
            food && isEuroAmount(food.price),
        ) &&
        category.foodSizes.every(
          (size: { moneyAdded?: unknown } | null) =>
            size && isEuroAmount(size.moneyAdded),
        ),
    )
  );
}
export type FoodCategory = { id: number; name: string; remark: string };
export type FoodKind = "food" | "drink";
export type TaxCategory = "FOOD_NON_ALCOHOLIC" | "ALCOHOL";
export type Food = {
  id: number;
  foodTypeId: number;
  name: string;
  remark: string;
  price: number;
  img: string;
  detailImg?: string;
  foodType: FoodKind;
  taxCategory?: TaxCategory | null;
  FoodType: FoodCategory;
};
export type FoodSize = {
  id: number;
  name: string;
  remark: string;
  foodTypeId: number;
  moneyAdded: number;
  FoodType: FoodCategory;
};
export type Taste = {
  id: number;
  name: string;
  remark: string;
  foodTypeId: number;
  FoodType: FoodCategory;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isFoodCategory = (value: unknown): value is FoodCategory =>
  isRecord(value) &&
  typeof value.id === "number" &&
  typeof value.name === "string" &&
  typeof value.remark === "string";

export const isFood = (value: unknown): value is Food =>
  isRecord(value) &&
  typeof value.id === "number" &&
  typeof value.foodTypeId === "number" &&
  typeof value.name === "string" &&
  typeof value.remark === "string" &&
  isEuroAmount(value.price) &&
  typeof value.img === "string" &&
  (value.detailImg === undefined || typeof value.detailImg === "string") &&
  (value.foodType === "food" || value.foodType === "drink") &&
  (value.taxCategory == null ||
    value.taxCategory === "FOOD_NON_ALCOHOLIC" ||
    value.taxCategory === "ALCOHOL") &&
  isFoodCategory(value.FoodType);

export const isFoodSize = (value: unknown): value is FoodSize =>
  isRecord(value) &&
  typeof value.id === "number" &&
  typeof value.name === "string" &&
  typeof value.remark === "string" &&
  typeof value.foodTypeId === "number" &&
  isEuroAmount(value.moneyAdded) &&
  isFoodCategory(value.FoodType);

export const isTaste = (value: unknown): value is Taste =>
  isRecord(value) &&
  typeof value.id === "number" &&
  typeof value.name === "string" &&
  typeof value.remark === "string" &&
  typeof value.foodTypeId === "number" &&
  isFoodCategory(value.FoodType);

export function parseResults<T>(
  value: unknown,
  validator: (item: unknown) => item is T,
): T[] | null {
  if (!isRecord(value) || !Array.isArray(value.results)) return null;
  return value.results.every(validator) ? value.results : null;
}
