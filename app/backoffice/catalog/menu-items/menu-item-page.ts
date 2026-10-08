import api from "@/lib/api";
import { isFood, type Food } from "@/lib/catalog-contracts";

type Filters = {
  query: string;
  category: "all" | number;
  page: number;
  pageSize: number;
};

export type MenuItemPage = {
  results: Food[];
  totalCount: number;
  filteredCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

// EN: Validate page metadata and bounded rows before showing counts or navigation from the API.
// FI: Tarkista sivun metatiedot ja rajattu rivimäärä ennen API:n lukumäärien tai navigoinnin näyttämistä.
function parseMenuItemPage(
  value: unknown,
  filters: Filters,
): MenuItemPage | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (
    !Array.isArray(data.results) ||
    !data.results.every(isFood) ||
    !isCount(data.totalCount) ||
    !isCount(data.filteredCount) ||
    data.filteredCount > data.totalCount ||
    !isCount(data.page) ||
    !isCount(data.pageCount) ||
    data.pageSize !== filters.pageSize ||
    data.pageCount !==
      Math.max(1, Math.ceil(data.filteredCount / filters.pageSize)) ||
    data.page !== Math.min(filters.page, data.pageCount) ||
    data.results.length !==
      Math.min(
        filters.pageSize,
        Math.max(0, data.filteredCount - (data.page - 1) * filters.pageSize),
      ) ||
    !data.results.every(
      (food, index, foods) =>
        Number.isSafeInteger(food.id) &&
        food.id > 0 &&
        food.foodTypeId === food.FoodType.id &&
        (filters.category === "all" || food.foodTypeId === filters.category) &&
        (index === 0 || foods[index - 1].id > food.id),
    )
  )
    return null;
  return data as MenuItemPage;
}

export async function fetchMenuItemPage(filters: Filters, signal: AbortSignal) {
  const response = await api.get<unknown>("/food/page", {
    signal,
    params: {
      page: filters.page,
      limit: filters.pageSize,
      q: filters.query.trim(),
      ...(filters.category === "all" ? {} : { categoryId: filters.category }),
    },
  });
  const parsed = parseMenuItemPage(response.data, filters);
  if (!parsed)
    throw new Error("Palvelin palautti virheellisiä ruokalistatietoja.");
  return parsed;
}
