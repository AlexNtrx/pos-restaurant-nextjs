import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { parseCheckoutResult } from "@/lib/sale-contracts";
import { pendingRequestKey, assertPendingOwner } from "@/lib/pending-request";
import { isMutationRejected } from "@/lib/mutation-outcome";
import type useCounterDraft from "./use-counter-draft";
import type { DraftScope } from "./use-counter-draft";
import {
  draftAttemptKey,
  readDraftAttempt,
  type OrderLocation,
  type CheckoutAttempt,
  type DraftPendingAttempt,
} from "../_lib/counter-attempt";
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unexpected error";
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const hasFinalHttpResponse = isMutationRejected;
export default function useCounterCheckout({
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
  requestConfirmation,
  printBillAfterPay,
}: {
  draftScope: DraftScope;
  draftMode: boolean;
  draftCart: ReturnType<typeof useCounterDraft>;
  table: number;
  serviceType: "DINE_IN" | "TAKEAWAY";
  summary: { total: number };
  cartBusy: boolean;
  checkoutBusy: boolean;
  setCheckoutBusy: (busy: boolean) => void;
  receiptBusy: boolean;
  refreshCart: () => Promise<{ summary: { total: number } } | null | undefined>;
  refreshSentOrders: () => Promise<void>;
  requestConfirmation: (config: {
    title: string;
    description: string;
    confirmLabel: string;
    destructive?: boolean;
  }) => Promise<boolean>;
  printBillAfterPay: (billId: number) => Promise<void>;
}) {
  const [payType, setPayType] = useState<"cash" | "bank">("cash");
  const [receivedAmount, setReceivedAmount] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [draftPending, setDraftPending] = useState<DraftPendingAttempt | null>(
    null,
  );
  const [invalidDraftAttempt, setInvalidDraftAttempt] = useState(false);
  const [lastCompletedBillId, setLastCompletedBillId] = useState<number | null>(
    null,
  );
  const checkoutInFlight = useRef(false);
  const ownerKeyRef = useRef(pendingRequestKey("counter-sale"));
  const checkoutAttemptRef = useRef<CheckoutAttempt | null>(null);
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

  const resetPayment = () => {
    checkoutAttemptRef.current = null;
    setReceivedAmount(0);
    setPayType("cash");
  };
  return {
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
  };
}
