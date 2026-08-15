import { redirect } from "next/navigation";

export default function FoodLegacyRoute() {
  redirect("/backoffice/catalog/menu-items");
}
