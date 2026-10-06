"use client";

import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReceiptList } from "./_components/receipt-list";
import { ReceiptDetailDialog } from "./_components/receipt-detail-dialog";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

import api from "@/lib/api";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import {
  parsePagedBillHistory,
  parseBillDetail,
  type Bill,
  type BillHeader,
  type BillPagination,
  type BillSummary,
} from "@/lib/receipts/bill-history-contract";
import { useReceiptPreview } from "@/components/receipts/use-receipt-preview";
import ReceiptPreview from "@/components/receipts/receipt-preview";

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
  const [bills, setBills] = useState<BillHeader[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [selectedBill, setSelectedBill] = useState<BillHeader | null>(null);
  const [billDetail, setBillDetail] = useState<Bill | null>(null);
  const [detailStatus, setDetailStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [detailError, setDetailError] = useState("");
  const [pagination, setPagination] = useState<BillPagination | null>(null);
  const listRequest = useRef<AbortController | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const {
    url: receiptUrl,
    load: loadReceipt,
    close: closeReceipt,
  } = useReceiptPreview();
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState("");

  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "forbidden"
  >("loading");
  const [error, setError] = useState("");

  // EN: Abort replaced interval/page requests and ignore their late results; refresh starts a new ID ceiling at page one.
  // FI: Keskeytä korvatut aikaväli- ja sivupyynnöt sekä ohita myöhäiset tulokset; päivitys aloittaa uuden ID-rajan ensimmäiseltä sivulta.
  const load = useCallback(
    async (page = 1, snapshotId?: number) => {
      listRequest.current?.abort();
      const controller = new AbortController();
      listRequest.current = controller;
      if (fromDate > toDate) {
        setError("Alkupäivä ei voi olla päättymispäivän jälkeen.");
        setStatus("error");
        return;
      }
      setStatus("loading");
      setError("");
      try {
        const response = await api.post(
          "/billSale/history",
          {
            startDate: fromDate,
            endDate: toDate,
            page,
            pageSize: 50,
            ...(snapshotId !== undefined ? { snapshotId } : {}),
          },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const parsed = parsePagedBillHistory(response.data);
        if (!parsed)
          throw new Error("Palvelin palautti virheellisen kuittihistorian.");
        if (
          parsed.pagination.page !== page ||
          parsed.pagination.pageSize !== 50 ||
          (snapshotId !== undefined &&
            parsed.pagination.snapshotId !== snapshotId)
        )
          throw new Error("Palvelin palautti väärän kuittisivun.");
        setBills(parsed.results);
        setSummary(parsed.summary);
        setPagination(parsed.pagination);
        setStatus("ready");
      } catch (reason: unknown) {
        if (controller.signal.aborted) return;
        setError(
          getApiErrorMessage(reason, "Kuittihistoriaa ei voitu ladata."),
        );
        setStatus(isPermissionDeniedError(reason) ? "forbidden" : "error");
      }
    },
    [fromDate, toDate],
  );

  useEffect(() => {
    const requestId = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(requestId);
      listRequest.current?.abort();
    };
  }, [load]);

  useEffect(
    () => () => {
      listRequest.current?.abort();
      detailRequest.current?.abort();
    },
    [],
  );

  // EN: Late responses from another bill or a closed dialog must never replace the currently selected snapshot.
  // FI: Toisen kuitin tai suljetun ikkunan myöhäinen vastaus ei saa korvata valittua kuittitilannetta.
  const openBill = async (bill: BillHeader) => {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setSelectedBill(bill);
    setBillDetail(null);
    setDetailStatus("loading");
    setDetailError("");
    setPrintError("");
    try {
      const response = await api.get(`/billSale/detail/${bill.id}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const parsed = parseBillDetail(response.data);
      if (!parsed || parsed.id !== bill.id)
        throw new Error("Palvelin palautti virheellisen kuitin.");
      setBillDetail(parsed);
      setDetailStatus("ready");
    } catch (reason) {
      if (controller.signal.aborted) return;
      setDetailError(
        getApiErrorMessage(reason, "Kuitin tietoja ei voitu ladata."),
      );
      setDetailStatus("error");
    }
  };
  const shownBill = billDetail ?? selectedBill;

  // EN: History reprints use the persisted bill snapshot; the UI offers this action only for bills listed as active.
  // FI: Historiasta tulostetaan tallennettu kuittitilanne; käyttöliittymä tarjoaa toiminnon vain voimassa oleville kuiteille.
  const reprintBill = async (bill: Bill) => {
    if (printing || bill.status !== "use") return;
    setPrinting(true);
    setPrintError("");
    try {
      await loadReceipt(
        "/saleTemp/printBillAfterPay",
        { billId: bill.id },
        "Palvelin palautti virheellisen kuitin.",
      );
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
            {status === "ready"
              ? currencyFormatter.format(summary.activeAmount)
              : "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {status === "ready" ? summary.activeCount : "—"} kuittia
          </p>
        </div>
        <div className="rounded-[10px] border border-border bg-surface p-4">
          <p className="text-xs text-muted-foreground">Perutut kuitit</p>
          <p className="mt-1 text-2xl font-medium text-destructive">
            {status === "ready"
              ? currencyFormatter.format(summary.cancelledAmount)
              : "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {status === "ready" ? summary.cancelledCount : "—"} kuittia
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
        <ReceiptList bills={bills} openBill={openBill} />
      )}

      {status === "ready" && pagination && (
        <nav
          aria-label="Kuittihistorian sivutus"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-sm text-muted-foreground">
            Sivu {pagination.page} / {Math.max(1, pagination.totalPages)} ·{" "}
            {pagination.totalCount} kuittia
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() =>
                void load(pagination.page - 1, pagination.snapshotId)
              }
            >
              Edellinen
            </Button>
            <Button
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() =>
                void load(pagination.page + 1, pagination.snapshotId)
              }
            >
              Seuraava
            </Button>
          </div>
        </nav>
      )}

      <p className="text-[11px] text-muted-foreground">
        Valitse Avaa nähdäksesi kuitin tuotteet. Maksettujen tilausten
        peruutukset ja palautukset käsitellään Tilaushistoriassa ennen
        valmistuksen alkamista.
      </p>

      <ReceiptDetailDialog
        selectedBill={selectedBill}
        shownBill={shownBill}
        billDetail={billDetail}
        printError={printError}
        printing={printing}
        detailStatus={detailStatus}
        detailError={detailError}
        openBill={openBill}
        reprintBill={reprintBill}
        onOpenChange={(open) => {
          if (!open && !printing) {
            detailRequest.current?.abort();
            setSelectedBill(null);
            setBillDetail(null);
            setPrintError("");
          }
        }}
      />
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
