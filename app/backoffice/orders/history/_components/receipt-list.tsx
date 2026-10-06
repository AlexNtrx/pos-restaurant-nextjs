import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import type { BillHeader } from "@/lib/receipts/bill-history-contract";
dayjs.extend(utc);
dayjs.extend(timezone);
const businessTimeZone = "Europe/Helsinki";
const currencyFormatter = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});

export function ReceiptList({
  bills,
  openBill,
}: {
  bills: BillHeader[];
  openBill: (bill: BillHeader) => Promise<void>;
}) {
  return (
    <Table className="min-w-[800px] text-[13px]">
      <TableHeader className="bg-[#efece6] text-muted-foreground">
        <TableRow className="h-12 hover:bg-transparent">
          <TableHead>Kuitti</TableHead>
          <TableHead>Myyjä</TableHead>
          <TableHead>Pöytä</TableHead>
          <TableHead>Summa</TableHead>
          <TableHead>Tila</TableHead>
          <TableHead className="text-right">Toiminto</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bills.map((bill) => (
          <TableRow
            key={bill.id}
            className={
              bill.status === "cancelled"
                ? "bg-[#efece6] text-muted-foreground"
                : "h-14 bg-surface"
            }
          >
            <TableCell className="font-medium">
              #{bill.id} ·{" "}
              {dayjs(bill.payDate)
                .tz(businessTimeZone)
                .format("DD.MM.YYYY HH:mm")}
            </TableCell>
            <TableCell>{bill.User.name}</TableCell>
            <TableCell>
              {bill.serviceType === "TAKEAWAY"
                ? `Nouto #${bill.Orders[0]?.id ?? "?"}`
                : bill.tableNo}
            </TableCell>
            <TableCell className="font-medium">
              {currencyFormatter.format(bill.amount)}
            </TableCell>
            <TableCell>
              <StatusBadge
                tone={bill.status === "use" ? "success" : "danger"}
                className={
                  bill.status === "use"
                    ? "h-10 border-0 bg-[#e8efe6] text-[#5f765b]"
                    : "h-10 border-0 bg-[#f2e6e3]"
                }
              >
                {bill.status === "use" ? "Voimassa" : "Peruttu"}
              </StatusBadge>
              {bill.refundSummary.map((refund) => (
                <p key={refund.status} className="mt-1 text-xs">
                  {refund.status === "COMPLETED"
                    ? "Palautettu"
                    : refund.status === "FAILED"
                      ? "Palautus epäonnistui"
                      : "Palautus kesken"}
                  : {currencyFormatter.format(refund.amount)}
                </p>
              ))}
            </TableCell>
            <TableCell className="text-right">
              <Button size="sm" onClick={() => void openBill(bill)}>
                Avaa
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
