"use client";

import { isAxiosError } from "axios";
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
import {
  fetchOrderPages,
  type StaffOrder,
} from "@/app/backoffice/orders/inbox/_lib/staff-orders";
import CheckoutModal from "@/app/backoffice/sale/_components/checkout-modal";
import ReceiptPreview from "@/app/backoffice/sale/_components/receipt-preview";
import api from "@/lib/api";
import { readAuthSession } from "@/lib/auth-session";
import { parseCheckoutResult } from "@/lib/sale-contracts";

type Attempt = {
  tableNo: number;
  orders: { id: number; version: number }[];
  idempotencyKey: string;
  payType: "cash" | "bank";
  inputMoney?: number;
  total: number;
};
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
const attemptKey = (sessionId: number) => {
  const userId = readAuthSession()?.userId;
  return userId && /^[1-9]\d*$/.test(userId)
    ? `table-payment:v1:${userId}:${sessionId}`
    : null;
};
export const listPendingTablePayments = (): {
  sessionId: number;
  tableNo: number;
}[] => {
  const userId = readAuthSession()?.userId;
  if (!userId || !/^[1-9]\d*$/.test(userId)) return [];
  const prefix = `table-payment:v1:${userId}:`;
  const pending: { sessionId: number; tableNo: number }[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const sessionId = Number(key.slice(prefix.length));
    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) continue;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
      const tableNo =
        saved &&
        typeof saved === "object" &&
        Number.isSafeInteger((saved as Record<string, unknown>).tableNo)
          ? Number((saved as Record<string, unknown>).tableNo)
          : 0;
      pending.push({ sessionId, tableNo });
    } catch {
      pending.push({ sessionId, tableNo: 0 });
    }
  }
  return pending;
};
const validAttempt = (value: unknown): value is Attempt => {
  if (!value || typeof value !== "object") return false;
  const attempt = value as Record<string, unknown>;
  return (
    Array.isArray(attempt.orders) &&
    Number.isSafeInteger(attempt.tableNo) &&
    Number(attempt.tableNo) > 0 &&
    attempt.orders.length > 0 &&
    attempt.orders.every(
      (item) =>
        item &&
        Number.isSafeInteger(item.id) &&
        item.id > 0 &&
        Number.isSafeInteger(item.version) &&
        item.version > 0,
    ) &&
    typeof attempt.idempotencyKey === "string" &&
    /^[0-9a-f-]{36}$/i.test(attempt.idempotencyKey) &&
    (attempt.payType === "cash" || attempt.payType === "bank") &&
    Number.isSafeInteger(attempt.total) &&
    Number(attempt.total) >= 0 &&
    (attempt.inputMoney === undefined ||
      (Number.isSafeInteger(attempt.inputMoney) &&
        Number(attempt.inputMoney) >= 0))
  );
};

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
  const [receiptUrl, setReceiptUrl] = useState("");
  const attempt = useRef<Attempt | null>(null);
  const inFlight = useRef(false);

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

  useEffect(
    () => () => {
      if (receiptUrl) URL.revokeObjectURL(receiptUrl);
    },
    [receiptUrl],
  );

  const active = orders.filter(payable);
  const total = active.reduce((sum, order) => sum + order.total, 0);
  const allServed =
    active.length > 0 && active.every((order) => order.status === "SERVED");
  const displayTotal = pendingTotal ?? total;

  const showReceipt = async (billId: number) => {
    const response = await api.post(
      "/saleTemp/printBillAfterPay",
      { billId },
      { responseType: "blob" },
    );
    if (
      !String(response.headers["content-type"] || "").includes(
        "application/pdf",
      ) ||
      !(response.data instanceof Blob)
    )
      throw new Error("Virheellinen kuittivastaus");
    setReceiptUrl(URL.createObjectURL(response.data));
  };

  const pay = async () => {
    if (inFlight.current || invalidSaved) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
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
      const response = await api.post(
        `/table-sessions/${sessionId}/settle`,
        payload,
      );
      const result = parseCheckoutResult(response.data);
      if (!result)
        throw new Error("Palvelin palautti virheellisen maksuvastauksen.");
      const key = attemptKey(sessionId);
      if (key) localStorage.removeItem(key);
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
      const status = isAxiosError(reason) ? reason.response?.status : undefined;
      const definite =
        status != null && [400, 401, 403, 404, 409].includes(status);
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
