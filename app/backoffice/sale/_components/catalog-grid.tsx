import config from "@/app/config";
import type { Food } from "@/lib/sale-contracts";

type CatalogGridProps = {
  foods: Food[];
  disabled: boolean;
  onSelect: (foodId: number) => void;
  // Renders the catalog grid interface.
};

// Renders the catalog grid interface.
export default function CatalogGrid({
  foods,
  disabled,
  onSelect,
}: CatalogGridProps) {
  return (
    <div className="row g-1">
      {foods.map((food) => (
        <div className="col-md-3 col-lg-3 col-sm-4 col-6" key={food.id}>
          <div className="card">
            <img
              src={config.apiServer + "/uploads/" + food.img}
              alt={food.name}
              className="img-fluid"
              style={{ height: "200px", objectFit: "cover" }}
              onClick={() => !disabled && onSelect(food.id)}
            />
            <div className="card-body">
              <h5>{food.name}</h5>
              <p className="fw-bold text-success h4">{food.price} €</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
