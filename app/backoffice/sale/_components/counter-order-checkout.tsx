"use client";

import { useEffect, useRef, useState } from "react";
import { isMutationRejected } from "@/lib/mutation-outcome";
import {
  readPendingRequest,
  savePendingRequest,
  clearPendingRequest,
  pendingRequestKey,
  assertPendingOwner,
} from "@/lib/pending-request";
import {
  parseCounterPayment,
  type CounterPaymentAttempt,
} from "@/lib/counter-payment";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  parseCheckoutResult,
  type SentCounterOrder,
} from "@/lib/sale-contracts";
import CheckoutModal from "@/components/payments/checkout-modal";

type Props = {
  order: SentCounterOrder;
  onClose: () => void;
  onPaid: (billId: number) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  onRefresh: () => Promise<void>;
};

export default function CounterOrderCheckout({
  order,
  onClose,
  onPaid,
  onBusyChange,
  onRefresh,
}: Props) {
  const [payType, setPayType] = useState<"cash" | "bank">("cash");
  const [received, setReceived] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const attempt = useRef<CounterPaymentAttempt | null>(null);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [pendingTotal, setPendingTotal] = useState<number | null>(null);
  const inFlight = useRef(false);
  const resource = `counter-order:${order.id}`;
  const ownerKeyRef = useRef(pendingRequestKey(resource));
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (ownerKeyRef.current)
          assertPendingOwner(resource, ownerKeyRef.current);
        const saved = readPendingRequest(resource, parseCounterPayment);
        if (saved) {
          if (saved.order.id !== order.id)
            throw new Error("Maksupyyntö kuuluu toiselle tilaukselle.");
          attempt.current = saved.payload;
          setPendingTotal(saved.order.total);
          setPayType(saved.payload.payType);
          setReceived(saved.payload.inputMoney ?? saved.order.total);
          setUncertain(true);
        }
      } catch {
        setStorageError(
          "Tallennettu maksuyritys on virheellinen. Tarkista maksun tila ennen uutta yritystä.",
        );
      } finally {
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [resource, order.id]);

  // EN: Unknown outcomes retain the exact payment key and payload; retries must never create a new charge.
  // FI: Epävarma tulos säilyttää saman maksuavaimen ja sisällön; uusi yritys ei saa luoda uutta maksua.
  const pay = async () => {
    if (inFlight.current || !ready || storageError) return;
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    const ownerKey = ownerKeyRef.current;
    try {
      if (!attempt.current) {
        const payload = {
          expectedVersion: order.version,
          idempotencyKey: crypto.randomUUID(),
          payType,
          ...(payType === "cash" ? { inputMoney: received } : {}),
        };
        savePendingRequest(resource, { order, payload }, ownerKey);
        attempt.current = payload;
        setPendingTotal(order.total);
      }
      assertPendingOwner(resource, ownerKey);
      const response = await api.post(
        `/counterOrder/${order.id}/settle`,
        attempt.current,
      );
      const result = parseCheckoutResult(response.data);
      if (!result) throw new Error("Invalid payment response");
      clearPendingRequest(resource, ownerKey);
      attempt.current = null;
      setUncertain(false);
      // EN: A receipt/display failure after a confirmed payment must not become a new payment attempt.
      // FI: Kuitti- tai näyttövirhe vahvistetun maksun jälkeen ei saa muuttua uudeksi maksuyritykseksi.
      try {
        await onPaid(result.billId);
      } catch {
        onClose();
        toast.warning("Sale completed", {
          description: `Bill ${result.billId} was saved. Reopen its receipt from sale history.`,
        });
      }
    } catch (error: unknown) {
      const rejected =
        isMutationRejected(error) && pendingRequestKey(resource) === ownerKey;
      if (rejected) {
        clearPendingRequest(resource, ownerKey);
        attempt.current = null;
        setUncertain(false);
        onClose();
        await onRefresh();
      } else {
        setUncertain(attempt.current !== null);
      }
      toast.error(
        rejected ? "Order payment rejected" : "Payment result unknown",
        {
          description: rejected
            ? "Refresh the order and check its status, version and payment details."
            : "Retry this payment with the same details to retrieve its result.",
        },
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  };

  return (
    <CheckoutModal
      open
      orderId={order.id}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      total={pendingTotal ?? order.total}
      payType={payType}
      receivedAmount={received}
      checkoutBusy={busy || !ready || !!storageError}
      receiptBusy={false}
      paymentDetailsLocked={uncertain}
      errorMessage={storageError}
      onSelectPaymentType={(value) => {
        setPayType(value);
        setReceived(value === "bank" ? order.total : 0);
      }}
      onChangeReceivedAmount={setReceived}
      onReceivedAmountInput={(value) => {
        const amount = Number(value);
        setReceived(Number.isSafeInteger(amount) && amount >= 0 ? amount : 0);
      }}
      onCompletePayment={() => void pay()}
    />
  );
}
