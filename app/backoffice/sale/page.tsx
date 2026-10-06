"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Printer, Trash2 } from "lucide-react";
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

import { readStaffCatalog } from "@/lib/catalog-reads";

import useCounterCustomization from "./_hooks/use-counter-customization";
import useCounterSentOrders from "./_hooks/use-counter-sent-orders";

import useCounterCheckout from "./_hooks/use-counter-checkout";
import {
  listPendingCounterPayments,
  type SavedCounterPayment,
} from "@/lib/counter-payment";

import { readDraftAttempt, pendingDraftScopes } from "./_lib/counter-attempt";
import {
  parseFoods,
  type Food,
  type SentCounterOrder,
} from "@/lib/sale-contracts";
import usePosCart from "./_hooks/use-pos-cart";
import useCounterDraft, { type DraftScope } from "./_hooks/use-counter-draft";
import CatalogGrid, { type CatalogStatus } from "./_components/catalog-grid";
import { CounterCatalogToolbar } from "./_components/counter-catalog-toolbar";
import { CounterSentOrdersList } from "./_components/counter-sent-orders-list";
import CartSidebar from "./_components/cart-sidebar";
import CheckoutModal from "@/components/payments/checkout-modal";
import CounterOrderCheckout from "./_components/counter-order-checkout";
import SentOrderDetails from "./_components/sent-order-details";
import QrTableOrders from "./_components/qr-table-orders";
import CustomizationModal from "./_components/customization-modal";
import { useReceiptPreview } from "@/components/receipts/use-receipt-preview";
import ReceiptPreview from "@/components/receipts/receipt-preview";

// EN: Section — Submission types and persisted draft attempts.
// FI: Osio — Lähetystyypit ja tallennetut luonnoksen lähetysyritykset.
// EN: Section — Confirmation types and response helpers.
// FI: Osio — Vahvistustyypit ja vastausten apufunktiot.
type ConfirmationConfig = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
};

// Coordinates error message behavior for this module.
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unexpected error";

// Renders the POS sale page interface.
// EN: Section — Counter POS page.
// FI: Osio — Kassan sivu.
export default function CounterSalePage() {
  // EN: Section — Page state and request references.
  // FI: Osio — Sivun tila ja pyyntöviitteet.
  const [foods, setFoods] = useState<Food[]>([]);
  const {
    url: billUrl,
    load: loadReceipt,
    close: closeReceipt,
  } = useReceiptPreview();
  const [receiptKind, setReceiptKind] = useState<"prebill" | "paid">("paid");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "food" | "drink">(
    "all",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("loading");
  const [pendingCounterPayments, setPendingCounterPayments] = useState<
    SavedCounterPayment[]
  >([]);
  const [pendingPaymentError, setPendingPaymentError] = useState("");
  const [otherPendingScopes, setOtherPendingScopes] = useState<DraftScope[]>(
    [],
  );
  const [serviceType, setServiceType] = useState<"DINE_IN" | "TAKEAWAY">(
    "DINE_IN",
  );
  const [payableOrder, setPayableOrder] = useState<SentCounterOrder | null>(
    null,
  );
  const [receiptBillId, setReceiptBillId] = useState<number | null>(null);
  const tableNumberInputRef = useRef<HTMLInputElement>(null);
  // EN: Only the latest selected filter may publish its result, even when reads are shared.
  // FI: Vain viimeksi valittu suodatin saa näyttää tuloksensa myös jaetuissa hauissa.
  const catalogRequestId = useRef(0);

  const confirmationResolverRef = useRef<((confirmed: boolean) => void) | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState<ConfirmationConfig | null>(
    null,
  );
  // EN: Section — Catalog search and active cart coordination.
  // FI: Osio — Ruokalistan haku ja aktiivisen ostoskorin hallinta.
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
  const legacyCart = usePosCart({ checkoutBusy, onError: showCartError });
  const { table, setTable } = legacyCart;
  const draftScope: DraftScope =
    serviceType === "TAKEAWAY" ? "TAKEAWAY" : table;
  const draftCart = useCounterDraft(draftScope, showCartError);
  const {
    sentOrders,
    sentView,
    selectedSentOrderId,
    sentOrderDetail,
    sentOrderError,
    sentOrderCancelling,
    refreshSentOrders,
    loadSentOrderDetail,
    closeSentOrderDetail,
    cancelSentOrder,
    invalidateSentOrders,
    setSentOrders,
    setSentView,
  } = useCounterSentOrders(draftScope);
  const draftEnabled = process.env.NEXT_PUBLIC_ORD02_DRAFT_ENABLED !== "false";
  const draftMode =
    serviceType === "TAKEAWAY" ||
    (draftEnabled &&
      (legacyCart.loadedTable !== table || legacyCart.items.length === 0));
  const activeCart = draftMode ? draftCart : legacyCart;
  const activeCartLoaded = draftMode
    ? draftCart.loadedScope === draftScope
    : legacyCart.loadedTable === table;
  const saleTemps = activeCartLoaded ? activeCart.items : [];
  const summary = activeCartLoaded
    ? activeCart.summary
    : { baseAmount: 0, addedAmount: 0, total: 0 };
  const cartBusy =
    activeCart.cartBusy ||
    (serviceType === "DINE_IN" && legacyCart.loadedTable !== table) ||
    !activeCartLoaded ||
    (draftMode && !draftCart.quoteReady);
  const refreshCart = (requestedTable = table) =>
    draftMode
      ? draftCart.refreshCart()
      : legacyCart.refreshCart(requestedTable);
  const addItem = (foodId: number) =>
    draftMode ? draftCart.addItem(foodId) : legacyCart.addItem(foodId);
  const updateQuantity = (id: number, qty: number) =>
    draftMode
      ? draftCart.updateQuantity(id, qty)
      : legacyCart.updateQuantity(id, qty);
  const removeItem = (id: number) =>
    draftMode ? draftCart.removeItem(id) : legacyCart.removeItem(id);
  const clearCart = () =>
    draftMode ? draftCart.clearCart() : legacyCart.clearCart();
  const {
    payType,
    receivedAmount,
    checkoutOpen,
    draftPending,
    invalidDraftAttempt,
    lastCompletedBillId,
    setCheckoutOpen,
    setLastCompletedBillId,
    setDraftPending,
    preparePayment,
    selectPaymentType,
    changeReceivedAmount,
    endSale,
    recoverKitchenAttempt,
    resetPayment,
  } = useCounterCheckout({
    draftScope,
    draftMode,
    draftCart,
    table,
    serviceType,
    summary,
    cartBusy,
    checkoutBusy,
    setCheckoutBusy,
    receiptBusy,
    refreshCart,
    refreshSentOrders,
    requestConfirmation: (...args) => requestConfirmation(...args),
    printBillAfterPay: (...args) => printBillAfterPay(...args),
  });
  const draftLocked = draftPending !== null || invalidDraftAttempt;
  const {
    tastes,
    sizes,
    saleTempDetails,
    saleTempId,
    customizationBusy,
    customizationOpen,
    setCustomizationOpen,
    openModalEdit,
    selectTaste,
    unSelectTaste,
    selectSize,
    createSaleTempDetail,
    removeAllSaleTempDetailModal,
  } = useCounterCustomization({
    checkoutBusy,
    draftLocked,
    draftMode,
    draftCart,
    refreshCart,
  });
  const draftMutationBusy = cartBusy || draftLocked;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setPendingCounterPayments(listPendingCounterPayments());
        setOtherPendingScopes(
          pendingDraftScopes().filter((scope) => scope !== draftScope),
        );
        setPendingPaymentError("");
      } catch {
        setPendingPaymentError(
          "Tallennettua tilausmaksua ei voitu lukea. Tarkista maksun tila ennen uutta yritystä.",
        );
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [sentOrders, checkoutBusy, draftScope]);

  // EN: Section — Sent orders: loading, details, cancellation and polling.
  // FI: Osio — Lähetetyt tilaukset: lataus, tiedot, peruutus ja säännöllinen päivitys.
  // EN: Section — Confirmation dialog coordination.
  // FI: Osio — Vahvistusikkunan hallinta.
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

  // EN: Section — Catalog loading and filtering.
  // FI: Osio — Ruokalistan lataus ja suodatus.
  // Loads foods for the current workflow.
  async function getFoods() {
    const requestId = ++catalogRequestId.current;
    setCatalogStatus("loading");
    try {
      const parsed = await readStaffCatalog("/food/filter/all", (data) =>
        parseFoods((data as { results?: unknown })?.results),
      );
      if (requestId !== catalogRequestId.current) return;
      setFoods(parsed);
      setCatalogStatus("ready");
    } catch (e: unknown) {
      if (requestId !== catalogRequestId.current) return;
      setCatalogStatus("error");
      toast.error("Something went wrong", {
        description: errorMessage(e),
      });
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void getFoods();
      tableNumberInputRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);
  // Coordinates filter food behavior for this module.
  const filterFood = async (foodType: "all" | "food" | "drink") => {
    const requestId = ++catalogRequestId.current;
    try {
      setActiveFilter(foodType);
      setCatalogStatus("loading");
      const parsed = await readStaffCatalog(
        `/food/filter/${foodType}`,
        (data) => parseFoods((data as { results?: unknown })?.results),
      );
      if (requestId !== catalogRequestId.current) return;
      setFoods(parsed);
      setCatalogStatus("ready");
    } catch (e: unknown) {
      if (requestId !== catalogRequestId.current) return;
      setCatalogStatus("error");
      toast.error("Error", {
        description: errorMessage(e),
      });
    }
  };
  // Removes or clears sale temp detail using the existing workflow.
  const removeSaleTempDetail = async (id: number) => {
    if (cartBusy || checkoutBusy || draftLocked) return;
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
    if (cartBusy || checkoutBusy || draftLocked) return;
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
    if (
      cartBusy ||
      checkoutBusy ||
      draftLocked ||
      (serviceType === "DINE_IN" && (!Number.isInteger(table) || table < 1))
    )
      return;
    await addItem(foodId);
  };
  // Updates qty without changing user-visible behavior.
  const updateQty = async (id: number, qty: number) => {
    if (cartBusy || checkoutBusy || draftLocked) return;
    await updateQuantity(id, qty);
  };
  // Coordinates open modal edit behavior for this module.
  // EN: Section — Item customization: sizes, tastes and detail rows.
  // FI: Osio — Tuotteiden muokkaus: koot, maut ja lisätietorivit.
  // EN: Receipt kind comes from the caller; API paths do not reliably distinguish an unpaid pre-bill from a paid receipt.
  // FI: Kuitin tyyppi tulee kutsujalta; API-polut eivät luotettavasti erota maksamatonta esilaskua maksetusta kuitista.
  // EN: Section — Receipt loading and printing.
  // FI: Osio — Kuittien lataus ja tulostus.
  const showReceipt = async (
    path: string,
    payload: Record<string, unknown>,
    kind: "prebill" | "paid",
  ) => {
    await loadReceipt(path, payload);
    setReceiptKind(kind);
    // EN: Reprinting targets the displayed receipt, which may differ from the latest checkout.
    // FI: Uudelleentulostus kohdistuu näytettyyn kuittiin, joka voi poiketa viimeisimmästä maksusta.
    setReceiptBillId(kind === "paid" ? Number(payload.billId) : null);
  };

  // Coordinates print bill before pay behavior for this module.
  const printBillBeforePay = async () => {
    if (receiptBusy || checkoutBusy || cartBusy) return;
    try {
      setReceiptBusy(true);
      await showReceipt(
        draftMode ? "/counterOrder/prebill" : "/saleTemp/printBillBeforePay",
        draftMode ? draftCart.getIntent() : { tableNo: table },
        "prebill",
      );
    } catch {
      toast.error("Esilaskua ei voitu avata", {
        description: "Yritä avata esilasku uudelleen.",
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
      await showReceipt("/saleTemp/printBillAfterPay", { billId }, "paid");
    } finally {
      setReceiptBusy(false);
    }
  };

  const printSentOrder = async (orderId: number) => {
    if (receiptBusy || checkoutBusy || cartBusy) return;
    try {
      setReceiptBusy(true);
      await showReceipt(`/counterOrder/${orderId}/prebill`, {}, "prebill");
    } catch {
      toast.error("Esilaskua ei voitu avata", {
        description: "Yritä avata esilasku uudelleen.",
      });
    } finally {
      setReceiptBusy(false);
    }
  };

  const printPaidSentOrder = async (billId: number) => {
    try {
      await printBillAfterPay(billId);
    } catch {
      toast.error("Kuittia ei voitu avata", {
        description: "Yritä avata kuitti uudelleen.",
      });
    }
  };

  // EN: Section — Payment preparation and checkout.
  // FI: Osio — Maksun valmistelu ja maksaminen.
  // Coordinates prepare payment while preserving transaction behavior.
  // EN: Section — Table and service type selection.
  // FI: Osio — Pöydän ja palvelutyypin valinta.
  // Handles table change events and preserves existing side effects.
  const handleTableChange = (value: string) => {
    invalidateSentOrders();
    closeSentOrderDetail();
    resetPayment();
    setSentOrders([]);
    setSentView("active");

    setTable(Number(value));
    setDraftPending(readDraftAttempt(Number(value)));
  };

  const handleServiceTypeChange = (next: "DINE_IN" | "TAKEAWAY") => {
    if (next === serviceType || checkoutBusy || receiptBusy) return;
    invalidateSentOrders();
    closeSentOrderDetail();
    resetPayment();
    setPayableOrder(null);
    setSentOrders([]);
    setSentView("active");

    setServiceType(next);
    setDraftPending(readDraftAttempt(next === "TAKEAWAY" ? "TAKEAWAY" : table));
  };

  // EN: Section — Receipt reprint and preview cleanup.
  // FI: Osio — Kuitin uudelleentulostus ja esikatselun siivous.
  // Manages reprint last bill while preserving cleanup behavior.
  const reprintLastBill = async () => {
    if (!lastCompletedBillId || receiptBusy || checkoutBusy) return;
    try {
      await printBillAfterPay(lastCompletedBillId);
    } catch {
      toast.error("Kuittia ei voitu avata", {
        description: "Yritä avata kuitti uudelleen.",
      });
    }
  };

  // EN: Section — Page layout and dialogs.
  // FI: Osio — Sivun asettelu ja valintaikkunat.
  return (
    <div className="counter-pos min-h-dvh bg-canvas font-sans text-foreground md:grid md:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_400px]">
      <section className="min-w-0 bg-canvas">
        <CounterCatalogToolbar
          availableCount={visibleFoods.length}
          searchQuery={searchQuery}
          activeFilter={activeFilter}
          filtersDisabled={checkoutBusy || receiptBusy}
          onSearchChange={setSearchQuery}
          onFilterChange={(value) => void filterFood(value)}
        />
        <div className="p-7">
          <CatalogGrid
            key={`${activeFilter}:${searchQuery}`}
            foods={visibleFoods}
            disabled={draftMutationBusy || checkoutBusy}
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
        {(pendingPaymentError || invalidDraftAttempt) && (
          <p role="alert" className="text-destructive">
            {pendingPaymentError ||
              "Tallennettu lähetys on virheellinen. Tarkista sen tila ennen uutta yritystä."}
          </p>
        )}
        {pendingCounterPayments.length > 0 || otherPendingScopes.length > 0 ? (
          <section
            className="space-y-2 rounded-lg border border-border p-4"
            aria-label="Epäselvät maksut ja lähetykset"
          >
            <p>
              Aiemman pyynnön tulos on epäselvä. Tarkista se samoilla tiedoilla
              ennen uutta yritystä.
            </p>
            {pendingCounterPayments.map((saved) => (
              <Button
                key={saved.order.id}
                disabled={checkoutBusy || receiptBusy}
                onClick={() => setPayableOrder(saved.order)}
              >
                Tarkista maksu #{saved.order.id}
              </Button>
            ))}
            {otherPendingScopes.map((scope) => (
              <Button
                key={scope}
                disabled={checkoutBusy || receiptBusy}
                onClick={() => {
                  if (scope === "TAKEAWAY") handleServiceTypeChange("TAKEAWAY");
                  else {
                    handleServiceTypeChange("DINE_IN");
                    handleTableChange(String(scope));
                  }
                }}
              >
                Tarkista{" "}
                {scope === "TAKEAWAY" ? "noutotilaus" : `pöytä P${scope}`}
              </Button>
            ))}
          </section>
        ) : null}
        <div className="mt-5 space-y-2" role="group" aria-label="Tilaustapa">
          <p className="text-xs text-muted-foreground">Tilaustapa</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={serviceType === "DINE_IN" ? "default" : "outline"}
              aria-pressed={serviceType === "DINE_IN"}
              disabled={checkoutBusy || receiptBusy}
              onClick={() => handleServiceTypeChange("DINE_IN")}
            >
              Paikan päällä
            </Button>
            <Button
              type="button"
              variant={serviceType === "TAKEAWAY" ? "default" : "outline"}
              aria-pressed={serviceType === "TAKEAWAY"}
              disabled={checkoutBusy || receiptBusy}
              onClick={() => handleServiceTypeChange("TAKEAWAY")}
            >
              Mukaan
            </Button>
          </div>
        </div>
        {serviceType === "DINE_IN" ? (
          <>
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
              ref={tableNumberInputRef}
              className="mt-1 h-11 border-transparent bg-[#f1efea] font-medium"
            />
          </>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            Noutonumero muodostuu, kun tilaus lähetetään keittiöön tai
            maksetaan.
          </p>
        )}
        <div className="mt-7 flex min-h-0 flex-1 flex-col overflow-y-auto">
          {draftMode &&
          draftCart.loadedScope === draftScope &&
          (draftCart.loadFailed ||
            (draftCart.units.length > 0 && !draftCart.quoteReady)) ? (
            <div
              role="alert"
              className="mb-4 rounded-md border border-destructive p-3 text-sm"
            >
              <p>
                The saved draft could not be priced. Retry or clear it before
                continuing.
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={checkoutBusy}
                  onClick={() => void draftCart.refreshCart()}
                >
                  Retry quote
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={checkoutBusy || draftLocked}
                  onClick={async () => {
                    const confirmed = await requestConfirmation({
                      title: "Clear saved draft?",
                      description:
                        "The unsent items on this device will be removed.",
                      confirmLabel: "Clear draft",
                      destructive: true,
                    });
                    if (confirmed) draftCart.discardDraft();
                  }}
                >
                  Clear draft
                </Button>
              </div>
            </div>
          ) : null}
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
                draftMutationBusy ||
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
              cartBusy={draftMutationBusy}
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
          <CounterSentOrdersList
            sentOrders={sentOrders}
            sentView={sentView}
            checkoutBusy={checkoutBusy}
            receiptBusy={receiptBusy}
            cartBusy={cartBusy}
            onRefresh={() => void refreshSentOrders()}
            onViewChange={(view) => {
              if (view === sentView) return;
              invalidateSentOrders();
              closeSentOrderDetail();
              setPayableOrder(null);
              setSentOrders([]);
              setSentView(view);
            }}
            onOpenOrder={(orderId) => void loadSentOrderDetail(orderId)}
            onPayOrder={setPayableOrder}
            onPrintPrebill={(orderId) => void printSentOrder(orderId)}
            onPrintReceipt={(billId) => void printPaidSentOrder(billId)}
          />
          {serviceType === "DINE_IN" && (
            <QrTableOrders key={table} tableNo={table} />
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
          {summary.total > 0 ||
          (draftPending && draftPending.kind !== "kitchen") ? (
            <>
              <Button
                type="button"
                size="lg"
                aria-label="Pay"
                disabled={
                  checkoutBusy ||
                  receiptBusy ||
                  (cartBusy && !draftPending) ||
                  invalidDraftAttempt ||
                  (draftMode && draftPending?.kind === "kitchen")
                }
                onClick={() => {
                  preparePayment();
                  setCheckoutOpen(true);
                }}
                className="mt-6 w-full"
              >
                Maksa ja lähetä keittiöön <ChevronRight aria-hidden="true" />
              </Button>
              {draftMode && draftPending?.kind === "kitchen" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={checkoutBusy || receiptBusy || cartBusy}
                  onClick={() => void recoverKitchenAttempt()}
                  className="mt-2 w-full"
                >
                  Tarkista aiempi lähetys
                </Button>
              ) : null}
            </>
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
                aria-label={`Tulosta kuitti uudelleen #${lastCompletedBillId}`}
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
        tastes={tastes}
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
      {payableOrder ? (
        <CounterOrderCheckout
          key={payableOrder.id}
          order={payableOrder}
          onClose={() => setPayableOrder(null)}
          onBusyChange={setCheckoutBusy}
          onRefresh={() => refreshSentOrders()}
          onPaid={async (billId) => {
            setPayableOrder(null);
            setLastCompletedBillId(billId);
            await refreshSentOrders();
            try {
              await printBillAfterPay(billId);
            } catch {
              toast.warning("Maksu tallennettu", {
                description: `Kuitti #${billId} tallennettiin. Yritä avata kuitti uudelleen.`,
              });
            }
          }}
        />
      ) : null}
      <SentOrderDetails
        key={selectedSentOrderId ?? "closed"}
        orderId={selectedSentOrderId}
        detail={sentOrderDetail}
        error={sentOrderError}
        cancelling={sentOrderCancelling}
        onClose={closeSentOrderDetail}
        onRetry={() => {
          if (selectedSentOrderId !== null)
            void loadSentOrderDetail(selectedSentOrderId);
        }}
        onCancel={(reason) => void cancelSentOrder(reason)}
      />
      <CheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        total={
          draftPending && draftPending.kind !== "kitchen"
            ? (draftPending.quotedTotal ??
              draftPending.payload.expectedTotal ??
              summary.total)
            : summary.total
        }
        payType={payType}
        receivedAmount={receivedAmount}
        checkoutBusy={checkoutBusy || invalidDraftAttempt}
        receiptBusy={receiptBusy}
        paymentDetailsLocked={draftPending !== null}
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
        lastCompletedBillId={receiptBillId}
        onReprint={() => {
          if (receiptBillId !== null) void printPaidSentOrder(receiptBillId);
        }}
      />
    </div>
  );
}
