"use client";

import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { useCallback, useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import {
  parseBillHistoryResponse,
  type Bill,
  type BillSummary,
} from "../../salereport/_lib/bill-history-contract";
import ReceiptPreview from "../../sale/_components/receipt-preview";

dayjs.extend(utc);
dayjs.extend(timezone);

const businessTimeZone = "Europe/Helsinki";
const currencyFormatter = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});
const emptySummary: BillSummary = {
  activeCount: 0,
  activeAmount: 0,
  cancelledCount: 0,
  cancelledAmount: 0,
};

export default function ReceiptHistoryPage() {
  const today = dayjs().tz(businessTimeZone).format("YYYY-MM-DD");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [bills, setBills] = useState<Bill[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState("");
  const receiptUrlRef = useRef("");
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "forbidden"
  >("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (fromDate > toDate) {
      setError("Alkupäivä ei voi olla päättymispäivän jälkeen.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const response = await api.post("/billSale/list", {
        startDate: fromDate,
        endDate: toDate,
      });
      const parsed = parseBillHistoryResponse(response.data);
      if (!parsed)
        throw new Error("Palvelin palautti virheellisen kuittihistorian.");
      setBills(parsed.results);
      setSummary(parsed.summary);
      setStatus("ready");
    } catch (reason: unknown) {
      setError(getApiErrorMessage(reason, "Kuittihistoriaa ei voitu ladata."));
      setStatus(isPermissionDeniedError(reason) ? "forbidden" : "error");
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    const requestId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(requestId);
  }, [load]);

  useEffect(
    () => () => {
      if (receiptUrlRef.current) URL.revokeObjectURL(receiptUrlRef.current);
    },
    [],
  );

  const closeReceipt = () => {
    if (receiptUrlRef.current) URL.revokeObjectURL(receiptUrlRef.current);
    receiptUrlRef.current = "";
    setReceiptUrl("");
  };

  // EN: History reprints use the persisted bill snapshot; the UI offers this action only for bills listed as active.
  // FI: Historiasta tulostetaan tallennettu kuittitilanne; käyttöliittymä tarjoaa toiminnon vain voimassa oleville kuiteille.
  const reprintBill = async (bill: Bill) => {
    if (printing || bill.status !== "use") return;
    setPrinting(true);
    setPrintError("");
    try {
      const response = await api.post(
        "/saleTemp/printBillAfterPay",
        { billId: bill.id },
        { responseType: "blob" },
      );
      if (
        !String(response.headers["content-type"] || "").includes(
          "application/pdf",
        ) ||
        !(response.data instanceof Blob)
      )
        throw new Error("Palvelin palautti virheellisen kuitin.");
      const nextUrl = URL.createObjectURL(response.data);
      closeReceipt();
      receiptUrlRef.current = nextUrl;
      setReceiptUrl(nextUrl);
      setSelectedBill(null);
    } catch (reason: unknown) {
      setPrintError(getApiErrorMessage(reason, "Kuittia ei voitu tulostaa."));
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="tw04-layout space-y-6 font-sans">
      <PageHeader
        title="Kuittihistoria"
        description="Maksetut kuitit ja peruutukset. Vanhat myynnit säilyvät tässä näkymässä."
        actions={
          <Button
            size="sm"
            onClick={() => void load()}
            disabled={status === "loading"}
          >
            Päivitä
          </Button>
        }
      />

      <section
        aria-label="Kuittihistorian suodattimet"
        className="grid items-end gap-3 border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[220px_220px_auto_1fr]"
      >
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Alkaen
          <Input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Päättyen
          <Input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </label>
        <Button
          size="sm"
          onClick={() => void load()}
          disabled={status === "loading"}
        >
          Näytä
        </Button>
        <p className="text-[11px] text-muted-foreground lg:justify-self-end">
          Aikavyöhyke: {businessTimeZone}
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[10px] border border-border bg-surface p-4">
          <p className="text-xs text-muted-foreground">
            Voimassa olevat kuitit
          </p>
          <p className="mt-1 text-2xl font-medium">
            {currencyFormatter.format(summary.activeAmount)}
          </p>
          <p className="text-xs text-muted-foreground">
            {summary.activeCount} kuittia
          </p>
        </div>
        <div className="rounded-[10px] border border-border bg-surface p-4">
          <p className="text-xs text-muted-foreground">Perutut kuitit</p>
          <p className="mt-1 text-2xl font-medium text-destructive">
            {currencyFormatter.format(summary.cancelledAmount)}
          </p>
          <p className="text-xs text-muted-foreground">
            {summary.cancelledCount} kuittia
          </p>
        </div>
      </div>

      {status === "loading" ? (
        <LoadingState title="Kuitteja ladataan" />
      ) : status === "forbidden" ? (
        <ErrorState
          title="Ei käyttöoikeutta"
          description="Sinulla ei ole oikeutta tarkastella kuittihistoriaa."
        />
      ) : status === "error" ? (
        <ErrorState
          title="Kuitteja ei voitu ladata"
          description={error}
          action={<Button onClick={() => void load()}>Yritä uudelleen</Button>}
        />
      ) : bills.length === 0 ? (
        <EmptyState
          title="Kuitteja ei löytynyt"
          description="Valitulla aikavälillä ei ole kuitteja."
        />
      ) : (
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
                  {bill.Refunds?.map((refund, index) => (
                    <p key={index} className="mt-1 text-xs">
                      {refund.status === "COMPLETED"
                        ? "Palautettu"
                        : refund.status === "FAILED"
                          ? "Palautus epäonnistui"
                          : "Palautus kesken"}
                      : {currencyFormatter.format(refund.amount)}
                      {refund.reference ? ` · ${refund.reference}` : ""}
                    </p>
                  ))}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" onClick={() => setSelectedBill(bill)}>
                    Avaa
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <p className="text-[11px] text-muted-foreground">
        Valitse Avaa nähdäksesi kuitin tuotteet. Maksettujen tilausten
        peruutukset ja palautukset käsitellään Tilaushistoriassa ennen
        valmistuksen alkamista.
      </p>

      <Dialog
        open={selectedBill !== null}
        onOpenChange={(open) => {
          if (!open && !printing) {
            setSelectedBill(null);
            setPrintError("");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Kuitti #{selectedBill?.id}</DialogTitle>
            <DialogDescription>
              {selectedBill
                ? `${dayjs(selectedBill.payDate).tz(businessTimeZone).format("DD.MM.YYYY HH:mm")} · ${selectedBill.User.name}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {selectedBill?.status === "cancelled" && (
            <p className="text-sm text-destructive">
              Peruttu{" "}
              {selectedBill.cancelledAt
                ? dayjs(selectedBill.cancelledAt)
                    .tz(businessTimeZone)
                    .format("DD.MM.YYYY HH:mm")
                : ""}
              {selectedBill.CancelledBy
                ? ` · ${selectedBill.CancelledBy.name}`
                : ""}
              {selectedBill.cancelReason
                ? ` · ${selectedBill.cancelReason}`
                : ""}
            </p>
          )}
          {printError && (
            <p role="alert" className="text-sm text-destructive">
              {printError}
            </p>
          )}
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
              {selectedBill?.BillSaleDetails.map((detail) => (
                <TableRow key={detail.id}>
                  <TableCell>{detail.foodName}</TableCell>
                  <TableCell>{detail.foodSizeName || "—"}</TableCell>
                  <TableCell>{detail.tasteName || "—"}</TableCell>
                  <TableCell className="text-right">
                    {currencyFormatter.format(detail.price + detail.moneyAdded)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {selectedBill?.status === "use" && (
            <Button
              type="button"
              className="w-fit"
              disabled={printing}
              onClick={() => void reprintBill(selectedBill)}
            >
              <Printer aria-hidden="true" />
              {printing ? "Kuittia ladataan…" : "Tulosta kuitti"}
            </Button>
          )}
        </DialogContent>
      </Dialog>
      <ReceiptPreview
        billUrl={receiptUrl}
        kind="paid"
        historical
        onClose={closeReceipt}
        lastCompletedBillId={null}
      />
    </div>
  );
}
