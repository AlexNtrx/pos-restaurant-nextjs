import type { SaleTemp } from "@/lib/sale-contracts";

type CartSidebarProps = {
  items: SaleTemp[];
  cartBusy: boolean;
  customizationBusy: boolean;
  checkoutBusy: boolean;
  onQuantityChange: (id: number, quantity: number) => void;
  onRemove: (id: number) => void;
  onCustomize: (item: SaleTemp) => void;
  // Renders the cart sidebar interface.
};

// Renders the cart sidebar interface.
export default function CartSidebar({
  items,
  cartBusy,
  customizationBusy,
  checkoutBusy,
  onQuantityChange,
  onRemove,
  onCustomize,
}: CartSidebarProps) {
  return (
    <>
      {items.map((item) => (
        <div className="d-grid mt-2" key={item.id}>
          <div className="card">
            <div className="card-body">
              <div className="fw-bold">{item.Food.name}</div>
              <div>
                {item.Food.price} x {item.qty} = {item.pricing.total}
              </div>
            </div>
            <div className="mt-1">
              <div className="input-group">
                <button
                  disabled={item.qty <= 1 || cartBusy || checkoutBusy}
                  className="input-group-text btn btn-primary"
                  onClick={() => onQuantityChange(item.id, item.qty - 1)}
                >
                  <i className="fa fa-minus" />
                </button>
                <input
                  type="text"
                  className="form-control text-center fw-bold"
                  value={item.qty}
                  disabled
                />
                <button
                  disabled={cartBusy || checkoutBusy}
                  className="input-group-text btn btn-primary"
                  onClick={() => onQuantityChange(item.id, item.qty + 1)}
                >
                  <i className="fa fa-plus" />
                </button>
              </div>
            </div>
            <div className="card-footer p-1">
              <div className="row g-1">
                <div className="col-md-6">
                  <button
                    disabled={cartBusy || checkoutBusy}
                    className="btn btn-danger btn-blocker"
                    onClick={() => onRemove(item.id)}
                  >
                    <i className="fa fa-times me-2" />
                    Remove
                  </button>
                </div>
                <div className="col-md-6">
                  <button
                    disabled={cartBusy || customizationBusy || checkoutBusy}
                    className="btn btn-success btn-block"
                    data-bs-toggle="modal"
                    data-bs-target="#modalEdit"
                    onClick={() => onCustomize(item)}
                  >
                    <i className="fa fa-cog me-2" />
                    Customize
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
