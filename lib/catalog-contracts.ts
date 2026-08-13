export type FoodCategory = { id: number; name: string; remark: string };
export type FoodKind = "food" | "drink";
export type Food = {
  id: number;
  foodTypeId: number;
  name: string;
  remark: string;
  price: number;
  img: string;
  foodType: FoodKind;
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
  typeof value.price === "number" &&
  Number.isFinite(value.price) &&
  typeof value.img === "string" &&
  (value.foodType === "food" || value.foodType === "drink") &&
  isFoodCategory(value.FoodType);

export const isFoodSize = (value: unknown): value is FoodSize =>
  isRecord(value) &&
  typeof value.id === "number" &&
  typeof value.name === "string" &&
  typeof value.remark === "string" &&
  typeof value.foodTypeId === "number" &&
  typeof value.moneyAdded === "number" &&
  Number.isFinite(value.moneyAdded) &&
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
