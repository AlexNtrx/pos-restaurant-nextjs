import MyModal from "../../components/mymodal";

type CheckoutModalProps = {
  total: number;
  payType: "cash" | "bank";
  receivedAmount: number;
  checkoutBusy: boolean;
  receiptBusy: boolean;
  onSelectPaymentType: (payType: "cash" | "bank") => void;
  onChangeReceivedAmount: (amount: number) => void;
  onReceivedAmountInput: (value: string) => void;
  onCompletePayment: () => void;
  // Coordinates checkout modal while preserving transaction behavior.
};

// Coordinates checkout modal while preserving transaction behavior.
export default function CheckoutModal({
  total,
  payType,
  receivedAmount,
  checkoutBusy,
  receiptBusy,
  onSelectPaymentType,
  onChangeReceivedAmount,
  onReceivedAmountInput,
  onCompletePayment,
}: CheckoutModalProps) {
  return (
    <MyModal id="modalSale" title="Checkout" modalSize="modal-lg">
      <div className="fw-bold">Payment Method</div>
      <div className="row mt-1">
        <div className="col-md-6">
          <button
            disabled={checkoutBusy}
            className={
              payType === "cash"
                ? "btn btn-success btn-block btn-lg"
                : "btn btn-outline-secondary btn-block btn-lg"
            }
            onClick={() => onSelectPaymentType("cash")}
          >
            <span className="h3">Cash</span>
          </button>
        </div>
        <div className="col-md-6">
          <button
            disabled={checkoutBusy}
            className={
              payType === "bank"
                ? "btn btn-success btn-block btn-lg"
                : "btn btn-outline-secondary btn-block btn-lg"
            }
            onClick={() => onSelectPaymentType("bank")}
          >
            <span className="h3">Bank Transfer</span>
          </button>
        </div>
      </div>
      <div className="mt-3 fw-bold">Total</div>
      <div className="h1">
        <input
          type="text"
          className="form-control text-end fs-4 p-4"
          value={total.toLocaleString("th-Th")}
          disabled
        />
      </div>
      <div className="mt-3 fw-bold">Amount Received</div>
      <div className="row mt-1">
        {[10, 20, 50, 100].map((amount) => (
          <div className="col-md-3" key={amount}>
            <button
              disabled={checkoutBusy || payType !== "cash"}
              className="btn btn-outline-secondary btn-block btn-lg"
              onClick={() => onChangeReceivedAmount(receivedAmount + amount)}
            >
              <span className="h3">{amount}</span>
            </button>
          </div>
        ))}
      </div>
      <input
        type="number"
        min="0"
        step="1"
        className="form-control text-end fs-4 p-4 mt-3"
        placeholder="0.00"
        value={receivedAmount}
        disabled={checkoutBusy || payType === "bank"}
        onChange={(event) => onReceivedAmountInput(event.target.value)}
      />
      <div className="mt-3 fw-bold">Change</div>
      <div className="h1">
        <input
          type="text"
          className="form-control text-end fs-4 p-4"
          value={(payType === "bank"
            ? 0
            : receivedAmount - total
          ).toLocaleString("th-Th")}
          disabled
        />
      </div>
      <div className="mt-3">
        <button
          disabled={
            checkoutBusy ||
            receiptBusy ||
            total <= 0 ||
            (payType === "cash" && receivedAmount < total)
          }
          onClick={onCompletePayment}
          className="btn btn-success btn-lg w-100"
        >
          <i className="fa fa-money-bill me-2"></i>
          Complete Payment
        </button>
      </div>
    </MyModal>
  );
}
