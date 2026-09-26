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
import { readAuthSession } from "@/lib/auth-session";
import {
  parseCheckoutResult,
  parseFoods,
  parsePendingCounterOrders,
  type Food,
  type FoodSize,
  type SaleTemp,
  type SaleTempDetail,
  type PendingCounterOrder,
  type Taste,
} from "@/lib/sale-contracts";
import usePosCart from "./_hooks/use-pos-cart";
import useCounterDraft from "./_hooks/use-counter-draft";
import CatalogGrid, { type CatalogStatus } from "./_components/catalog-grid";
import CartSidebar from "./_components/cart-sidebar";
import CheckoutModal from "./_components/checkout-modal";
import CounterOrderCheckout from "./_components/counter-order-checkout";
import CustomizationModal from "./_components/customization-modal";
import ReceiptPreview from "./_components/receipt-preview";

type CheckoutAttempt = {
  tableNo: number;
  payType: "cash" | "bank";
  inputMoney?: number;
  idempotencyKey: string;
  items?: ReturnType<ReturnType<typeof useCounterDraft>["getIntent"]>["items"];
  expectedTotal?: number;
};
type KitchenAttempt = {
  tableNo: number;
  idempotencyKey: string;
  items?: ReturnType<ReturnType<typeof useCounterDraft>["getIntent"]>["items"];
  expectedTotal?: number;
};
type DraftPendingAttempt =
  | { kind: "checkout"; payload: CheckoutAttempt }
  | { kind: "kitchen"; payload: KitchenAttempt };

const draftAttemptKey = (tableNo: number) => {
  if (typeof window === "undefined") return null;
  const userId = readAuthSession()?.userId;
  return userId ? `counter-draft:v1:${userId}:${tableNo}:attempt` : null;
};
const readDraftAttempt = (tableNo: number): DraftPendingAttempt | null => {
  const key = draftAttemptKey(tableNo);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      !["checkout", "kitchen"].includes(String(parsed.kind)) ||
      !isRecord(parsed.payload) ||
      parsed.payload.tableNo !== tableNo ||
      typeof parsed.payload.idempotencyKey !== "string" ||
      !Array.isArray(parsed.payload.items)
    )
      return null;
    return parsed as DraftPendingAttempt;
  } catch {
    return null;
  }
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
const hasFinalHttpResponse = (error: unknown) => {
  if (!isRecord(error) || !isRecord(error.response)) return false;
  const status = error.response.status;
  return typeof status === "number" && status >= 400 && status < 500;
};

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
  const [draftPending, setDraftPending] = useState<DraftPendingAttempt | null>(
    null,
  );
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "food" | "drink">(
    "all",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("loading");
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<PendingCounterOrder[]>([]);
  const [payableOrder, setPayableOrder] = useState<PendingCounterOrder | null>(
    null,
  );
  const [lastCompletedBillId, setLastCompletedBillId] = useState<number | null>(
    null,
  );
  const myRef = useRef<HTMLInputElement>(null);
  const checkoutAttemptRef = useRef<CheckoutAttempt | null>(null);
  const kitchenAttemptRef = useRef<KitchenAttempt | null>(null);
  const pendingRequestId = useRef(0);
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
  const legacyCart = usePosCart({ checkoutBusy, onError: showCartError });
  const { table, setTable } = legacyCart;
  const draftCart = useCounterDraft(table, showCartError);
  const draftEnabled = process.env.NEXT_PUBLIC_ORD02_DRAFT_ENABLED !== "false";
  const draftMode =
    draftEnabled &&
    (legacyCart.loadedTable !== table || legacyCart.items.length === 0);
  const activeCart = draftMode ? draftCart : legacyCart;
  const saleTemps = activeCart.loadedTable === table ? activeCart.items : [];
  const summary =
    activeCart.loadedTable === table
      ? activeCart.summary
      : { baseAmount: 0, addedAmount: 0, total: 0 };
  const cartBusy =
    activeCart.cartBusy ||
    legacyCart.loadedTable !== table ||
    (draftMode && (draftCart.loadedTable !== table || !draftCart.quoteReady));
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
  const saveDraftAttempt = (attempt: DraftPendingAttempt) => {
    const key = draftAttemptKey(table);
    if (!key) throw new Error("Sign in again before submitting this draft");
    localStorage.setItem(key, JSON.stringify(attempt));
    setDraftPending(attempt);
  };
  const clearDraftAttempt = () => {
    const key = draftAttemptKey(table);
    if (key) localStorage.removeItem(key);
    setDraftPending(null);
  };
  const draftLocked = draftMode && draftPending !== null;
  const draftMutationBusy = cartBusy || draftLocked;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDraftPending(readDraftAttempt(table));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [table]);

  const refreshPendingOrders = useCallback(async (tableNo: number) => {
    const requestId = ++pendingRequestId.current;
    if (!Number.isSafeInteger(tableNo) || tableNo < 1) {
      setPendingOrders([]);
      return;
    }
    try {
      const response = await api.get("/saleTemp/pendingCounterOrders", {
        params: { tableNo },
      });
      const parsed = parsePendingCounterOrders(response.data);
      if (!parsed) throw new Error("Invalid pending orders response");
      if (requestId === pendingRequestId.current) setPendingOrders(parsed);
    } catch (error: unknown) {
      if (requestId === pendingRequestId.current) {
        setPendingOrders([]);
        toast.error("Unable to load kitchen queue", {
          description: errorMessage(error),
        });
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshPendingOrders(table), 0);
    return () => window.clearTimeout(timer);
  }, [refreshPendingOrders, table]);

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
      !Number.isInteger(table) ||
      table < 1
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
  const openModalEdit = async (item: SaleTemp) => {
    if (customizationBusy || checkoutBusy || draftLocked) return;
    setCustomizationOpen(true);
    setSaleTempId(item.id);
    setSaleTempDetails([]);
    setTasted([]);
    setSized([]);
    if (draftMode) {
      try {
        setCustomizationBusy(true);
        const response = await api.get(`/counterOrder/options/${item.Food.id}`);
        const result = response.data?.results;
        if (
          !isRecord(result) ||
          !Array.isArray(result.tastes) ||
          !Array.isArray(result.foodSizes)
        )
          throw new Error("Invalid customization options");
        setTasted(result.tastes as Taste[]);
        setSized(result.foodSizes as FoodSize[]);
        setSaleTempDetails(draftCart.detailsFor(item.Food.id));
      } catch (error) {
        setCustomizationOpen(false);
        toast.error("Unable to load options", {
          description: errorMessage(error),
        });
      } finally {
        setCustomizationBusy(false);
      }
      return;
    }
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
    if (customizationBusy || checkoutBusy || draftLocked) return;
    if (draftMode) {
      setSaleTempDetails(
        await draftCart.changeDetail(saleTempDetailId, { tasteId }),
      );
      return;
    }
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
    if (customizationBusy || checkoutBusy || draftLocked) return;
    if (draftMode) {
      setSaleTempDetails(
        await draftCart.changeDetail(saleTempDetailId, { tasteId: null }),
      );
      return;
    }
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
    if (customizationBusy || checkoutBusy || draftLocked) return;
    if (draftMode) {
      setSaleTempDetails(
        await draftCart.changeDetail(saleTempDetailId, { foodSizeId: sizeId }),
      );
      return;
    }
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
    if (customizationBusy || checkoutBusy || draftLocked) return;
    if (draftMode) {
      await draftCart.addItem(saleTempId);
      setSaleTempDetails(draftCart.detailsFor(saleTempId));
      return;
    }
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
    if (customizationBusy || checkoutBusy || draftLocked) return;
    if (draftMode) {
      const remaining = await draftCart.removeDetail(saleTempDetailId);
      setSaleTempDetails(remaining);
      if (remaining.length === 0) {
        setCustomizationOpen(false);
        setSaleTempId(0);
      }
      return;
    }
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
  // EN: Receipt kind comes from the caller; API paths do not reliably distinguish an unpaid pre-bill from a paid receipt.
  // FI: Kuitin tyyppi tulee kutsujalta; API-polut eivät luotettavasti erota maksamatonta esilaskua maksetusta kuitista.
  const showReceipt = async (
    path: string,
    payload: Record<string, unknown>,
    kind: "prebill" | "paid",
  ) => {
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
    setReceiptKind(kind);
    setBillUrl(nextUrl);
    window.requestAnimationFrame(() => {
      document.getElementById("btnPrint")?.click();
    });
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
      await showReceipt("/saleTemp/printBillAfterPay", { billId }, "paid");
    } finally {
      setReceiptBusy(false);
    }
  };

  // Coordinates prepare payment while preserving transaction behavior.
  const preparePayment = () => {
    const saved = draftMode ? readDraftAttempt(table) : null;
    if (saved?.kind === "kitchen") return;
    const pendingAttempt =
      checkoutAttemptRef.current ??
      (saved?.kind === "checkout" ? saved.payload : null);
    if (pendingAttempt?.tableNo === table) {
      checkoutAttemptRef.current = pendingAttempt;
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
    if (draftMode && readDraftAttempt(table)) return;
    checkoutAttemptRef.current = null;
    setPayType(nextType);
    setReceivedAmount(nextType === "bank" ? summary.total : 0);
  };

  // Updates received amount without changing user-visible behavior.
  const changeReceivedAmount = (nextAmount: number) => {
    if (draftMode && readDraftAttempt(table)) return;
    checkoutAttemptRef.current = null;
    setReceivedAmount(nextAmount);
  };

  // Coordinates end sale behavior for this module.
  const endSale = async () => {
    if (checkoutBusy || receiptBusy) return;
    setCheckoutBusy(true);
    try {
      const saved = draftMode ? readDraftAttempt(table) : null;
      if (saved?.kind === "kitchen") return;
      let payload =
        checkoutAttemptRef.current ??
        (saved?.kind === "checkout" ? saved.payload : null);
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
          ...(draftMode
            ? {
                items: draftCart.getIntent().items,
                expectedTotal: refreshedCart.summary.total,
              }
            : {}),
        };
        if (draftMode) saveDraftAttempt({ kind: "checkout", payload });
        checkoutAttemptRef.current = payload;
      }
      const res = await api.post(
        draftMode ? "/counterOrder/checkout" : "/saleTemp/endSale",
        payload,
      );
      const completed = parseCheckoutResult(res.data);
      if (!completed) throw new Error("Invalid checkout response");

      setLastCompletedBillId(completed.billId);
      setReceivedAmount(0);
      setCheckoutOpen(false);
      if (draftMode) {
        const cleared = await draftCart.clearCart();
        if (cleared) {
          clearDraftAttempt();
          checkoutAttemptRef.current = null;
        } else {
          toast.warning(
            "Sale completed, but the local draft could not be cleared. Retry payment to recover it.",
          );
        }
      } else await refreshCart();
      if (!draftMode) checkoutAttemptRef.current = null;

      try {
        await printBillAfterPay(completed.billId);
      } catch (receiptError: unknown) {
        toast.warning("Sale completed", {
          description: `Bill ${completed.billId} was saved, but the receipt could not be opened: ${errorMessage(receiptError)}`,
        });
      }
    } catch (e: unknown) {
      if (hasFinalHttpResponse(e)) {
        checkoutAttemptRef.current = null;
        if (draftMode) {
          clearDraftAttempt();
          await draftCart.refreshCart();
        }
      }
      toast.error("Checkout failed", {
        description: errorMessage(e),
      });
    } finally {
      setCheckoutBusy(false);
    }
  };

  // EN: A network retry reuses the same key; the server atomically snapshots and removes only this cart.
  // FI: Verkkoyritys käyttää samaa avainta; palvelin tallentaa tilannekuvan ja poistaa vain tämän ostoskorin atomisesti.
  const sendToKitchen = async () => {
    if (checkoutBusy || cartBusy || receiptBusy) return;
    setCheckoutBusy(true);
    try {
      const saved = draftMode ? readDraftAttempt(table) : null;
      if (saved?.kind === "checkout") return;
      let attempt =
        kitchenAttemptRef.current ??
        (saved?.kind === "kitchen" ? saved.payload : null);
      if (!attempt || attempt.tableNo !== table) {
        const refreshedCart = await refreshCart();
        if (!refreshedCart || refreshedCart.summary.total <= 0) return;
        const confirmed = await requestConfirmation({
          title: "Send to kitchen?",
          description:
            "Sent items cannot be edited. New items create a new order. Payment waits until the order is served.",
          confirmLabel: "Send to kitchen",
        });
        if (!confirmed) return;
        attempt = { tableNo: table, idempotencyKey: crypto.randomUUID() };
        if (draftMode) attempt.items = draftCart.getIntent().items;
        if (draftMode) attempt.expectedTotal = refreshedCart.summary.total;
        if (draftMode) saveDraftAttempt({ kind: "kitchen", payload: attempt });
        kitchenAttemptRef.current = attempt;
      }
      const response = await api.post(
        draftMode ? "/counterOrder/submit" : "/saleTemp/submitToKitchen",
        attempt,
      );
      const result = response.data;
      if (
        !isRecord(result) ||
        !Number.isSafeInteger(result.orderId) ||
        !Number.isSafeInteger(result.total) ||
        (result.status !== "SUBMITTED" &&
          result.status !== "CONFIRMED" &&
          result.status !== "PREPARING" &&
          result.status !== "READY" &&
          result.status !== "SERVED" &&
          result.status !== "REJECTED" &&
          result.status !== "CANCELLED")
      )
        throw new Error("Invalid kitchen submission response");
      if (draftMode) {
        const cleared = await draftCart.clearCart();
        if (cleared) {
          clearDraftAttempt();
          kitchenAttemptRef.current = null;
        } else {
          toast.warning(
            "Order sent, but the local draft could not be cleared. Retry sending to recover it.",
          );
        }
      } else kitchenAttemptRef.current = null;
      await Promise.all([
        draftMode ? Promise.resolve() : refreshCart(table),
        refreshPendingOrders(table),
      ]);
      if (result.status === "REJECTED" || result.status === "CANCELLED")
        toast.warning("This order is no longer in the kitchen queue");
      else
        toast.success(
          result.replayed === true
            ? "Order was already sent"
            : "Order queued for kitchen",
        );
    } catch (error: unknown) {
      if (hasFinalHttpResponse(error)) kitchenAttemptRef.current = null;
      if (draftMode && hasFinalHttpResponse(error)) {
        clearDraftAttempt();
        await draftCart.refreshCart();
      }
      toast.error("Unable to send order", { description: errorMessage(error) });
    } finally {
      setCheckoutBusy(false);
    }
  };

  // Handles table change events and preserves existing side effects.
  const handleTableChange = (value: string) => {
    pendingRequestId.current += 1;
    checkoutAttemptRef.current = null;
    kitchenAttemptRef.current = null;
    setPendingOrders([]);
    setReceivedAmount(0);
    setPayType("cash");
    setTable(Number(value));
    setDraftPending(readDraftAttempt(Number(value)));
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
          {draftMode &&
          draftCart.loadedTable === table &&
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
          {pendingOrders.length > 0 ? (
            <section
              className="mt-6 border-t border-border pt-4"
              aria-label="Kitchen queue"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Keittiöön lähetetyt</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={checkoutBusy}
                  onClick={() => void refreshPendingOrders(table)}
                >
                  Päivitä
                </Button>
              </div>
              {pendingOrders.map((order) => (
                <article
                  key={order.id}
                  className="mt-3 rounded-md border border-border p-3 text-xs"
                >
                  <div className="flex justify-between font-semibold">
                    <span>
                      #{order.id} · {order.status}
                    </span>
                    <span>
                      {order.total.toLocaleString("fi-FI", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      €
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {order.Items.map(
                      (item) => `${item.quantity} × ${item.foodName}`,
                    ).join(", ")}
                  </p>
                  {order.status === "SERVED" ? (
                    <Button
                      type="button"
                      size="sm"
                      className="mt-2"
                      aria-label={`Pay Order #${order.id}`}
                      disabled={checkoutBusy || receiptBusy || cartBusy}
                      onClick={() => setPayableOrder(order)}
                    >
                      Maksa tilaus #{order.id}
                    </Button>
                  ) : null}
                </article>
              ))}
            </section>
          ) : null}
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
            <>
              <Button
                type="button"
                size="lg"
                aria-label="Pay"
                disabled={
                  checkoutBusy ||
                  receiptBusy ||
                  cartBusy ||
                  (draftMode && draftPending?.kind === "kitchen")
                }
                onClick={() => {
                  preparePayment();
                  setCheckoutOpen(true);
                }}
                className="mt-6 w-full"
              >
                Siirry maksuun <ChevronRight aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                aria-label="Send to kitchen"
                disabled={
                  cartBusy ||
                  checkoutBusy ||
                  receiptBusy ||
                  (draftMode && draftPending?.kind === "checkout")
                }
                onClick={() => void sendToKitchen()}
                className="mt-2 w-full"
              >
                Lähetä keittiöön
              </Button>
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
      {payableOrder ? (
        <CounterOrderCheckout
          key={payableOrder.id}
          order={payableOrder}
          onClose={() => setPayableOrder(null)}
          onBusyChange={setCheckoutBusy}
          onRefresh={() => refreshPendingOrders(table)}
          onPaid={async (billId) => {
            setPayableOrder(null);
            setLastCompletedBillId(billId);
            await refreshPendingOrders(table);
            try {
              await printBillAfterPay(billId);
            } catch (error: unknown) {
              toast.warning("Sale completed", {
                description: `Bill ${billId} was saved, but the receipt could not be opened: ${errorMessage(error)}`,
              });
            }
          }}
        />
      ) : null}
      <CheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        total={summary.total}
        payType={payType}
        receivedAmount={receivedAmount}
        checkoutBusy={checkoutBusy}
        receiptBusy={receiptBusy}
        paymentDetailsLocked={draftMode && draftPending?.kind === "checkout"}
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
