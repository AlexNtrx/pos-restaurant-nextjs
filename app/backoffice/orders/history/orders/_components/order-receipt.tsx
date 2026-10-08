"use client";

import { useEffect, useRef, useState } from "react";
import { ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReceiptPreview from "@/components/receipts/receipt-preview";
import api from "@/lib/api";
import { getBlobApiErrorMessage } from "@/lib/api-error";
import type { StaffOrderDetail } from "@/lib/orders/contracts";
import { currency } from "../_lib/presentation";

export function OrderReceipt({
  receipt,
}: {
  receipt: StaffOrderDetail["receipt"];
}) {
  const [billUrl, setBillUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const previewUrl = useRef("");
  const billId = receipt?.billId;

  useEffect(
    () => () => {
      // EN: Closing or replacing the Order discards late PDF responses and releases the receipt URL.
      // FI: Tilauksen sulkeminen tai vaihtaminen hylkää myöhäiset PDF-vastaukset ja vapauttaa kuitin URL-osoitteen.
      request.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [billId],
  );

  const closePreview = () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = "";
    setBillUrl("");
  };

  const openReceipt = async () => {
    if (!billId || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      // EN: Reprint the original BillSale snapshot, including a shared table bill; this request never creates a payment.
      // FI: Tulosta alkuperäinen BillSale-tallenne myös yhteisestä pöytälaskusta; pyyntö ei koskaan luo maksua.
      const response = await api.post(
        "/saleTemp/printBillAfterPay",
        { billId },
        {
          responseType: "blob",
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return;
      if (
        !(response.data instanceof Blob) ||
        response.data.size === 0 ||
        response.data.type.split(";")[0] !== "application/pdf"
      )
        throw new Error("Palvelin palautti virheellisen kuitin.");
      closePreview();
      previewUrl.current = URL.createObjectURL(response.data);
      setBillUrl(previewUrl.current);
    } catch (cause) {
      const message = await getBlobApiErrorMessage(
        cause,
        "Kuittia ei voitu ladata. Yritä uudelleen.",
      );
      if (!controller.signal.aborted) setError(message);
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setBusy(false);
      }
    }
  };

  if (!receipt) return null;
  return (
    <section
      className="space-y-2 rounded-lg border border-border p-4"
      aria-label="Kuitti"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Kuitti #{receipt.billId}</h3>
          <p>Kuitin summa: {currency.format(receipt.amount)}</p>
          {receipt.orderCount > 1 && (
            <p className="text-muted-foreground">
              Yhteinen kuitti · {receipt.orderCount} tilausta. Kuitti sisältää
              koko laskun.
            </p>
          )}
          {receipt.status === "cancelled" && (
            <p className="text-destructive">Mitätöity kuitti</p>
          )}
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void openReceipt()}
        >
          <ReceiptText aria-hidden="true" />
          {busy ? "Kuittia ladataan…" : "Kuitti"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {billUrl && (
        <ReceiptPreview
          billUrl={billUrl}
          kind="paid"
          historical
          lastCompletedBillId={receipt.billId}
          onClose={closePreview}
        />
      )}
    </section>
  );
}
