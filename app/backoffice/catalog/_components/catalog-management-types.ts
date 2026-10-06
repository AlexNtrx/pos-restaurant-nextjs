import type { FoodCategory, FoodSize, Taste } from "@/lib/catalog-contracts";
import type { CatalogSection } from "./catalog-navigation";
export type ManagementKind = Exclude<CatalogSection, "menu-items">;
export type ManagementRow = FoodCategory | FoodSize | Taste;
export function hasCategory(row: ManagementRow): row is FoodSize | Taste {
  return "FoodType" in row;
}
