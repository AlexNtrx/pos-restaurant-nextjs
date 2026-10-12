import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import {
  euroCents,
  centsEuros,
  isEuroAmount,
  moneyDifference,
  moneySum,
} from "@/lib/money";

type CheckoutModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  payType: "cash" | "bank";
  receivedAmount: number;
  checkoutBusy: boolean;
  receiptBusy: boolean;
  onSelectPaymentType: (payType: "cash" | "bank") => void;
  onChangeReceivedAmount: (amount: number) => void;
  onReceivedAmountInput: (value: string) => void;
  onCompletePayment: () => void;
  orderId?: number;
  paymentDetailsLocked?: boolean;
  title?: string;
  allowZeroTotal?: boolean;
  errorMessage?: string;
};

const euros = (value: number) =>
  `${value.toLocaleString("fi-FI", { minimumFractionDigits: 2 })} €`;

export default function CheckoutModal({
  open,
  onOpenChange,
  total,
  payType,
  receivedAmount,
  checkoutBusy,
  receiptBusy,
  onSelectPaymentType,
  onChangeReceivedAmount,
  onReceivedAmountInput,
  onCompletePayment,
  orderId,
  paymentDetailsLocked = false,
  title,
  allowZeroTotal = false,
  errorMessage,
}: CheckoutModalProps) {
  const [cashInput, setCashInput] = useState<{
    text: string;
    source: number;
  } | null>(null);
  const cashText =
    cashInput?.source === receivedAmount
      ? cashInput.text
      : String(receivedAmount);
  const cashCents = euroCents(cashText);
  const validMoney = isEuroAmount(total) && isEuroAmount(receivedAmount);
  let change = 0;
  let validChange = true;
  // EN: Even valid large inputs may yield change that cannot round-trip as an exact EUR JSON number.
  // FI: Myös kelvolliset suuret syötteet voivat tuottaa vaihtorahan, joka ei säily tarkkana JSON-euromääränä.
  if (payType === "cash" && validMoney) {
    try {
      change = Math.max(0, moneyDifference(receivedAmount, total));
    } catch {
      validChange = false;
    }
  }
  const quickAmounts = [10, 20, 50, 100].map((amount) => {
    // EN: Disable additions that cannot retain exact EUR cents rather than overflowing a payment input.
    // FI: Estä lisäykset, jotka eivät säilytä tarkkoja eurosenttejä, jotta maksukenttä ei ylivuoda.
    let next: number | null = null;
    try {
      next = moneySum([receivedAmount, amount]);
    } catch {
      next = null;
    }
    return { amount, next };
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (checkoutBusy || paymentDetailsLocked) return;
        setCashInput(null);
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] min-w-0 overflow-y-auto p-4 sm:max-w-[560px] sm:p-6"
      >
        <DialogHeader className="gap-3">
          <DialogTitle className="font-sans !text-xl !leading-6">
            {title ?? `Maksu${orderId ? ` · #${orderId}` : ""}`}
          </DialogTitle>
          <DialogDescription>
            {paymentDetailsLocked
              ? "Maksun tulos on epävarma. Yritä uudelleen samoilla tiedoilla."
              : "Tarkista summa ja valitse maksutapa."}
          </DialogDescription>
        </DialogHeader>
        {errorMessage && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}
        {!validChange && (
          <p role="alert" className="text-sm text-destructive">
            Summa on liian suuri tarkalle vaihtorahalle. Korjaa vastaanotettu
            summa.
          </p>
        )}
        <div>
          <p className="m-0 text-xs text-muted-foreground">Maksettava</p>
          <p className="m-0 mt-1 text-2xl font-semibold text-action">
            {euros(total)}
          </p>
        </div>
        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-xs text-muted-foreground">
            Maksutapa
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              aria-label="Käteinen"
              aria-pressed={payType === "cash"}
              className={
                payType === "cash"
                  ? "h-[54px] justify-start border-action bg-muted"
                  : "h-[54px] justify-start"
              }
              disabled={checkoutBusy || paymentDetailsLocked}
              onClick={() => onSelectPaymentType("cash")}
            >
              Käteinen
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-label="Pankki"
              aria-pressed={payType === "bank"}
              className={
                payType === "bank"
                  ? "h-[54px] justify-start border-action bg-muted"
                  : "h-[54px] justify-start"
              }
              disabled={checkoutBusy || paymentDetailsLocked}
              onClick={() => onSelectPaymentType("bank")}
            >
              Pankki
            </Button>
          </div>
        </fieldset>
        {payType === "cash" ? (
          <div>
            <label
              htmlFor="pos-received"
              className="text-xs text-muted-foreground"
            >
              Vastaanotettu
            </label>
            {/* EN: Stack cash controls on small screens so their minimum widths cannot expand the dialog. */}
            {/* FI: Pinoa käteiskentät pienillä näytöillä, jotta niiden vähimmäisleveydet eivät laajenna ikkunaa. */}
            <div className="mt-1 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(120px,1fr)_auto]">
              <Input
                id="pos-received"
                type="text"
                inputMode="decimal"
                className="h-11 text-base"
                value={cashText}
                aria-invalid={cashCents === null}
                disabled={checkoutBusy || paymentDetailsLocked}
                onChange={(event) => {
                  const text = event.target.value;
                  const cents = euroCents(text);
                  const source =
                    cents === null ? receivedAmount : centsEuros(cents);
                  setCashInput({ text, source });
                  if (cents !== null) onReceivedAmountInput(String(source));
                }}
              />
              <div className="grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-4">
                {quickAmounts.map(({ amount, next }) => (
                  <Button
                    key={amount}
                    type="button"
                    variant="outline"
                    disabled={
                      checkoutBusy || paymentDetailsLocked || next === null
                    }
                    onClick={() => {
                      if (next === null) return;
                      setCashInput(null);
                      onChangeReceivedAmount(next);
                    }}
                    className="min-h-11 !bg-[#f1efea]"
                  >
                    {amount} €
                  </Button>
                ))}
              </div>
            </div>
            {cashCents === null && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                Syötä euromäärä, jossa on enintään kaksi desimaalia.
              </p>
            )}
          </div>
        ) : null}
        <div>
          <p className="m-0 text-xs text-muted-foreground">Vaihtoraha</p>
          <p className="m-0 mt-1 text-xl font-semibold text-[#5f7f65]">
            {euros(change)}
          </p>
        </div>
        <p className="m-0 text-xs text-muted-foreground">
          {payType === "cash"
            ? `Vähimmäissumma on ${euros(total)}. Tarkista käteinen ennen vahvistusta.`
            : "Kortti- tai tilisiirto vahvistetaan pankkimaksuna."}
        </p>
        <DialogFooter className="-mx-4 -mb-4 mt-2 gap-4 p-4 sm:-mx-6 sm:-mb-6 sm:p-6">
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={checkoutBusy || paymentDetailsLocked}
            >
              Peruuta
            </Button>
          </DialogClose>
          <Button
            type="button"
            aria-label="Maksa"
            className="min-h-11"
            disabled={
              checkoutBusy ||
              receiptBusy ||
              !validMoney ||
              !validChange ||
              (payType === "cash" && cashCents === null) ||
              total < 0 ||
              (total === 0 && orderId == null && !allowZeroTotal) ||
              (payType === "cash" && receivedAmount < total)
            }
            onClick={onCompletePayment}
          >
            {checkoutBusy ? "Käsitellään…" : "Maksa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
