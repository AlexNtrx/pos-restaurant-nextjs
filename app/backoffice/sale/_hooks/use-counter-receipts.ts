import { getApiErrorMessage } from "@/lib/api-error";
import { useState } from "react";
import { toast } from "sonner";
import { useReceiptPreview } from "@/components/receipts/use-receipt-preview";

// EN: Both cashier pages reprint the displayed bill, never an unrelated later checkout.
// FI: Molemmat kassasivut tulostavat näytetyn laskun, eivät muuta myöhempää maksua.
export default function useCounterReceipts() {
  const {
    url: billUrl,
    load: loadReceipt,
    close: closeReceipt,
  } = useReceiptPreview();
  const [receiptKind, setReceiptKind] = useState<"prebill" | "paid">("paid");
  const [receiptBillId, setReceiptBillId] = useState<number | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const showReceipt = async (
    path: string,
    payload: Record<string, unknown>,
    kind: "prebill" | "paid",
  ) => {
    await loadReceipt(path, payload);
    setReceiptKind(kind);
    setReceiptBillId(kind === "paid" ? Number(payload.billId) : null);
  };
  const printBillAfterPay = async (billId: number) => {
    if (receiptBusy) return;
    setReceiptBusy(true);
    try {
      await showReceipt("/saleTemp/printBillAfterPay", { billId }, "paid");
    } finally {
      setReceiptBusy(false);
    }
  };
  const printPaidSentOrder = async (billId: number) => {
    try {
      await printBillAfterPay(billId);
    } catch (error) {
      toast.error("Kuittia ei voitu avata", {
        description: getApiErrorMessage(error, "Yritä avata kuitti uudelleen."),
      });
    }
  };
  const printSentOrder = async (orderId: number) => {
    if (receiptBusy) return;
    setReceiptBusy(true);
    try {
      await showReceipt(`/counterOrder/${orderId}/prebill`, {}, "prebill");
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
  return {
    billUrl,
    closeReceipt,
    receiptKind,
    receiptBillId,
    receiptBusy,
    setReceiptBusy,
    showReceipt,
    printBillAfterPay,
    printPaidSentOrder,
    printSentOrder,
  };
}
