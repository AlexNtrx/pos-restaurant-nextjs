"use client";

import { useRef, useState } from "react";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  parseCheckoutResult,
  type SentCounterOrder,
} from "@/lib/sale-contracts";
import CheckoutModal from "./checkout-modal";

type PaymentAttempt = {
  expectedVersion: number;
  idempotencyKey: string;
  payType: "cash" | "bank";
  inputMoney?: number;
};

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
  const attempt = useRef<PaymentAttempt | null>(null);
  const inFlight = useRef(false);

  // EN: Unknown outcomes retain the exact payment key and payload; retries must never create a new charge.
  // FI: Epävarma tulos säilyttää saman maksuavaimen ja sisällön; uusi yritys ei saa luoda uutta maksua.
  const pay = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    try {
      attempt.current ??= {
        expectedVersion: order.version,
        idempotencyKey: crypto.randomUUID(),
        payType,
        ...(payType === "cash" ? { inputMoney: received } : {}),
      };
      const response = await api.post(
        `/counterOrder/${order.id}/settle`,
        attempt.current,
      );
      const result = parseCheckoutResult(response.data);
      if (!result) throw new Error("Invalid payment response");
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
      const status = isAxiosError(error) ? error.response?.status : undefined;
      const rejected =
        status != null && [400, 401, 403, 404, 409].includes(status);
      if (rejected) {
        attempt.current = null;
        setUncertain(false);
        if (status !== 400) {
          onClose();
          await onRefresh();
        }
      } else {
        setUncertain(true);
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
      total={order.total}
      payType={payType}
      receivedAmount={received}
      checkoutBusy={busy}
      receiptBusy={false}
      paymentDetailsLocked={uncertain}
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
