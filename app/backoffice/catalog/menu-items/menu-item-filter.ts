import type { Food } from "@/lib/catalog-contracts";

export function filterMenuItems(
  foods: Food[],
  category: "all" | number,
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("fi-FI");

  return foods.filter(
    (food) =>
      (category === "all" || food.FoodType.id === category) &&
      (!normalizedQuery ||
        food.name.toLocaleLowerCase("fi-FI").includes(normalizedQuery) ||
        food.remark.toLocaleLowerCase("fi-FI").includes(normalizedQuery) ||
        food.FoodType.name
          .toLocaleLowerCase("fi-FI")
          .includes(normalizedQuery)),
  );
}
