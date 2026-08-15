"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Printer, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import CatalogGrid, { type CatalogStatus } from "./_components/catalog-grid";
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

type ConfirmationConfig = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
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
  const [receiptKind, setReceiptKind] = useState<"prebill" | "paid">("paid");
  const [customizationBusy, setCustomizationBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "food" | "drink">(
    "all",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("loading");
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [lastCompletedBillId, setLastCompletedBillId] = useState<number | null>(
    null,
  );
  const myRef = useRef<HTMLInputElement>(null);
  const checkoutAttemptRef = useRef<CheckoutAttempt | null>(null);
  const billUrlRef = useRef("");
  const confirmationResolverRef = useRef<((confirmed: boolean) => void) | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState<ConfirmationConfig | null>(
    null,
  );
  const visibleFoods = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("fi-FI");
    return query
      ? foods.filter((food) =>
          food.name.toLocaleLowerCase("fi-FI").includes(query),
        )
      : foods;
  }, [foods, searchQuery]);
  const showCartError = useCallback(
    (error: unknown, kind: "load" | "mutation") => {
      toast.error(kind === "load" ? "Something went wrong" : "Error", {
        description: errorMessage(error),
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

  // EN: Resolves one confirmation at a time without coupling POS mutations to legacy modal APIs.
  // FI: Ratkaisee yhden vahvistuksen kerrallaan sitomatta POS-mutaatioita vanhoihin modaali-API:hin.
  const requestConfirmation = useCallback((config: ConfirmationConfig) => {
    confirmationResolverRef.current?.(false);
    setConfirmation(config);
    return new Promise<boolean>((resolve) => {
      confirmationResolverRef.current = resolve;
    });
  }, []);

  const resolveConfirmation = useCallback((confirmed: boolean) => {
    const resolve = confirmationResolverRef.current;
    confirmationResolverRef.current = null;
    setConfirmation(null);
    resolve?.(confirmed);
  }, []);

  // Loads foods for the current workflow.
  async function getFoods() {
    setCatalogStatus("loading");
    try {
      const res = await api.get("/food/filter/all");
      const parsed = parseFoods(res.data?.results);
      if (!parsed) throw new Error("Invalid food-list response");
      setFoods(parsed);
      setCatalogStatus("ready");
    } catch (e: unknown) {
      setCatalogStatus("error");
      toast.error("Something went wrong", {
        description: errorMessage(e),
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
      setActiveFilter(foodType);
      setCatalogStatus("loading");
      const res = await api.get(`/food/filter/${foodType}`);
      const parsed = parseFoods(res.data?.results);
      if (!parsed) throw new Error("Invalid filtered-food response");
      setFoods(parsed);
      setCatalogStatus("ready");
    } catch (e: unknown) {
      setCatalogStatus("error");
      toast.error("Error", {
        description: errorMessage(e),
      });
    }
  };
  // Removes or clears sale temp detail using the existing workflow.
  const removeSaleTempDetail = async (id: number) => {
    if (cartBusy || checkoutBusy) return;
    try {
      const confirmed = await requestConfirmation({
        title: "Remove this item?",
        description: "The item will be removed from the current order.",
        confirmLabel: "Remove item",
        destructive: true,
      });
      if (confirmed) {
        await removeItem(id);
      }
    } catch (e: unknown) {
      toast.error("Error", {
        description: errorMessage(e),
      });
    }
  };
  // Removes or clears all sale temp detail using the existing workflow.
  const removeAllSaleTempDetail = async () => {
    if (cartBusy || checkoutBusy) return;
    try {
      const confirmed = await requestConfirmation({
        title: "Clear this order?",
        description: "All items will be removed from the current order.",
        confirmLabel: "Clear order",
        destructive: true,
      });
      if (confirmed) {
        await clearCart();
      }
    } catch (e: unknown) {
      toast.error("Error", {
        description: errorMessage(e),
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
    setCustomizationOpen(true);
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
      toast.error("Error", {
        description: errorMessage(e),
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
      toast.error("Error", {
        description: errorMessage(e),
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
      toast.error("Error", {
        description: errorMessage(e),
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
      toast.error("Error", {
        description: errorMessage(e),
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
      toast.error("Error", {
        description: errorMessage(e),
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
      toast.error("Error", {
        description: errorMessage(e),
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
        setCustomizationOpen(false);
        setSaleTempDetails([]);
        setSaleTempId(0);
      } else {
        await fetchDataSaleTempInfo(saleTempId);
      }
    } catch (e: unknown) {
      toast.error("Error", {
        description: errorMessage(e),
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
    setReceiptKind(path.includes("BeforePay") ? "prebill" : "paid");
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
      toast.error("Receipt unavailable", {
        description: errorMessage(e),
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

        const confirmed = await requestConfirmation({
          title: "Confirm payment",
          description: `Server total: ${refreshedCart.summary.total.toLocaleString("th-TH")}`,
          confirmLabel: "Confirm payment",
        });
        if (!confirmed) return;

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
      setCheckoutOpen(false);
      await refreshCart();

      try {
        await printBillAfterPay(completed.billId);
      } catch (receiptError: unknown) {
        toast.warning("Sale completed", {
          description: `Bill ${completed.billId} was saved, but the receipt could not be opened: ${errorMessage(receiptError)}`,
        });
      }
    } catch (e: unknown) {
      if (isRecord(e) && "response" in e) {
        checkoutAttemptRef.current = null;
      }
      toast.error("Checkout failed", {
        description: errorMessage(e),
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
      toast.error("Receipt unavailable", {
        description: errorMessage(e),
      });
    }
  };

  const closeReceipt = () => {
    if (billUrlRef.current) URL.revokeObjectURL(billUrlRef.current);
    billUrlRef.current = "";
    setBillUrl("");
  };

  return (
    <div className="counter-pos min-h-dvh bg-canvas font-sans text-foreground md:grid md:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_400px]">
      <section className="min-w-0 bg-canvas">
        <header className="flex min-h-[76px] flex-col gap-3 bg-surface px-7 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="m-0 text-[22px] leading-7 font-semibold">
              Ruokalista
            </h2>
            <p className="m-0 mt-0.5 text-xs text-muted-foreground">
              {visibleFoods.length} tuotetta saatavilla
            </p>
          </div>
          <label className="relative block lg:w-[274px]">
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <span className="sr-only">Hae tuotetta</span>
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Hae tuotetta"
              className="h-11 border-transparent bg-[#f1efea] pl-10"
            />
          </label>
        </header>
        <div className="border-b border-border/60 px-7 pt-5">
          <div className="flex gap-8 overflow-x-auto">
            {(
              [
                ["all", "Kaikki"],
                ["food", "Ruoat"],
                ["drink", "Juomat"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-label={
                  value === "all"
                    ? "All Items"
                    : value === "food"
                      ? "Food"
                      : "Drinks"
                }
                disabled={checkoutBusy || receiptBusy}
                onClick={() => void filterFood(value)}
                className={`relative h-11 min-w-[76px] shrink-0 text-left text-[13px] font-medium ${activeFilter === value ? "text-olive after:absolute after:inset-x-0 after:top-0 after:h-[3px] after:rounded-full after:bg-[#706f5e]" : "text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-7">
          <CatalogGrid
            foods={visibleFoods}
            disabled={cartBusy || checkoutBusy}
            status={catalogStatus}
            emptyDescription={
              searchQuery.trim()
                ? "Hakua vastaavia tuotteita ei löytynyt."
                : "Valitussa tuoteryhmässä ei ole tuotteita."
            }
            onRetry={() => void filterFood(activeFilter)}
            onSelect={(foodId) => void sale(foodId)}
          />
        </div>
      </section>

      <aside className="flex min-h-[520px] flex-col bg-surface px-7 py-7 md:sticky md:top-0 md:h-dvh">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-[22px] leading-7 font-semibold">
            Nykyinen tilaus
          </h2>
          <span className="rounded-md bg-muted px-3 py-1 text-[11px] font-medium text-olive">
            KASSA
          </span>
        </div>
        <label
          htmlFor="pos-table"
          className="mt-5 text-xs text-muted-foreground"
        >
          Pöytä
        </label>
        <Input
          id="pos-table"
          type="number"
          min="1"
          step="1"
          value={Number.isFinite(table) ? table : ""}
          onChange={(event) => handleTableChange(event.target.value)}
          disabled={checkoutBusy || receiptBusy}
          ref={myRef}
          className="mt-1 h-11 border-transparent bg-[#f1efea] font-medium"
        />
        <div className="mt-7 flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex items-center justify-between">
            <p className="m-0 text-base font-medium text-muted-foreground">
              Tuotteet ({saleTemps.reduce((sum, item) => sum + item.qty, 0)})
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Clear"
              disabled={
                saleTemps.length === 0 ||
                cartBusy ||
                checkoutBusy ||
                receiptBusy
              }
              onClick={() => void removeAllSaleTempDetail()}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 aria-hidden="true" /> Tyhjennä
            </Button>
          </div>
          {saleTemps.length > 0 ? (
            <CartSidebar
              items={saleTemps}
              cartBusy={cartBusy}
              customizationBusy={customizationBusy}
              checkoutBusy={checkoutBusy}
              onQuantityChange={(id, quantity) => void updateQty(id, quantity)}
              onRemove={(id) => void removeSaleTempDetail(id)}
              onCustomize={(item) => void openModalEdit(item)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center py-12 text-center text-sm text-muted-foreground">
              Valitse tuotteita ruokalistasta.
            </div>
          )}
        </div>
        <div className="border-t border-border pt-5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Välisummaa</span>
            <span>
              {summary.baseAmount.toLocaleString("fi-FI", {
                minimumFractionDigits: 2,
              })}{" "}
              €
            </span>
          </div>
          {summary.addedAmount > 0 ? (
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>Lisävalinnat</span>
              <span>
                {summary.addedAmount.toLocaleString("fi-FI", {
                  minimumFractionDigits: 2,
                })}{" "}
                €
              </span>
            </div>
          ) : null}
          <div className="mt-5 flex items-center justify-between">
            <strong className="text-lg">Maksettava</strong>
            <strong className="text-2xl text-olive" data-testid="cart-total">
              {summary.total.toLocaleString("fi-FI", {
                minimumFractionDigits: 2,
              })}{" "}
              €
            </strong>
          </div>
          {summary.total > 0 ? (
            <Button
              type="button"
              size="lg"
              aria-label="Pay"
              disabled={checkoutBusy || receiptBusy}
              onClick={() => {
                preparePayment();
                setCheckoutOpen(true);
              }}
              className="mt-6 w-full"
            >
              Siirry maksuun <ChevronRight aria-hidden="true" />
            </Button>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label="Print Pre-bill"
              disabled={summary.total <= 0 || checkoutBusy || receiptBusy}
              onClick={() => void printBillBeforePay()}
            >
              <Printer aria-hidden="true" /> Esilasku
            </Button>
            {lastCompletedBillId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Reprint Receipt #${lastCompletedBillId}`}
                disabled={checkoutBusy || receiptBusy}
                onClick={() => void reprintLastBill()}
              >
                Tulosta #{lastCompletedBillId}
              </Button>
            ) : (
              <span />
            )}
          </div>
        </div>
      </aside>

      <CustomizationModal
        open={customizationOpen}
        onOpenChange={setCustomizationOpen}
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
      {!customizationOpen ? (
        <button type="button" aria-label="Add" className="sr-only" disabled />
      ) : null}
      <CheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
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
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) resolveConfirmation(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolveConfirmation(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant={confirmation?.destructive ? "destructive" : "default"}
              onClick={() => resolveConfirmation(true)}
            >
              {confirmation?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ReceiptPreview
        billUrl={billUrl}
        kind={receiptKind}
        onClose={closeReceipt}
        lastCompletedBillId={lastCompletedBillId}
        onReprint={() => void reprintLastBill()}
      />
    </div>
  );
}
