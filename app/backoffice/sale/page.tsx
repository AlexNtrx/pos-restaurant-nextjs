"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import api from "@/lib/api";
import {
  parseCheckoutResult,
  parseFoods,
  type Food,
  type FoodSize,
  type SaleTemp,
  type SaleTempDetail,
  type Taste,
} from "@/lib/sale-contracts";
import usePosCart from "./_hooks/use-pos-cart";
import CatalogGrid from "./_components/catalog-grid";
import CartSidebar from "./_components/cart-sidebar";
import CheckoutModal from "./_components/checkout-modal";
import CustomizationModal from "./_components/customization-modal";
import ReceiptPreview from "./_components/receipt-preview";

type CheckoutAttempt = {
  tableNo: number;
  payType: "cash" | "bank";
  inputMoney?: number;
  idempotencyKey: string;
};

// Validates is record before it is used.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

// Coordinates error message behavior for this module.
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unexpected error";

// Renders the POS sale page interface.
export default function Page() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [tasted, setTasted] = useState<Taste[]>([]);
  const [sizes, setSized] = useState<FoodSize[]>([]);
  const [saleTempDetails, setSaleTempDetails] = useState<SaleTempDetail[]>([]);
  const [saleTempId, setSaleTempId] = useState(0);
  const [payType, setPayType] = useState<"cash" | "bank">("cash");
  const [receivedAmount, setReceivedAmount] = useState(0);
  const [billUrl, setBillUrl] = useState("");
  const [customizationBusy, setCustomizationBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [lastCompletedBillId, setLastCompletedBillId] = useState<number | null>(
    null,
  );
  const myRef = useRef<HTMLInputElement>(null);
  const checkoutAttemptRef = useRef<CheckoutAttempt | null>(null);
  const billUrlRef = useRef("");
  const showCartError = useCallback(
    (error: unknown, kind: "load" | "mutation") => {
      Swal.fire({
        title: kind === "load" ? "Something went wrong" : "error",
        text: errorMessage(error),
        icon: "error",
      });
    },
    [],
  );
  const {
    table,
    setTable,
    items: saleTemps,
    summary,
    cartBusy,
    refreshCart,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    // Loads foods for the current workflow.
  } = usePosCart({ checkoutBusy, onError: showCartError });

  // Loads foods for the current workflow.
  async function getFoods() {
    try {
      const res = await api.get("/food/filter/all");
      const parsed = parseFoods(res.data?.results);
      if (!parsed) throw new Error("Invalid food-list response");
      setFoods(parsed);
    } catch (e: unknown) {
      Swal.fire({
        title: "Something went wrong",
        text: errorMessage(e),
        icon: "error",
      });
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void getFoods();
      myRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (billUrlRef.current) URL.revokeObjectURL(billUrlRef.current);
    };
  }, []);
  // Coordinates filter food behavior for this module.
  const filterFood = async (foodType: "all" | "food" | "drink") => {
    try {
      const res = await api.get(`/food/filter/${foodType}`);
      const parsed = parseFoods(res.data?.results);
      if (!parsed) throw new Error("Invalid filtered-food response");
      setFoods(parsed);
    } catch (e: unknown) {
      Swal.fire({
        title: "error",
        text: errorMessage(e),
        icon: "error",
      });
    }
  };
  // Removes or clears sale temp detail using the existing workflow.
  const removeSaleTempDetail = async (id: number) => {
    if (cartBusy || checkoutBusy) return;
    try {
      const button = await Swal.fire({
        title: "Remove this item?",
        icon: "warning",
        showCancelButton: true,
        showConfirmButton: true,
      });
      if (button.isConfirmed) {
        await removeItem(id);
      }
    } catch (e: unknown) {
      Swal.fire({
        title: "error",
        text: errorMessage(e),
        icon: "error",
      });
    }
  };
  // Removes or clears all sale temp detail using the existing workflow.
  const removeAllSaleTempDetail = async () => {
    if (cartBusy || checkoutBusy) return;
    try {
      const button = await Swal.fire({
        title: "Clear this order?",
        icon: "warning",
        showCancelButton: true,
        showConfirmButton: true,
      });
      if (button.isConfirmed) {
        await clearCart();
      }
    } catch (e: unknown) {
      Swal.fire({
        title: "error",
        text: errorMessage(e),
        icon: "error",
      });
    }
  };
  // Coordinates sale behavior for this module.
  const sale = async (foodId: number) => {
    if (cartBusy || checkoutBusy || !Number.isInteger(table) || table < 1)
      return;
    await addItem(foodId);
  };
  // Updates qty without changing user-visible behavior.
  const updateQty = async (id: number, qty: number) => {
    if (cartBusy || checkoutBusy) return;
    await updateQuantity(id, qty);
  };
  // Coordinates open modal edit behavior for this module.
  const openModalEdit = async (item: SaleTemp) => {
    if (customizationBusy || checkoutBusy) return;
    setSaleTempId(item.id);
    setSaleTempDetails([]);
    setTasted([]);
    setSized([]);
    await generateSaleTempDetail(item.id);
  };

  // Loads data sale temp info for the current workflow.
  const fetchDataSaleTempInfo = async (saleTempId: number) => {
    try {
      const res = await api.get("/saleTemp/info/" + saleTempId);
      const result = res.data?.results;
      if (
        !isRecord(result) ||
        !Array.isArray(result.saleTempDetails) ||
        !isRecord(result.Food)
      )
        throw new Error("Invalid customization response");
      const foodType = result.Food.FoodType;
      if (
        !isRecord(foodType) ||
        !Array.isArray(foodType.tastes) ||
        !Array.isArray(foodType.foodSizes)
      )
        throw new Error("Invalid customization options");
      setSaleTempDetails(result.saleTempDetails as SaleTempDetail[]);
      setTasted(foodType.tastes as Taste[]);
      setSized(foodType.foodSizes as FoodSize[]);
    } catch (e: unknown) {
      Swal.fire({
        title: "error",
        text: errorMessage(e),
        icon: "error",
      });
    }
  };
  // Coordinates generate sale temp detail behavior for this module.
  const generateSaleTempDetail = async (saleTempId: number) => {
    try {
      setCustomizationBusy(true);
      const payload = {
        saleTempId: saleTempId,
      };
      await api.post("/saleTemp/generateSaleTempDetail", payload);
      await refreshCart();
      await fetchDataSaleTempInfo(saleTempId);
    } catch (e: unknown) {
      Swal.fire({
        title: "error",
        text: errorMessage(e),
        icon: "error",
      });
    } finally {
      setCustomizationBusy(false);
    }
  };
  // Updates taste without changing user-visible behavior.
  const selectTaste = async (
    tasteId: number,
    saleTempDetailId: number,
    saleTempId: number,
  ) => {
    if (customizationBusy || checkoutBusy) return;
    try {
      setCustomizationBusy(true);
      const payload = {
        saleTempDetailId: saleTempDetailId,
        tasteId: tasteId,
      };
      await api.put("/saleTemp/selectTaste", payload);
      await fetchDataSaleTempInfo(saleTempId);
    } catch (e: unknown) {
      Swal.fire({
        title: "error",
        text: errorMessage(e),
        icon: "error",
      });
    } finally {
      setCustomizationBusy(false);
    }
  };
  // Coordinates un select taste behavior for this module.
  const unSelectTaste = async (
    saleTempDetailId: number,
    saleTempId: number,
  ) => {
    if (customizationBusy || checkoutBusy) return;
    try {
      setCustomizationBusy(true);
      const payload = {
        saleTempDetailId: saleTempDetailId,
      };
      await api.put("/saleTemp/unSelectTaste", payload);
      await fetchDataSaleTempInfo(saleTempId);
    } catch (e: unknown) {
      Swal.fire({
        title: "error",
        text: errorMessage(e),
        icon: "error",
      });
    } finally {
      setCustomizationBusy(false);
    }
  };
  // Updates size without changing user-visible behavior.
  const selectSize = async (
    sizeId: number | null,
    saleTempDetailId: number,
    saleTempId: number,
  ) => {
    if (customizationBusy || checkoutBusy) return;
    try {
      setCustomizationBusy(true);
      const payload = {
        sizeId: sizeId,
        saleTempDetailId: saleTempDetailId,
      };
      await api.put("/saleTemp/selectSize", payload);
      await fetchDataSaleTempInfo(saleTempId);
      await refreshCart();
    } catch (e: unknown) {
      Swal.fire({
        title: "error",
        text: errorMessage(e),
        icon: "error",
      });
    } finally {
      setCustomizationBusy(false);
    }
  };
  // Creates sale temp detail with the current contract.
  const createSaleTempDetail = async () => {
    if (customizationBusy || checkoutBusy) return;
    try {
      setCustomizationBusy(true);
      const payload = {
        saleTempId: saleTempId,
      };
      await api.post("/saleTemp/createSaleTempDetail", payload);
      await refreshCart();
      await fetchDataSaleTempInfo(saleTempId);
    } catch (e: unknown) {
      Swal.fire({
        title: "error",
        text: errorMessage(e),
        icon: "error",
      });
    } finally {
      setCustomizationBusy(false);
    }
  };
  // Removes or clears all sale temp detail modal using the existing workflow.
  const removeAllSaleTempDetailModal = async (saleTempDetailId: number) => {
    if (customizationBusy || checkoutBusy) return;
    try {
      setCustomizationBusy(true);
      const payload = {
        saleTempDetailId: saleTempDetailId,
      };
      await api.delete("/saleTemp/removeSaleTempDetailModal", {
        data: payload,
      });
      await refreshCart();
      if (saleTempDetails.length === 1) {
        document.getElementById("modalEdit_btnClose")?.click();
        setSaleTempDetails([]);
        setSaleTempId(0);
      } else {
        await fetchDataSaleTempInfo(saleTempId);
      }
    } catch (e: unknown) {
      Swal.fire({
        title: "error",
        text: errorMessage(e),
        icon: "error",
      });
    } finally {
      setCustomizationBusy(false);
    }
  };
  // Manages show receipt while preserving cleanup behavior.
  const showReceipt = async (path: string, payload: Record<string, number>) => {
    const res = await api.post(path, payload, { responseType: "blob" });
    const contentType = String(res.headers["content-type"] || "");
    if (
      !contentType.includes("application/pdf") ||
      !(res.data instanceof Blob)
    ) {
      throw new Error("Invalid receipt response");
    }

    const nextUrl = URL.createObjectURL(res.data);
    if (billUrlRef.current) URL.revokeObjectURL(billUrlRef.current);
    billUrlRef.current = nextUrl;
    setBillUrl(nextUrl);
    window.requestAnimationFrame(() => {
      document.getElementById("btnPrint")?.click();
    });
  };

  // Coordinates print bill before pay behavior for this module.
  const printBillBeforePay = async () => {
    if (receiptBusy || checkoutBusy) return;
    try {
      setReceiptBusy(true);
      await showReceipt("/saleTemp/printBillBeforePay", { tableNo: table });
    } catch (e: unknown) {
      await Swal.fire({
        title: "Receipt unavailable",
        text: errorMessage(e),
        icon: "error",
      });
    } finally {
      setReceiptBusy(false);
    }
  };

  // Coordinates print bill after pay behavior for this module.
  const printBillAfterPay = async (billId: number) => {
    if (receiptBusy) return;
    try {
      setReceiptBusy(true);
      await showReceipt("/saleTemp/printBillAfterPay", { billId });
    } finally {
      setReceiptBusy(false);
    }
  };

  // Coordinates prepare payment while preserving transaction behavior.
  const preparePayment = () => {
    const pendingAttempt = checkoutAttemptRef.current;
    if (pendingAttempt?.tableNo === table) {
      setPayType(pendingAttempt.payType);
      setReceivedAmount(
        pendingAttempt.payType === "bank"
          ? summary.total
          : (pendingAttempt.inputMoney ?? 0),
      );
      return;
    }
    checkoutAttemptRef.current = null;
    setPayType("cash");
    setReceivedAmount(0);
  };

  // Coordinates select payment type while preserving transaction behavior.
  const selectPaymentType = (nextType: "cash" | "bank") => {
    checkoutAttemptRef.current = null;
    setPayType(nextType);
    setReceivedAmount(nextType === "bank" ? summary.total : 0);
  };

  // Updates received amount without changing user-visible behavior.
  const changeReceivedAmount = (nextAmount: number) => {
    checkoutAttemptRef.current = null;
    setReceivedAmount(nextAmount);
  };

  // Coordinates end sale behavior for this module.
  const endSale = async () => {
    if (checkoutBusy || receiptBusy) return;
    setCheckoutBusy(true);
    try {
      let payload = checkoutAttemptRef.current;
      if (!payload) {
        const refreshedCart = await refreshCart();
        if (!refreshedCart || refreshedCart.summary.total <= 0) return;

        const button = await Swal.fire({
          title: "Confirm payment",
          text: `Server total: ${refreshedCart.summary.total.toLocaleString("th-TH")}`,
          icon: "warning",
          showCancelButton: true,
          showConfirmButton: true,
        });
        if (!button.isConfirmed) return;

        const idempotencyKey = crypto.randomUUID();
        payload = {
          tableNo: table,
          payType,
          idempotencyKey,
          ...(payType === "cash" ? { inputMoney: receivedAmount } : {}),
        };
        checkoutAttemptRef.current = payload;
      }
      const res = await api.post("/saleTemp/endSale", payload);
      const completed = parseCheckoutResult(res.data);
      if (!completed) throw new Error("Invalid checkout response");

      checkoutAttemptRef.current = null;
      setLastCompletedBillId(completed.billId);
      setReceivedAmount(0);
      document.getElementById("modalSale_btnClose")?.click();
      await refreshCart();

      try {
        await printBillAfterPay(completed.billId);
      } catch (receiptError: unknown) {
        await Swal.fire({
          title: "Sale completed",
          text: `Bill ${completed.billId} was saved, but the receipt could not be opened: ${errorMessage(receiptError)}`,
          icon: "warning",
        });
      }
    } catch (e: unknown) {
      if (isRecord(e) && "response" in e) {
        checkoutAttemptRef.current = null;
      }
      await Swal.fire({
        title: "Checkout failed",
        text: errorMessage(e),
        icon: "error",
      });
    } finally {
      setCheckoutBusy(false);
    }
  };

  // Handles table change events and preserves existing side effects.
  const handleTableChange = (value: string) => {
    checkoutAttemptRef.current = null;
    setReceivedAmount(0);
    setPayType("cash");
    setTable(Number(value));
  };

  // Manages reprint last bill while preserving cleanup behavior.
  const reprintLastBill = async () => {
    if (!lastCompletedBillId || receiptBusy || checkoutBusy) return;
    try {
      await printBillAfterPay(lastCompletedBillId);
    } catch (e: unknown) {
      await Swal.fire({
        title: "Receipt unavailable",
        text: errorMessage(e),
        icon: "error",
      });
    }
  };

  return (
    <>
      <div className="card mt-3">
        <div className="card-header">New Order</div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-3">
              <div className="input-group">
                <div className="input-group-text">Table Number</div>
                <input
                  type="text"
                  className="form-control"
                  value={table}
                  onChange={(e) => handleTableChange(e.target.value)}
                  disabled={checkoutBusy || receiptBusy}
                  ref={myRef}
                />
              </div>
            </div>

            <div className="col-md-9">
              <button
                disabled={checkoutBusy || receiptBusy}
                className="btn btn-primary me-1"
                onClick={() => filterFood("food")}
              >
                <i className="fa fa-hamburger me-2"></i>Food
              </button>
              <button
                disabled={checkoutBusy || receiptBusy}
                className="btn btn-primary me-1"
                onClick={() => filterFood("drink")}
              >
                <i className="fa fa-coffee me-2"></i>
                Drinks
              </button>
              <button
                disabled={checkoutBusy || receiptBusy}
                className="btn btn-primary me-1"
                onClick={() => filterFood("all")}
              >
                <i className="fa fa-list me-2"></i>
                All Items
              </button>
              <button
                disabled={
                  saleTemps.length === 0 ||
                  cartBusy ||
                  checkoutBusy ||
                  receiptBusy
                }
                className="btn btn-danger"
                onClick={() => removeAllSaleTempDetail()}
              >
                <i className="fa fa-times me-2"></i>
                Clear
              </button>
              {summary.total > 0 ? (
                <button
                  disabled={checkoutBusy || receiptBusy}
                  className="btn btn-success ms-1"
                  onClick={() => void printBillBeforePay()}
                >
                  <i className="fa fa-print me-2"></i>
                  Print Pre-bill
                </button>
              ) : (
                <></>
              )}
              {lastCompletedBillId ? (
                <button
                  disabled={checkoutBusy || receiptBusy}
                  className="btn btn-outline-success ms-1"
                  onClick={() => void reprintLastBill()}
                >
                  Reprint Receipt #{lastCompletedBillId}
                </button>
              ) : null}
            </div>
          </div>
          <div className="row mt-3">
            <div className="col-md-9">
              <CatalogGrid
                foods={foods}
                disabled={cartBusy || checkoutBusy}
                onSelect={(foodId) => void sale(foodId)}
              />
            </div>
            <div className="col-md-3">
              <div className="alert p-3 text-end h1 text-white bg-dark">
                {summary.total.toLocaleString("th-TH")}
              </div>
              {summary.total > 0 ? (
                <button
                  disabled={checkoutBusy || receiptBusy}
                  className="btn btn-success btn-lg w-100 mb-2"
                  data-bs-toggle="modal"
                  data-bs-target="#modalSale"
                  onClick={preparePayment}
                >
                  <i className="fa fa-money-bill me-2"></i>
                  Pay
                </button>
              ) : (
                <></>
              )}
              <CartSidebar
                items={saleTemps}
                cartBusy={cartBusy}
                customizationBusy={customizationBusy}
                checkoutBusy={checkoutBusy}
                onQuantityChange={(id, quantity) =>
                  void updateQty(id, quantity)
                }
                onRemove={(id) => void removeSaleTempDetail(id)}
                onCustomize={(item) => void openModalEdit(item)}
              />
            </div>
          </div>
        </div>
      </div>
      <CustomizationModal
        saleTempId={saleTempId}
        saleTempDetails={saleTempDetails}
        tastes={tasted}
        sizes={sizes}
        customizationBusy={customizationBusy}
        checkoutBusy={checkoutBusy}
        onCreateDetail={() => void createSaleTempDetail()}
        onRemoveDetail={(saleTempDetailId) =>
          void removeAllSaleTempDetailModal(saleTempDetailId)
        }
        onSelectTaste={(tasteId, saleTempDetailId, itemSaleTempId) =>
          void selectTaste(tasteId, saleTempDetailId, itemSaleTempId)
        }
        onUnselectTaste={(saleTempDetailId, itemSaleTempId) =>
          void unSelectTaste(saleTempDetailId, itemSaleTempId)
        }
        onSelectSize={(sizeId, saleTempDetailId, itemSaleTempId) =>
          void selectSize(sizeId, saleTempDetailId, itemSaleTempId)
        }
      />
      <CheckoutModal
        total={summary.total}
        payType={payType}
        receivedAmount={receivedAmount}
        checkoutBusy={checkoutBusy}
        receiptBusy={receiptBusy}
        onSelectPaymentType={selectPaymentType}
        onChangeReceivedAmount={changeReceivedAmount}
        onReceivedAmountInput={(value) => {
          const nextAmount = Number(value);
          changeReceivedAmount(
            Number.isSafeInteger(nextAmount) && nextAmount >= 0
              ? nextAmount
              : 0,
          );
        }}
        onCompletePayment={() => void endSale()}
      />
      <ReceiptPreview billUrl={billUrl} />
    </>
  );
}
