"use client";
import { getApiErrorMessage } from "@/lib/api-error";
import { isEuroAmount } from "@/lib/money";

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
import useCounterReceipts from "./_hooks/use-counter-receipts";
import {
  readCounterSelection,
  saveCounterSelection,
} from "./_lib/counter-selection";

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
import CartSidebar from "./_components/cart-sidebar";
import CheckoutModal from "@/components/payments/checkout-modal";
import CounterOrderCheckout from "./_components/counter-order-checkout";
import CustomizationModal from "./_components/customization-modal";
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
  getApiErrorMessage(
    error,
    "Toimintoa ei voitu suorittaa. Tarkista tilauksen nykyinen sisältö.",
  );

// Renders the POS sale page interface.
// EN: Section — Counter POS page.
// FI: Osio — Kassan sivu.
export default function CounterSalePage() {
  // EN: Section — Page state and request references.
  // FI: Osio — Sivun tila ja pyyntöviitteet.
  const [foods, setFoods] = useState<Food[]>([]);
  const {
    billUrl,
    closeReceipt,
    receiptKind,
    receiptBillId,
    receiptBusy,
    setReceiptBusy,
    showReceipt,
    printBillAfterPay,
    printPaidSentOrder,
  } = useCounterReceipts();
  const [checkoutBusy, setCheckoutBusy] = useState(false);
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
      toast.error(
        kind === "load"
          ? "Tietoja ei voitu ladata"
          : "Toimintoa ei voitu suorittaa",
        {
          description: errorMessage(error),
        },
      );
    },
    [],
  );
  const legacyCart = usePosCart({ checkoutBusy, onError: showCartError });
  const { table, setTable } = legacyCart;
  const draftScope: DraftScope =
    serviceType === "TAKEAWAY" ? "TAKEAWAY" : table;
  const draftCart = useCounterDraft(draftScope, showCartError, foods);
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
    !activeCartLoaded;
  // EN: Missing prices block payment, while draft edits remain available to remove stale products.
  // FI: Puuttuvat hinnat estävät maksun, mutta luonnosta voi muokata vanhentuneiden tuotteiden poistamiseksi.
  const draftUnpriced = draftMode && !draftCart.quoteReady;
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
    // EN: Recover the saved request even if today's catalog can no longer price its products.
    // FI: Palauta tallennettu pyyntö, vaikka nykyinen ruokalista ei enää voisi hinnoitella sen tuotteita.
    cartBusy,
    checkoutBusy,
    setCheckoutBusy,
    receiptBusy,
    refreshCart,
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
  const draftMutationBusy =
    cartBusy || draftLocked || (draftMode && draftCart.loadFailed);
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
  }, [checkoutBusy, draftScope]);

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
      toast.error("Tietoja ei voitu ladata", {
        description: errorMessage(e),
      });
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = readCounterSelection();
      if (saved) {
        setTable(saved.table);
        setServiceType(saved.serviceType);
      }
      void getFoods();
      // EN: Keep keyboard entry focused without scrolling past the cashier navigation on mobile.
      // FI: Kohdista näppäimistösyöte vierittämättä mobiilissa kassan navigoinnin ohi.
      tableNumberInputRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [setTable]);
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
      toast.error("Toimintoa ei voitu suorittaa", {
        description: errorMessage(e),
      });
    }
  };
  // Removes or clears sale temp detail using the existing workflow.
  const removeSaleTempDetail = async (id: number) => {
    if (cartBusy || checkoutBusy || draftLocked) return;
    try {
      const confirmed = await requestConfirmation({
        title: "Poistetaanko tuote?",
        description: "Tuote poistetaan nykyisestä tilauksesta.",
        confirmLabel: "Poista tuote",
        destructive: true,
      });
      if (confirmed) {
        await removeItem(id);
      }
    } catch (e: unknown) {
      toast.error("Toimintoa ei voitu suorittaa", {
        description: errorMessage(e),
      });
    }
  };
  // Removes or clears all sale temp detail using the existing workflow.
  const removeAllSaleTempDetail = async () => {
    if (cartBusy || checkoutBusy || draftLocked) return;
    try {
      const confirmed = await requestConfirmation({
        title: "Tyhjennetäänkö tilaus?",
        description: "Kaikki tuotteet poistetaan nykyisestä tilauksesta.",
        confirmLabel: "Tyhjennä tilaus",
        destructive: true,
      });
      if (confirmed) {
        await clearCart();
      }
    } catch (e: unknown) {
      toast.error("Toimintoa ei voitu suorittaa", {
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
  // Coordinates print bill before pay behavior for this module.
  const printBillBeforePay = async () => {
    if (receiptBusy || checkoutBusy || cartBusy || draftUnpriced) return;
    try {
      setReceiptBusy(true);
      await showReceipt(
        draftMode ? "/counterOrder/prebill" : "/saleTemp/printBillBeforePay",
        draftMode ? draftCart.getIntent() : { tableNo: table },
        "prebill",
      );
    } catch (error) {
      toast.error("Esilaskua ei voitu avata", {
        description: getApiErrorMessage(
          error,
          "Yritä avata esilasku uudelleen.",
        ),
      });
    } finally {
      setReceiptBusy(false);
    }
  };

  // EN: Section — Payment preparation and checkout.
  // FI: Osio — Maksun valmistelu ja maksaminen.
  // Coordinates prepare payment while preserving transaction behavior.
  // EN: Section — Table and service type selection.
  // FI: Osio — Pöydän ja palvelutyypin valinta.
  // Handles table change events and preserves existing side effects.
  const handleTableChange = (
    value: string,
    selectedServiceType = serviceType,
  ) => {
    resetPayment();

    setTable(Number(value));
    saveCounterSelection({
      table: Number(value),
      serviceType: selectedServiceType,
    });
    setDraftPending(readDraftAttempt(Number(value)));
  };

  const handleServiceTypeChange = (next: "DINE_IN" | "TAKEAWAY") => {
    if (next === serviceType || checkoutBusy || receiptBusy) return;
    resetPayment();
    setPayableOrder(null);

    setServiceType(next);
    saveCounterSelection({ table, serviceType: next });
    setDraftPending(readDraftAttempt(next === "TAKEAWAY" ? "TAKEAWAY" : table));
  };

  // EN: Section — Receipt reprint and preview cleanup.
  // FI: Osio — Kuitin uudelleentulostus ja esikatselun siivous.
  // Manages reprint last bill while preserving cleanup behavior.
  const reprintLastBill = async () => {
    if (!lastCompletedBillId || receiptBusy || checkoutBusy) return;
    try {
      await printBillAfterPay(lastCompletedBillId);
    } catch (error) {
      toast.error("Kuittia ei voitu avata", {
        description: getApiErrorMessage(error, "Yritä avata kuitti uudelleen."),
      });
    }
  };

  // EN: Section — Page layout and dialogs.
  // FI: Osio — Sivun asettelu ja valintaikkunat.
  return (
    <div className="counter-pos min-h-dvh bg-canvas font-sans text-foreground md:grid md:min-h-[calc(100dvh-100px)] md:grid-cols-[minmax(0,1fr)_320px] xl:min-h-[calc(100dvh-116px)] xl:grid-cols-[minmax(0,1fr)_400px]">
      <section className="min-w-0 bg-canvas">
        <CounterCatalogToolbar
          availableCount={visibleFoods.length}
          searchQuery={searchQuery}
          activeFilter={activeFilter}
          filtersDisabled={checkoutBusy || receiptBusy}
          onSearchChange={setSearchQuery}
          onFilterChange={(value) => void filterFood(value)}
        />
        <div className="@container p-7">
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

      {/* EN: Reserve the workspace tabs' height so totals and payment remain reachable below the cart. */}
      {/* FI: Varaa työtilan välilehtien korkeus, jotta summat ja maksu pysyvät saavutettavina ostoskorin alapuolella. */}
      <aside className="flex min-h-[520px] flex-col bg-surface px-7 py-7 md:sticky md:top-0 md:h-[calc(100dvh-100px)] md:min-h-0 md:overflow-y-auto xl:h-[calc(100dvh-116px)]">
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
        {draftPending && (
          <p
            role="status"
            className="mt-4 rounded-md border border-border p-3 text-sm"
          >
            {draftPending.kind === "kitchen"
              ? "Luonnos on lukittu aiemman keittiölähetyksen epäselvän tuloksen vuoksi. Valitse Tarkista aiempi lähetys."
              : "Luonnos on lukittu aiemman maksun epäselvän tuloksen vuoksi. Valitse Tarkista aiempi maksu ja yritä uudelleen alkuperäisillä maksutiedoilla."}
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
                    handleTableChange(String(scope), "DINE_IN");
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
              className="min-h-11 xl:min-h-0 [@media(any-pointer:coarse)]:min-h-11"
            >
              Paikan päällä
            </Button>
            <Button
              type="button"
              variant={serviceType === "TAKEAWAY" ? "default" : "outline"}
              aria-pressed={serviceType === "TAKEAWAY"}
              disabled={checkoutBusy || receiptBusy}
              onClick={() => handleServiceTypeChange("TAKEAWAY")}
              className="min-h-11 xl:min-h-0 [@media(any-pointer:coarse)]:min-h-11"
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
          (draftCart.loadFailed || draftCart.quoteError) ? (
            <div
              role="alert"
              className="mb-4 rounded-md border border-destructive p-3 text-sm"
            >
              <p>
                {draftCart.quoteError ??
                  "Tallennettua luonnosta ei voitu ladata. Yritä uudelleen tai tyhjennä luonnos."}{" "}
                {!draftCart.loadFailed && !draftLocked && (
                  <>
                    Voit lisätä ja poistaa tuotteita. Maksaminen edellyttää
                    vahvistettua hintaa.
                  </>
                )}
                {draftLocked && (
                  <>
                    {" "}
                    Tarkista aiemman pyynnön tulos ennen tuotteiden
                    muokkaamista.
                  </>
                )}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={checkoutBusy || cartBusy || draftLocked}
                  onClick={() => void draftCart.refreshCart()}
                  className="min-h-11 xl:min-h-0 [@media(any-pointer:coarse)]:min-h-11"
                >
                  Retry quote
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={checkoutBusy || cartBusy || draftLocked}
                  className="min-h-11 xl:min-h-0 [@media(any-pointer:coarse)]:min-h-11"
                  onClick={async () => {
                    const confirmed = await requestConfirmation({
                      title: "Tyhjennetäänkö tallennettu luonnos?",
                      description:
                        "Lähettämättömät tuotteet poistetaan tältä laitteelta.",
                      confirmLabel: "Tyhjennä luonnos",
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
              aria-label="Tyhjennä"
              disabled={
                saleTemps.length === 0 ||
                draftMutationBusy ||
                checkoutBusy ||
                receiptBusy
              }
              onClick={() => void removeAllSaleTempDetail()}
              className="min-h-11 text-destructive hover:text-destructive xl:min-h-0 [@media(any-pointer:coarse)]:min-h-11"
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
              unpriced={draftUnpriced}
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
              {draftUnpriced && draftCart.units.length > 0 ? (
                "—"
              ) : (
                <>
                  {summary.total.toLocaleString("fi-FI", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  €
                </>
              )}
            </strong>
          </div>
          {summary.total > 0 ||
          (draftPending && draftPending.kind !== "kitchen") ? (
            <>
              <Button
                type="button"
                size="lg"
                disabled={
                  checkoutBusy ||
                  receiptBusy ||
                  (cartBusy && !draftPending) ||
                  (draftUnpriced && !draftPending) ||
                  invalidDraftAttempt ||
                  (draftMode && draftPending?.kind === "kitchen")
                }
                onClick={() => {
                  preparePayment();
                  setCheckoutOpen(true);
                }}
                className="mt-6 w-full"
              >
                {draftPending && draftPending.kind !== "kitchen"
                  ? "Tarkista aiempi maksu"
                  : "Maksa ja lähetä keittiöön"}{" "}
                <ChevronRight aria-hidden="true" />
              </Button>
            </>
          ) : null}
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
          <details className="mt-3">
            <summary className="cursor-pointer rounded-md p-2 text-sm focus-visible:outline-2 focus-visible:outline-ring">
              Kuitit ja esilasku
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label="Tulosta esilasku"
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
              ) : null}
            </div>
          </details>
        </div>
      </aside>

      <CustomizationModal
        open={customizationOpen}
        onOpenChange={setCustomizationOpen}
        saleTempId={saleTempId}
        saleTempDetails={saleTempDetails}
        tastes={tastes}
        sizes={sizes}
        // EN: Draft edits persist immediately and wait for a quote; keep the dialog locked until that request settles.
        // FI: Luonnosmuutokset tallentuvat heti ja odottavat hinnoittelua; pidä ikkuna lukittuna pyynnön päättymiseen asti.
        customizationBusy={customizationBusy || (draftMode && cartBusy)}
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
        <button type="button" aria-label="Lisää" className="sr-only" disabled />
      ) : null}
      {payableOrder ? (
        <CounterOrderCheckout
          key={payableOrder.id}
          order={payableOrder}
          onClose={() => setPayableOrder(null)}
          onBusyChange={setCheckoutBusy}
          onPaid={async (billId) => {
            setPayableOrder(null);
            setLastCompletedBillId(billId);
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
            isEuroAmount(nextAmount) && nextAmount >= 0 ? nextAmount : 0,
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
              Peruuta
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
