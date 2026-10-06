"use client";

import { isMutationRejected } from "@/lib/mutation-outcome";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { fetchOrderPages } from "@/lib/orders/client";
import { type StaffOrder } from "@/lib/orders/contracts";
import CheckoutModal from "@/components/payments/checkout-modal";
import { useReceiptPreview } from "@/components/receipts/use-receipt-preview";
import ReceiptPreview from "@/components/receipts/receipt-preview";
import api from "@/lib/api";
import {
  attemptKey,
  validAttempt,
  type Attempt,
} from "@/lib/payments/table-payment-attempt";
import { parseCheckoutResult } from "@/lib/sale-contracts";

type Props = {
  sessionId: number;
  tableNo: number;
  onClose: () => void;
  onSettled: () => Promise<void>;
};

const payable = (order: StaffOrder) =>
  !["REJECTED", "CANCELLED", "PAID", "COMPLETED"].includes(order.status);
const euros = (amount: number) =>
  `${amount.toLocaleString("fi-FI", { minimumFractionDigits: 2 })} €`;
export default function TableSessionCheckout({
  sessionId,
  tableNo,
  onClose,
  onSettled,
}: Props) {
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"summary" | "payment" | "paid">("summary");
  const [payType, setPayType] = useState<"cash" | "bank">("cash");
  const [received, setReceived] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [pendingTotal, setPendingTotal] = useState<number | null>(null);
  const [invalidSaved, setInvalidSaved] = useState(false);
  const [paidBillId, setPaidBillId] = useState<number | null>(null);
  const { url: receiptUrl, load: loadReceipt } = useReceiptPreview();
  const attempt = useRef<Attempt | null>(null);
  const inFlight = useRef(false);
  const ownerKeyRef = useRef(attemptKey(sessionId));

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const page = await fetchOrderPages({ tableSessionId: sessionId });
      if (page.results.some((order) => order.tableSessionId !== sessionId))
        throw new Error("Palvelin palautti toisen istunnon tilauksia.");
      setOrders(page.results.filter(payable));
      setError("");
      setLoadState("ready");
    } catch {
      setError("Istunnon tilauksia ei voitu ladata. Yritä uudelleen.");
      setLoadState("error");
    }
  }, [sessionId]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  useEffect(() => {
    const key = attemptKey(sessionId);
    if (!key) return;
    const id = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const saved: unknown = JSON.parse(raw);
        if (!validAttempt(saved)) throw new Error("Invalid payment attempt");
        // EN: An unknown result survives reload; retrying the exact request is the only safe next payment action.
        // FI: Epävarma maksutulos säilyy uudelleenlatauksessa; vain saman pyynnön uusiminen on turvallinen seuraava maksutoimi.
        attempt.current = saved;
        setPendingTotal(saved.total);
        setPayType(saved.payType);
        setReceived(saved.inputMoney ?? saved.total);
        setUncertain(true);
        setPhase("payment");
      } catch {
        setInvalidSaved(true);
        setError(
          "Tallennettu maksuyritys on virheellinen. Tarkista maksun tila ennen uutta yritystä.",
        );
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [sessionId]);

  const active = orders.filter(payable);
  const total = active.reduce((sum, order) => sum + order.total, 0);
  const allServed =
    active.length > 0 && active.every((order) => order.status === "SERVED");
  const displayTotal = pendingTotal ?? total;

  const showReceipt = (billId: number) =>
    loadReceipt("/saleTemp/printBillAfterPay", { billId });

  const pay = async () => {
    if (inFlight.current || invalidSaved) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const ownerKey = ownerKeyRef.current;
    const assertOwner = () => {
      if (!ownerKey || attemptKey(sessionId) !== ownerKey)
        throw new Error(
          "Käyttäjä vaihtui. Tarkista maksu alkuperäisellä käyttäjällä.",
        );
    };
    try {
      if (!attempt.current) {
        const key = attemptKey(sessionId);
        if (!key) throw new Error("Kirjaudu uudelleen ennen maksua.");
        const page = await fetchOrderPages({ tableSessionId: sessionId });
        const current = page.results.filter(payable);
        if (
          current.length === 0 ||
          current.some(
            (order) =>
              order.tableSessionId !== sessionId || order.status !== "SERVED",
          )
        )
          throw new Error("Kaikki tilaukset on tarjoiltava ennen maksua.");
        const freshTotal = current.reduce((sum, order) => sum + order.total, 0);
        if (!Number.isSafeInteger(freshTotal) || freshTotal !== total)
          throw new Error("Loppusumma muuttui. Päivitä pöydän tilaukset.");
        if (payType === "cash" && received < freshTotal)
          throw new Error("Vastaanotettu käteinen ei riitä.");
        const next: Attempt = {
          tableNo,
          orders: current
            .map((order) => ({ id: order.id, version: order.version }))
            .sort((left, right) => left.id - right.id),
          idempotencyKey: crypto.randomUUID(),
          payType,
          ...(payType === "cash" ? { inputMoney: received } : {}),
          total: freshTotal,
        };
        // EN: Persist the exact payment intent before sending; an interrupted response must not create a new key.
        // FI: Tallenna täsmällinen maksupyyntö ennen lähetystä; katkennut vastaus ei saa luoda uutta avainta.
        assertOwner();
        localStorage.setItem(key, JSON.stringify(next));
        attempt.current = next;
        setPendingTotal(next.total);
      }
      const pending = attempt.current;
      if (!pending) throw new Error("Maksuyritys puuttuu.");
      const payload = {
        orders: pending.orders,
        idempotencyKey: pending.idempotencyKey,
        payType: pending.payType,
        ...(pending.inputMoney === undefined
          ? {}
          : { inputMoney: pending.inputMoney }),
      };
      assertOwner();
      const response = await api.post(
        `/table-sessions/${sessionId}/settle`,
        payload,
      );
      const result = parseCheckoutResult(response.data);
      if (!result)
        throw new Error("Palvelin palautti virheellisen maksuvastauksen.");
      assertOwner();
      localStorage.removeItem(ownerKey!);
      attempt.current = null;
      setPendingTotal(null);
      setUncertain(false);
      setPaidBillId(result.billId);
      setPhase("paid");
      try {
        await onSettled();
      } catch {
        toast.warning("Maksu tallennettiin. Päivitä pöytälista.");
      }
      try {
        await showReceipt(result.billId);
      } catch {
        toast.warning(
          `Maksu tallennettiin laskulle #${result.billId}. Yritä avata kuitti uudelleen.`,
        );
      }
    } catch (reason: unknown) {
      const definite =
        isMutationRejected(reason) && attemptKey(sessionId) === ownerKey;
      if (definite) {
        const key = attemptKey(sessionId);
        if (key) localStorage.removeItem(key);
        attempt.current = null;
        setPendingTotal(null);
        setUncertain(false);
        setPhase("summary");
        void load();
      } else if (attempt.current) {
        setUncertain(true);
      }
      setError(
        definite
          ? "Maksu hylättiin. Tarkista tilausten tila ja päivitä tiedot."
          : attempt.current
            ? "Maksun tulos on epävarma. Yritä uudelleen samoilla tiedoilla."
            : reason instanceof Error
              ? reason.message
              : "Maksua ei voitu aloittaa.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog
        open={phase === "summary"}
        onOpenChange={(open) => !open && onClose()}
      >
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Pöytä {tableNo} · istunnon maksu</DialogTitle>
            <DialogDescription>
              Kaikki saman istunnon tilaukset maksetaan yhdellä laskulla.
              Keskeneräiset tilaukset estävät maksun.
            </DialogDescription>
          </DialogHeader>
          {invalidSaved ? (
            <ErrorState
              title="Maksun tila vaatii tarkistuksen"
              description={error}
            />
          ) : loadState === "loading" ? (
            <LoadingState title="Tilauksia ladataan" />
          ) : loadState === "error" ? (
            <ErrorState
              title="Tilauksia ei voitu ladata"
              description={error}
              action={
                <Button onClick={() => void load()}>Yritä uudelleen</Button>
              }
            />
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto text-sm">
              {active.length === 0 ? (
                <p>Istunnossa ei ole maksamattomia tilauksia.</p>
              ) : (
                active.map((order) => (
                  <div
                    key={order.id}
                    className="flex justify-between gap-3 border-b py-2"
                  >
                    <span>
                      #{order.id} · {order.status} ·{" "}
                      {order.items
                        .map((item) => `${item.name} × ${item.quantity}`)
                        .join(", ")}
                    </span>
                    <span className="shrink-0">{euros(order.total)}</span>
                  </div>
                ))
              )}
            </div>
          )}
          {error && loadState === "ready" && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <p className="text-lg font-semibold">Yhteensä {euros(total)}</p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={busy}
            >
              Päivitä
            </Button>
            <Button
              disabled={
                !allServed || busy || invalidSaved || loadState !== "ready"
              }
              onClick={() => setPhase("payment")}
            >
              Siirry maksuun
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CheckoutModal
        open={phase === "payment"}
        title={`Pöytä ${tableNo} · maksu`}
        allowZeroTotal
        onOpenChange={(open) => !open && setPhase("summary")}
        total={displayTotal}
        payType={payType}
        receivedAmount={received}
        checkoutBusy={busy}
        receiptBusy={false}
        paymentDetailsLocked={uncertain}
        errorMessage={error}
        onSelectPaymentType={(value) => {
          setPayType(value);
          setReceived(value === "bank" ? total : 0);
        }}
        onChangeReceivedAmount={setReceived}
        onReceivedAmountInput={(value) => {
          const amount = Number(value);
          setReceived(Number.isSafeInteger(amount) && amount >= 0 ? amount : 0);
        }}
        onCompletePayment={() => void pay()}
      />

      {phase === "paid" && !receiptUrl && (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Maksu tallennettu · #{paidBillId}</DialogTitle>
              <DialogDescription>
                Istunto suljettiin. Kuitti voidaan avata uudelleen.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Sulje
              </Button>
              <Button
                onClick={() => paidBillId && void showReceipt(paidBillId)}
              >
                Avaa kuitti
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {phase === "paid" && receiptUrl && (
        <ReceiptPreview
          billUrl={receiptUrl}
          kind="paid"
          lastCompletedBillId={paidBillId}
          onClose={onClose}
          onReprint={() => paidBillId && void showReceipt(paidBillId)}
        />
      )}
    </>
  );
}
