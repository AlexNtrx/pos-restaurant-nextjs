import type { FoodSize, SaleTempDetail, Taste } from "@/lib/sale-contracts";
import MyModal from "../../components/mymodal";

type CustomizationModalProps = {
  saleTempId: number;
  saleTempDetails: SaleTempDetail[];
  tastes: Taste[];
  sizes: FoodSize[];
  customizationBusy: boolean;
  checkoutBusy: boolean;
  onCreateDetail: () => void;
  onRemoveDetail: (saleTempDetailId: number) => void;
  onSelectTaste: (
    tasteId: number,
    saleTempDetailId: number,
    saleTempId: number,
  ) => void;
  onUnselectTaste: (saleTempDetailId: number, saleTempId: number) => void;
  onSelectSize: (
    sizeId: number | null,
    saleTempDetailId: number,
    saleTempId: number,
  ) => void;
  // Renders the customization modal interface.
};

// Renders the customization modal interface.
export default function CustomizationModal({
  saleTempId,
  saleTempDetails,
  tastes,
  sizes,
  customizationBusy,
  checkoutBusy,
  onCreateDetail,
  onRemoveDetail,
  onSelectTaste,
  onUnselectTaste,
  onSelectSize,
}: CustomizationModalProps) {
  return (
    <MyModal id="modalEdit" title="Customize Order Item" modalSize="modal-xl">
      <div>
        <button
          disabled={customizationBusy || saleTempId === 0}
          className="btn btn-primary"
          onClick={onCreateDetail}
        >
          <i className="fa fa-plus me-2">Add</i>
        </button>
      </div>
      <table className="table table-bordered mt-3">
        <thead>
          <tr>
            <th style={{ width: "60px" }}></th>
            <th>Name</th>
            <th style={{ width: "300px" }}>Modifiers</th>
            <th style={{ width: "450px" }}>Size Options</th>
          </tr>
        </thead>
        <tbody>
          {saleTempDetails.map((item) => (
            <tr key={item.id}>
              <td className="text-center">
                <button
                  disabled={customizationBusy}
                  className="btn btn-danger"
                  onClick={() => onRemoveDetail(item.id)}
                >
                  <i className="fa fa-times"></i>
                </button>
              </td>
              <td>{item.Food.name}</td>
              <td className="text-center">
                {tastes.map((taste) => {
                  const isSelected = item.tasteId === taste.id;

                  return (
                    <button
                      disabled={customizationBusy}
                      key={taste.id}
                      onClick={() =>
                        isSelected
                          ? onUnselectTaste(item.id, item.saleTempId)
                          : onSelectTaste(taste.id, item.id, item.saleTempId)
                      }
                      className={`btn me-1 ${isSelected ? "btn-danger" : "btn-outline-danger"}`}
                    >
                      {taste.name}
                    </button>
                  );
                })}
              </td>
              <td className="text-center">
                {sizes
                  .filter((size) => size.moneyAdded >= 0)
                  .map((size) => {
                    const isSelected = item.foodSizeId === size.id;
                    return (
                      <button
                        key={size.id}
                        disabled={customizationBusy || checkoutBusy}
                        onClick={() =>
                          onSelectSize(
                            isSelected ? null : size.id,
                            item.id,
                            item.saleTempId,
                          )
                        }
                        className={`btn me-1 ${isSelected ? "btn-success" : "btn-outline-success"}`}
                      >
                        +{size.moneyAdded} {size.name}
                      </button>
                    );
                  })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </MyModal>
  );
}
