"use client";

import { RefreshButton } from "@/components/ui/refresh-button";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import ReceiptPreview from "@/components/receipts/receipt-preview";
import {
  listPendingCounterPayments,
  type SavedCounterPayment,
} from "@/lib/counter-payment";
import type { SentCounterOrder } from "@/lib/sale-contracts";
import useCounterSentOrders from "../../sale/_hooks/use-counter-sent-orders";
import useCounterReceipts from "../../sale/_hooks/use-counter-receipts";
import { CounterSentOrdersList } from "../../sale/_components/counter-sent-orders-list";
import CounterOrderCheckout from "../../sale/_components/counter-order-checkout";
import SentOrderDetails from "../../sale/_components/sent-order-details";
import type { DraftScope } from "../../sale/_hooks/use-counter-draft";
import { QrSentOrdersList } from "./_components/qr-sent-orders-list";
import { useQrSentOrders } from "./_hooks/use-qr-sent-orders";

export default function SentOrdersPage() {
  // EN: These filters are independent of the persisted, unsent cashier cart.
  // FI: Nämä suodattimet ovat riippumattomia tallennetusta, lähettämättömästä kassan ostoskorista.
  const [table, setTable] = useState(1);
  const [serviceType, setServiceType] = useState<"DINE_IN" | "TAKEAWAY" | "QR">(
    "DINE_IN",
  );
  const scope: DraftScope = serviceType === "TAKEAWAY" ? "TAKEAWAY" : table;
  const orders = useCounterSentOrders(scope, serviceType !== "QR");
  const qrOrders = useQrSentOrders(serviceType === "QR");
  const receipts = useCounterReceipts();
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [payableOrder, setPayableOrder] = useState<SentCounterOrder | null>(
    null,
  );
  const [lastBillId, setLastBillId] = useState<number | null>(null);
  const [pending, setPending] = useState<SavedCounterPayment[]>([]);
  const [pendingError, setPendingError] = useState("");
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);
  const busy =
    checkoutBusy ||
    receipts.receiptBusy ||
    orders.sentOrderCancelling ||
    orders.sentOrderServing ||
    refundBusy ||
    qrOrders.workingId !== null;

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setPending(listPendingCounterPayments());
        setPendingError("");
      } catch {
        setPendingError(
          "Tallennettuja maksuja ei voitu lukea. Tarkista maksujen tila ennen uutta yritystä.",
        );
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [checkoutBusy]);

  const resetList = () => {
    orders.invalidateSentOrders();
    orders.closeSentOrderDetail();
    orders.setSentOrders([]);
    setPayableOrder(null);
  };

  const filters = (
    <div className="flex flex-wrap items-end gap-4">
      <div
        role="group"
        aria-label="Tilaustapa"
        className="flex flex-wrap gap-2"
      >
        {(["DINE_IN", "TAKEAWAY", "QR"] as const).map((type) => (
          <Button
            className="min-h-11"
            key={type}
            variant={serviceType === type ? "default" : "outline"}
            aria-pressed={serviceType === type}
            disabled={busy}
            onClick={() => {
              if (serviceType === type) return;
              resetList();
              setServiceType(type);
            }}
          >
            {type === "DINE_IN"
              ? "Paikan päällä"
              : type === "TAKEAWAY"
                ? "Mukaan"
                : "QR-tilaukset"}
          </Button>
        ))}
      </div>
      {serviceType === "DINE_IN" && (
        <div className="w-32">
          <label htmlFor="sent-table" className="text-sm">
            Pöytä
          </label>
          <Input
            className="h-11"
            id="sent-table"
            type="number"
            min="1"
            step="1"
            value={Number.isFinite(table) ? table : ""}
            disabled={busy}
            onChange={(event) => {
              resetList();
              setTable(Number(event.target.value));
            }}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="min-w-0 max-w-6xl space-y-5">
      <PageHeader
        title="Keittiöön lähetetyt"
        actions={
          <RefreshButton
            type="button"
            disabled={busy}
            onClick={() =>
              void (serviceType === "QR"
                ? qrOrders.refresh()
                : orders.refreshSentOrders())
            }
          >
            Päivitä
          </RefreshButton>
        }
      />
      {pendingError && (
        <p role="alert" className="text-destructive">
          {pendingError}
        </p>
      )}
      {pending.length > 0 && (
        <section
          aria-label="Epäselvät tilausmaksut"
          className="space-y-2 rounded-lg border p-4"
        >
          <p>
            Tarkista aiemman maksun tulos alkuperäisillä tiedoilla ennen uutta
            yritystä.
          </p>
          <div className="flex flex-wrap gap-2">
            {pending.map((saved) => (
              <Button
                key={saved.order.id}
                disabled={busy}
                onClick={() => setPayableOrder(saved.order)}
              >
                Tarkista maksu #{saved.order.id}
              </Button>
            ))}
          </div>
        </section>
      )}
      {lastBillId !== null && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
        >
          <span>Maksu tallennettu · kuitti #{lastBillId}</span>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void receipts.printPaidSentOrder(lastBillId)}
          >
            Tulosta kuitti uudelleen #{lastBillId}
          </Button>
        </div>
      )}
      {serviceType === "QR" ? (
        <QrSentOrdersList filters={filters} busy={busy} queue={qrOrders} />
      ) : (
        <CounterSentOrdersList
          filters={filters}
          sentOrders={orders.sentOrders}
          checkoutBusy={busy}
          receiptBusy={receipts.receiptBusy}
          cartBusy={orders.sentLoading}
          loading={orders.sentLoading}
          error={orders.sentListError}
          onOpenOrder={(id) => {
            setCancelOrderId(null);
            void orders.loadSentOrderDetail(id);
          }}
          onCancelOrder={(id) => {
            setCancelOrderId(id);
            void orders.loadSentOrderDetail(id);
          }}
          onServeOrder={(order) => void orders.serveSentOrder(order)}
          onPayOrder={setPayableOrder}
          onPrintPrebill={(id) => void receipts.printSentOrder(id)}
          onPrintReceipt={(id) => void receipts.printPaidSentOrder(id)}
        />
      )}
      {payableOrder && (
        <CounterOrderCheckout
          key={payableOrder.id}
          order={payableOrder}
          onClose={() => setPayableOrder(null)}
          onBusyChange={setCheckoutBusy}
          onRefresh={orders.refreshSentOrders}
          onPaid={async (billId) => {
            setPayableOrder(null);
            setLastBillId(billId);
            await orders.refreshSentOrders();
            try {
              await receipts.printBillAfterPay(billId);
            } catch {
              toast.warning("Maksu tallennettu", {
                description: `Kuitti #${billId} tallennettiin. Yritä avata kuitti uudelleen.`,
              });
            }
          }}
        />
      )}
      <SentOrderDetails
        key={orders.selectedSentOrderId ?? "closed"}
        orderId={orders.selectedSentOrderId}
        detail={orders.sentOrderDetail}
        error={orders.sentOrderError}
        cancelling={orders.sentOrderCancelling}
        serving={orders.sentOrderServing}
        refundBusy={refundBusy}
        onRefundBusyChange={setRefundBusy}
        onRefundChanged={orders.refreshSelectedSentOrder}
        initialCancelOpen={
          cancelOrderId !== null && cancelOrderId === orders.selectedSentOrderId
        }
        onClose={orders.closeSentOrderDetail}
        onRetry={() => {
          if (orders.selectedSentOrderId !== null)
            void orders.loadSentOrderDetail(orders.selectedSentOrderId);
        }}
        onCancel={(reason) => void orders.cancelSentOrder(reason)}
        onServe={() => void orders.serveSentOrder()}
      />
      <ReceiptPreview
        billUrl={receipts.billUrl}
        kind={receipts.receiptKind}
        onClose={receipts.closeReceipt}
        lastCompletedBillId={receipts.receiptBillId}
        onReprint={() => {
          if (receipts.receiptBillId !== null)
            void receipts.printPaidSentOrder(receipts.receiptBillId);
        }}
      />
    </div>
  );
}
