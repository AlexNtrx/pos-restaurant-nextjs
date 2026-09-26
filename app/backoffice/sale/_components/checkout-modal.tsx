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
  const change = payType === "bank" ? 0 : Math.max(0, receivedAmount - total);
  const quickAmounts = [10, 20, 50, 100];
  return (
    <Dialog
      open={open}
      onOpenChange={(next) =>
        !checkoutBusy && !paymentDetailsLocked && onOpenChange(next)
      }
    >
      <DialogContent showCloseButton={false} className="p-6 sm:max-w-[560px]">
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
        <div>
          <p className="m-0 text-xs text-muted-foreground">Maksettava</p>
          <p className="m-0 mt-1 text-2xl font-semibold text-action">
            {euros(total)}
          </p>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-xs text-muted-foreground">
            Maksutapa
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              aria-label="Cash"
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
              aria-label="Bank Transfer"
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
            <div className="mt-1 grid grid-cols-[minmax(120px,1fr)_auto] gap-3">
              <Input
                id="pos-received"
                type="number"
                min="0"
                step="1"
                className="h-11 text-base"
                value={receivedAmount}
                disabled={checkoutBusy || paymentDetailsLocked}
                onChange={(event) => onReceivedAmountInput(event.target.value)}
              />
              <div className="flex gap-2">
                {quickAmounts.map((amount) => (
                  <Button
                    key={amount}
                    type="button"
                    variant="outline"
                    disabled={checkoutBusy || paymentDetailsLocked}
                    onClick={() =>
                      onChangeReceivedAmount(receivedAmount + amount)
                    }
                    className="!bg-[#f1efea]"
                  >
                    {amount} €
                  </Button>
                ))}
              </div>
            </div>
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
        <DialogFooter className="mt-2">
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              disabled={checkoutBusy || paymentDetailsLocked}
            >
              Peruuta
            </Button>
          </DialogClose>
          <Button
            type="button"
            aria-label="Complete Payment"
            disabled={
              checkoutBusy ||
              receiptBusy ||
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
