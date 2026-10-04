"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Printer, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { isAxiosError } from "axios";
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
import { readStaffCatalog } from "@/lib/catalog-reads";
import { getApiErrorMessage } from "@/lib/api-error";
import { usePolling } from "@/lib/use-polling";
import { isMutationRejected } from "@/lib/mutation-outcome";
import { pendingRequestKey, assertPendingOwner } from "@/lib/pending-request";
import {
  listPendingCounterPayments,
  type SavedCounterPayment,
} from "@/lib/counter-payment";
import type { StaffOrderDetail } from "@/app/backoffice/orders/inbox/_lib/staff-orders";
import { readAuthSession } from "@/lib/auth-session";
import {
  parseCheckoutResult,
  parseFoods,
  parseSentCounterOrders,
  type Food,
  type FoodSize,
  type SaleTemp,
  type SaleTempDetail,
  type SentCounterOrder,
  type Taste,
} from "@/lib/sale-contracts";
import usePosCart from "./_hooks/use-pos-cart";
import useCounterDraft, { type DraftScope } from "./_hooks/use-counter-draft";
import CatalogGrid, { type CatalogStatus } from "./_components/catalog-grid";
import CartSidebar from "./_components/cart-sidebar";
import CheckoutModal from "./_components/checkout-modal";
import CounterOrderCheckout from "./_components/counter-order-checkout";
import SentOrderDetails from "./_components/sent-order-details";
import QrTableOrders from "./_components/qr-table-orders";
import CustomizationModal from "./_components/customization-modal";
import ReceiptPreview from "./_components/receipt-preview";

// EN: Section — Submission types and persisted draft attempts.
// FI: Osio — Lähetystyypit ja tallennetut luonnoksen lähetysyritykset.
type OrderLocation =
  | { tableNo: number; serviceType?: never }
  | { serviceType: "TAKEAWAY"; tableNo?: never };
type CheckoutAttempt = OrderLocation & {
  payType: "cash" | "bank";
  inputMoney?: number;
  idempotencyKey: string;
  items?: ReturnType<ReturnType<typeof useCounterDraft>["getIntent"]>["items"];
  expectedTotal?: number;
};
type KitchenAttempt = OrderLocation & {
  idempotencyKey: string;
  items?: ReturnType<ReturnType<typeof useCounterDraft>["getIntent"]>["items"];
  expectedTotal?: number;
};
type DraftPendingAttempt =
  | {
      kind: "checkout" | "legacy";
      payload: CheckoutAttempt;
      quotedTotal?: number;
    }
  | { kind: "kitchen"; payload: KitchenAttempt };
type SentView = "active" | "history";

const draftAttemptKey = (scope: DraftScope) => {
  if (typeof window === "undefined") return null;
  const userId = readAuthSession()?.userId;
  return userId
    ? `counter-draft:v1:${userId}:${scope === "TAKEAWAY" ? "takeaway" : scope}:attempt`
    : null;
};
const readDraftAttempt = (scope: DraftScope): DraftPendingAttempt | null => {
  const key = draftAttemptKey(scope);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      !["checkout", "legacy", "kitchen"].includes(String(parsed.kind)) ||
      !isRecord(parsed.payload) ||
      (scope === "TAKEAWAY"
        ? parsed.payload.serviceType !== "TAKEAWAY" ||
          parsed.payload.tableNo != null
        : parsed.payload.tableNo !== scope ||
          parsed.payload.serviceType === "TAKEAWAY") ||
      typeof parsed.payload.idempotencyKey !== "string" ||
      !parsed.payload.idempotencyKey ||
      (parsed.kind !== "kitchen" &&
        (!["cash", "bank"].includes(String(parsed.payload.payType)) ||
          (parsed.payload.inputMoney !== undefined &&
            (!Number.isSafeInteger(parsed.payload.inputMoney) ||
              Number(parsed.payload.inputMoney) < 0)))) ||
      (parsed.kind !== "legacy" && !Array.isArray(parsed.payload.items)) ||
      (parsed.kind === "legacy" &&
        (scope === "TAKEAWAY" || !Number.isSafeInteger(parsed.quotedTotal)))
    )
      return null;
    return parsed as DraftPendingAttempt;
  } catch {
    return null;
  }
};

const pendingDraftScopes = (): DraftScope[] => {
  const userId = readAuthSession()?.userId;
  if (!userId) return [];
  const prefix = `counter-draft:v1:${userId}:`;
  return Array.from({ length: localStorage.length }, (_, index) =>
    localStorage.key(index),
  ).flatMap<DraftScope>((key) => {
    if (!key?.startsWith(prefix) || !key.endsWith(":attempt")) return [];
    const scope = key.slice(prefix.length, -":attempt".length);
    return scope === "takeaway"
      ? ["TAKEAWAY" as const]
      : /^[1-9]\d*$/.test(scope)
        ? [Number(scope)]
        : [];
  });
};

// EN: Section — Confirmation types and response helpers.
// FI: Osio — Vahvistustyypit ja vastausten apufunktiot.
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
const hasFinalHttpResponse = isMutationRejected;

// Renders the POS sale page interface.
// EN: Section — Counter POS page.
// FI: Osio — Kassan sivu.
export default function Page() {
  // EN: Section — Page state and request references.
  // FI: Osio — Sivun tila ja pyyntöviitteet.
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
  const [invalidDraftAttempt, setInvalidDraftAttempt] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "food" | "drink">(
    "all",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("loading");
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [sentOrders, setSentOrders] = useState<SentCounterOrder[]>([]);
  const [pendingCounterPayments, setPendingCounterPayments] = useState<
    SavedCounterPayment[]
  >([]);
  const [pendingPaymentError, setPendingPaymentError] = useState("");
  const [otherPendingScopes, setOtherPendingScopes] = useState<DraftScope[]>(
    [],
  );
  const [sentView, setSentView] = useState<SentView>("active");
  const [serviceType, setServiceType] = useState<"DINE_IN" | "TAKEAWAY">(
    "DINE_IN",
  );
  const [selectedSentOrderId, setSelectedSentOrderId] = useState<number | null>(
    null,
  );
  const [sentOrderDetail, setSentOrderDetail] =
    useState<StaffOrderDetail | null>(null);
  const [sentOrderError, setSentOrderError] = useState("");
  const [sentOrderCancelling, setSentOrderCancelling] = useState(false);
  const [payableOrder, setPayableOrder] = useState<SentCounterOrder | null>(
    null,
  );
  const [lastCompletedBillId, setLastCompletedBillId] = useState<number | null>(
    null,
  );
  const [receiptBillId, setReceiptBillId] = useState<number | null>(null);
  const myRef = useRef<HTMLInputElement>(null);
  const checkoutInFlight = useRef(false);
  const ownerKeyRef = useRef(pendingRequestKey("counter-sale"));
  const checkoutAttemptRef = useRef<CheckoutAttempt | null>(null);
  const pendingRequestId = useRef(0);
  const sentDetailRequestId = useRef(0);
  // EN: Only the latest selected filter may publish its result, even when reads are shared.
  // FI: Vain viimeksi valittu suodatin saa näyttää tuloksensa myös jaetuissa hauissa.
  const catalogRequestId = useRef(0);
  const billUrlRef = useRef("");
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
  const saveDraftAttempt = (
    attempt: DraftPendingAttempt,
    ownerKey = draftAttemptKey(draftScope),
  ) => {
    const key = draftAttemptKey(draftScope);
    if (!key || key !== ownerKey)
      throw new Error(
        "Sign in with the original account before submitting this draft",
      );
    localStorage.setItem(key, JSON.stringify(attempt));
    setDraftPending(attempt);
  };
  const clearDraftAttempt = (ownerKey = draftAttemptKey(draftScope)) => {
    const key = draftAttemptKey(draftScope);
    if (!key || key !== ownerKey)
      throw new Error(
        "Account changed; recover this request with its original account",
      );
    if (key) localStorage.removeItem(key);
    setDraftPending(null);
  };
  const draftLocked = draftPending !== null || invalidDraftAttempt;
  const draftMutationBusy = cartBusy || draftLocked;
  const attemptMatchesScope = (attempt: OrderLocation | null) =>
    draftScope === "TAKEAWAY"
      ? attempt?.serviceType === "TAKEAWAY"
      : attempt?.tableNo === table && attempt.serviceType !== "TAKEAWAY";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = readDraftAttempt(draftScope);
      setDraftPending(saved);
      try {
        const key = draftAttemptKey(draftScope);
        setInvalidDraftAttempt(
          !!key && !!localStorage.getItem(key) && saved === null,
        );
      } catch {
        setInvalidDraftAttempt(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draftScope]);
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
  const [sentForbidden, setSentForbidden] = useState(false);
  const readSentOrders = useCallback(
    async (scope: DraftScope, view: SentView, signal: AbortSignal) => {
      const requestId = ++pendingRequestId.current;
      if (scope !== "TAKEAWAY" && (!Number.isSafeInteger(scope) || scope < 1)) {
        setSentOrders([]);
        return;
      }
      try {
        const response = await api.get("/counterOrder/sent", {
          signal,
          params:
            scope === "TAKEAWAY"
              ? { serviceType: "TAKEAWAY", view }
              : { tableNo: scope, view },
        });
        const parsed = parseSentCounterOrders(response.data);
        if (!parsed) throw new Error("Invalid sent orders response");
        if (!signal.aborted && requestId === pendingRequestId.current)
          setSentOrders(parsed);
      } catch (error: unknown) {
        if (!signal.aborted && requestId === pendingRequestId.current) {
          if (
            isAxiosError(error) &&
            [401, 403].includes(error.response?.status ?? 0)
          ) {
            setSentOrders([]);
            setSentForbidden(true);
          }
          toast.error("Unable to load sent orders", {
            description: errorMessage(error),
          });
          throw error;
        }
      }
    },
    [],
  );

  const pollSentOrders = useCallback(
    (signal: AbortSignal) => readSentOrders(draftScope, sentView, signal),
    [readSentOrders, draftScope, sentView],
  );
  const refreshSentOrders = usePolling(pollSentOrders, {
    intervalMs: 10_000,
    enabled: !sentForbidden,
  });

  const loadSentOrderDetail = async (orderId: number) => {
    const requestId = ++sentDetailRequestId.current;
    setSelectedSentOrderId(orderId);
    setSentOrderDetail(null);
    setSentOrderError("");
    try {
      const response = await api.get<{ result: StaffOrderDetail }>(
        `/counterOrder/${orderId}`,
      );
      const result = response.data?.result;
      if (!result || result.id !== orderId || !Array.isArray(result.history))
        throw new Error("Invalid sent order details response");
      if (requestId === sentDetailRequestId.current) setSentOrderDetail(result);
    } catch (error: unknown) {
      if (requestId === sentDetailRequestId.current)
        setSentOrderError(
          getApiErrorMessage(error, "Tilausta ei voitu avata."),
        );
    }
  };

  const closeSentOrderDetail = () => {
    sentDetailRequestId.current += 1;
    setSelectedSentOrderId(null);
    setSentOrderDetail(null);
    setSentOrderError("");
  };

  const cancelSentOrder = async (reason: string) => {
    if (!sentOrderDetail || sentOrderCancelling) return;
    const orderId = sentOrderDetail.id;
    setSentOrderCancelling(true);
    setSentOrderError("");
    try {
      const response = await api.patch<{ result: StaffOrderDetail }>(
        `/counterOrder/${orderId}/cancel`,
        { expectedVersion: sentOrderDetail.version, reason },
      );
      const result = response.data?.result;
      if (
        !result ||
        result.id !== orderId ||
        result.status !== "CANCELLED" ||
        !Array.isArray(result.history)
      )
        throw new Error("Invalid cancellation response");
      setSentOrderDetail(result);
      await refreshSentOrders();
      toast.success(`Tilaus #${orderId} peruttu`);
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, "Tilausta ei voitu perua.");
      await Promise.all([loadSentOrderDetail(orderId), refreshSentOrders()]);
      setSentOrderError(message);
    } finally {
      setSentOrderCancelling(false);
    }
  };

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
      myRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (billUrlRef.current) URL.revokeObjectURL(billUrlRef.current);
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
  // EN: Section — Receipt loading and printing.
  // FI: Osio — Kuittien lataus ja tulostus.
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
      throw new Error("Virheellinen kuittivastaus");
    }

    const nextUrl = URL.createObjectURL(res.data);
    if (billUrlRef.current) URL.revokeObjectURL(billUrlRef.current);
    billUrlRef.current = nextUrl;
    setReceiptKind(kind);
    // EN: Reprinting targets the displayed receipt, which may differ from the latest checkout.
    // FI: Uudelleentulostus kohdistuu näytettyyn kuittiin, joka voi poiketa viimeisimmästä maksusta.
    setReceiptBillId(kind === "paid" ? Number(payload.billId) : null);
    setBillUrl(nextUrl);
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
  const preparePayment = () => {
    const saved = readDraftAttempt(draftScope);
    if (saved?.kind === "kitchen") return;
    const pendingAttempt =
      checkoutAttemptRef.current ?? (saved ? saved.payload : null);
    if (pendingAttempt && attemptMatchesScope(pendingAttempt)) {
      checkoutAttemptRef.current = pendingAttempt;
      setPayType(pendingAttempt.payType);
      setReceivedAmount(
        pendingAttempt.payType === "bank"
          ? saved
            ? (saved.quotedTotal ??
              saved.payload.expectedTotal ??
              summary.total)
            : summary.total
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
    if (readDraftAttempt(draftScope) || invalidDraftAttempt) return;
    checkoutAttemptRef.current = null;
    setPayType(nextType);
    setReceivedAmount(nextType === "bank" ? summary.total : 0);
  };

  // Updates received amount without changing user-visible behavior.
  const changeReceivedAmount = (nextAmount: number) => {
    if (readDraftAttempt(draftScope) || invalidDraftAttempt) return;
    checkoutAttemptRef.current = null;
    setReceivedAmount(nextAmount);
  };

  // Coordinates end sale behavior for this module.
  const endSale = async () => {
    if (
      checkoutInFlight.current ||
      checkoutBusy ||
      receiptBusy ||
      invalidDraftAttempt
    )
      return;
    checkoutInFlight.current = true;
    setCheckoutBusy(true);
    const ownerKey = draftAttemptKey(draftScope);
    try {
      assertPendingOwner("counter-sale", ownerKeyRef.current);
      const saved = readDraftAttempt(draftScope);
      if (ownerKey && localStorage.getItem(ownerKey) && !saved)
        throw new Error(
          "Saved checkout is invalid; check its outcome before a new attempt",
        );
      if (saved?.kind === "kitchen") return;
      const legacyPayment = saved?.kind === "legacy" || (!saved && !draftMode);
      let payload =
        checkoutAttemptRef.current ?? (saved ? saved.payload : null);
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
          ...(serviceType === "TAKEAWAY"
            ? { serviceType: "TAKEAWAY" as const }
            : { tableNo: table }),
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
        // EN: Legacy cart payment also survives reload after the server clears its cart; retain the exact endpoint, confirmed total and key.
        // FI: Vanhan ostoskorin maksu säilyy uudelleenlatauksessa myös palvelimen tyhjennettyä korin; säilytä sama rajapinta, vahvistettu summa ja avain.
        saveDraftAttempt(
          {
            kind: legacyPayment ? "legacy" : "checkout",
            payload,
            quotedTotal: refreshedCart.summary.total,
          },
          ownerKey,
        );
        checkoutAttemptRef.current = payload;
      }
      if (!ownerKey || draftAttemptKey(draftScope) !== ownerKey)
        throw new Error(
          "Account changed; recover this request with its original account",
        );
      const res = await api.post(
        legacyPayment ? "/saleTemp/endSale" : "/counterOrder/checkout",
        payload,
      );
      const completed = parseCheckoutResult(res.data);
      if (!completed) throw new Error("Invalid checkout response");
      if (draftAttemptKey(draftScope) !== ownerKey)
        throw new Error(
          "Account changed; recover this request with its original account",
        );

      setLastCompletedBillId(completed.billId);
      setReceivedAmount(0);
      setCheckoutOpen(false);
      if (!legacyPayment) {
        const cleared = await draftCart.clearCart();
        if (cleared) {
          clearDraftAttempt(ownerKey);
          checkoutAttemptRef.current = null;
        } else {
          toast.warning(
            "Sale completed, but the local draft could not be cleared. Retry payment to recover it.",
          );
        }
      } else {
        clearDraftAttempt(ownerKey);
        checkoutAttemptRef.current = null;
        await refreshCart();
      }
      await refreshSentOrders();
      if (serviceType === "TAKEAWAY" && completed.pickupNo)
        toast.success(`Nouto #${completed.pickupNo} lähetetty keittiöön`);
      else if (serviceType === "DINE_IN")
        toast.success("Tilaus lähetetty keittiöön");

      try {
        await printBillAfterPay(completed.billId);
      } catch {
        toast.warning("Maksu tallennettu", {
          description: `Kuitti #${completed.billId} tallennettiin. Yritä avata kuitti uudelleen.`,
        });
      }
    } catch (e: unknown) {
      if (hasFinalHttpResponse(e) && draftAttemptKey(draftScope) === ownerKey) {
        clearDraftAttempt(ownerKey);
        checkoutAttemptRef.current = null;
        await refreshCart();
      }
      toast.error("Checkout failed", {
        description: errorMessage(e),
      });
    } finally {
      checkoutInFlight.current = false;
      setCheckoutBusy(false);
    }
  };

  // EN: Section — Recovery of earlier kitchen submissions.
  // FI: Osio — Aikaisempien keittiölähetysten palautus.
  // EN: Old uncertain kitchen sends may be replayed for recovery; the endpoint cannot create a new unpaid Order.
  // FI: Vanha epävarma keittiölähetys voidaan palauttaa; rajapinta ei voi luoda uutta maksamatonta tilausta.
  const recoverKitchenAttempt = async () => {
    if (checkoutBusy || cartBusy || receiptBusy) return;
    const saved = readDraftAttempt(draftScope);
    if (saved?.kind !== "kitchen") return;
    setCheckoutBusy(true);
    try {
      const response = await api.post("/counterOrder/submit", saved.payload);
      const result = response.data;
      if (!isRecord(result) || !Number.isSafeInteger(result.orderId))
        throw new Error("Invalid kitchen submission response");
      const cleared = await draftCart.clearCart();
      if (cleared) clearDraftAttempt();
      else
        toast.warning(
          "Order found, but the local draft could not be cleared. Retry recovery.",
        );
      await refreshSentOrders();
      toast.success("Aiemmin lähetetty tilaus löytyi");
    } catch (error: unknown) {
      if (hasFinalHttpResponse(error)) {
        clearDraftAttempt();
        await draftCart.refreshCart();
      }
      toast.error("Unable to recover earlier order", {
        description: errorMessage(error),
      });
    } finally {
      setCheckoutBusy(false);
    }
  };

  // EN: Section — Table and service type selection.
  // FI: Osio — Pöydän ja palvelutyypin valinta.
  // Handles table change events and preserves existing side effects.
  const handleTableChange = (value: string) => {
    pendingRequestId.current += 1;
    closeSentOrderDetail();
    checkoutAttemptRef.current = null;
    setSentOrders([]);
    setSentView("active");
    setReceivedAmount(0);
    setPayType("cash");
    setTable(Number(value));
    setDraftPending(readDraftAttempt(Number(value)));
  };

  const handleServiceTypeChange = (next: "DINE_IN" | "TAKEAWAY") => {
    if (next === serviceType || checkoutBusy || receiptBusy) return;
    pendingRequestId.current += 1;
    closeSentOrderDetail();
    checkoutAttemptRef.current = null;
    setPayableOrder(null);
    setSentOrders([]);
    setSentView("active");
    setReceivedAmount(0);
    setPayType("cash");
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

  const closeReceipt = () => {
    if (billUrlRef.current) URL.revokeObjectURL(billUrlRef.current);
    billUrlRef.current = "";
    setBillUrl("");
  };

  // EN: Section — Page layout and dialogs.
  // FI: Osio — Sivun asettelu ja valintaikkunat.
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
              ref={myRef}
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
          <section
            className="mt-6 border-t border-border pt-4"
            aria-label="Sent orders"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Keittiöön lähetetyt</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={checkoutBusy}
                onClick={() => void refreshSentOrders()}
              >
                Päivitä
              </Button>
            </div>
            <div
              className="mt-3 flex gap-2"
              role="group"
              aria-label="Sent order view"
            >
              {(["active", "history"] as const).map((view) => (
                <Button
                  key={view}
                  type="button"
                  size="sm"
                  variant={sentView === view ? "default" : "outline"}
                  aria-pressed={sentView === view}
                  disabled={checkoutBusy}
                  onClick={() => {
                    if (view === sentView) return;
                    pendingRequestId.current += 1;
                    closeSentOrderDetail();
                    setPayableOrder(null);
                    setSentOrders([]);
                    setSentView(view);
                  }}
                >
                  {view === "active" ? "Käynnissä" : "Historia"}
                </Button>
              ))}
            </div>
            {sentOrders.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {sentView === "active"
                  ? "Ei keskeneräisiä tilauksia."
                  : "Ei päättyneitä tilauksia."}
              </p>
            ) : null}
            {sentOrders.map((order) => (
              <article
                key={order.id}
                className="mt-3 rounded-md border border-border p-3 text-xs"
              >
                <button
                  type="button"
                  className="w-full text-left hover:text-primary"
                  aria-label={`View Order #${order.id}`}
                  onClick={() => void loadSentOrderDetail(order.id)}
                >
                  <span className="flex justify-between font-semibold">
                    <span>
                      {order.serviceType === "TAKEAWAY"
                        ? `Nouto #${order.id}`
                        : `#${order.id}`}{" "}
                      · {order.status}
                    </span>
                    <span>
                      {order.total.toLocaleString("fi-FI", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      €
                    </span>
                  </span>
                  <span className="mt-1 block text-muted-foreground">
                    {order.Items.map(
                      (item) => `${item.quantity} × ${item.foodName}`,
                    ).join(", ")}
                  </span>
                </button>
                <div className="mt-2 flex flex-wrap gap-2">
                  {order.billSaleId === null &&
                  !["REJECTED", "CANCELLED", "PAID", "COMPLETED"].includes(
                    order.status,
                  ) ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        aria-label={`Pay Order #${order.id}`}
                        disabled={checkoutBusy || receiptBusy || cartBusy}
                        onClick={() => setPayableOrder(order)}
                      >
                        Maksa tilaus #{order.id}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={`Print Order #${order.id}`}
                        disabled={checkoutBusy || receiptBusy || cartBusy}
                        onClick={() => void printSentOrder(order.id)}
                      >
                        Tulosta ennakkokuitti
                      </Button>
                    </>
                  ) : order.billSaleId !== null ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`Print paid Order #${order.id}`}
                      disabled={checkoutBusy || receiptBusy}
                      onClick={() => void printPaidSentOrder(order.billSaleId!)}
                    >
                      Tulosta kuitti
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
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
