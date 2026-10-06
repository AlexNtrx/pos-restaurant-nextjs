import { Button } from "@/components/ui/button";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ErrorState, LoadingState } from "@/components/ui/states";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import type { Bill, BillHeader } from "@/lib/receipts/bill-history-contract";
dayjs.extend(utc);
dayjs.extend(timezone);
const businessTimeZone = "Europe/Helsinki";
const currencyFormatter = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});
import { Printer } from "lucide-react";

export function ReceiptDetailDialog({
  selectedBill,
  shownBill,
  billDetail,
  printError,
  printing,
  detailStatus,
  detailError,
  openBill,
  reprintBill,
  onOpenChange,
}: {
  selectedBill: BillHeader | null;
  shownBill: Bill | BillHeader | null;
  billDetail: Bill | null;
  printError: string;
  printing: boolean;
  detailStatus: "loading" | "ready" | "error";
  detailError: string;
  openBill: (bill: BillHeader) => Promise<void>;
  reprintBill: (bill: Bill) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={selectedBill !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Kuitti #{selectedBill?.id}</DialogTitle>
          <DialogDescription>
            {selectedBill
              ? `${dayjs(selectedBill.payDate).tz(businessTimeZone).format("DD.MM.YYYY HH:mm")} · ${selectedBill.User.name}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {shownBill?.status === "cancelled" && (
          <p className="text-sm text-destructive">
            Peruttu{" "}
            {shownBill.cancelledAt
              ? dayjs(shownBill.cancelledAt)
                  .tz(businessTimeZone)
                  .format("DD.MM.YYYY HH:mm")
              : ""}
            {shownBill.CancelledBy ? ` · ${shownBill.CancelledBy.name}` : ""}
            {shownBill.cancelReason ? ` · ${shownBill.cancelReason}` : ""}
          </p>
        )}
        {printError && (
          <p role="alert" className="text-sm text-destructive">
            {printError}
          </p>
        )}
        {detailStatus === "loading" ? (
          <LoadingState title="Kuitin tietoja ladataan" />
        ) : detailStatus === "error" ? (
          <ErrorState
            title="Kuitin tietoja ei voitu ladata"
            description={detailError}
            action={
              <Button
                onClick={() => selectedBill && void openBill(selectedBill)}
              >
                Yritä uudelleen
              </Button>
            }
          />
        ) : (
          <>
            {billDetail?.Refunds?.map((refund, index) => (
              <p key={index} className="text-sm">
                {refund.status === "COMPLETED"
                  ? "Palautettu"
                  : refund.status === "FAILED"
                    ? "Palautus epäonnistui"
                    : "Palautus kesken"}
                : {currencyFormatter.format(refund.amount)} · {refund.method}
                {refund.reference ? ` · ${refund.reference}` : ""} ·{" "}
                {refund.reason}
              </p>
            ))}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tuote</TableHead>
                  <TableHead>Koko</TableHead>
                  <TableHead>Lisävalinta</TableHead>
                  <TableHead className="text-right">Hinta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {billDetail?.BillSaleDetails.map((detail) => (
                  <TableRow key={detail.id}>
                    <TableCell>{detail.foodName}</TableCell>
                    <TableCell>{detail.foodSizeName || "—"}</TableCell>
                    <TableCell>{detail.tasteName || "—"}</TableCell>
                    <TableCell className="text-right">
                      {currencyFormatter.format(
                        detail.price + detail.moneyAdded,
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {billDetail?.status === "use" && (
              <Button
                type="button"
                className="w-fit"
                disabled={printing}
                onClick={() => void reprintBill(billDetail)}
              >
                <Printer aria-hidden="true" />
                {printing ? "Kuittia ladataan…" : "Tulosta kuitti"}
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
