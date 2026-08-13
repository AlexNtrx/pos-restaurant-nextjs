"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import {
  isDailySalesResponse,
  isMonthlySalesResponse,
  type DailySalesRow,
  type MonthlySalesRow,
} from "@/lib/report-contracts";

type ReportKind = "daily" | "monthly";
const months = [
  "Tammikuu",
  "Helmikuu",
  "Maaliskuu",
  "Huhtikuu",
  "Toukokuu",
  "Kesäkuu",
  "Heinäkuu",
  "Elokuu",
  "Syyskuu",
  "Lokakuu",
  "Marraskuu",
  "Joulukuu",
];
const currencyFormatter = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});

export function SalesReportPage({ kind }: { kind: ReportKind }) {
  const now = new Date();
  const years = Array.from(
    { length: 5 },
    (_, index) => now.getFullYear() - index,
  );
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [rows, setRows] = useState<(DailySalesRow | MonthlySalesRow)[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "forbidden"
  >("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const response =
        kind === "daily"
          ? await api.post("/report/dailySales", {
              year: Number(year),
              month: Number(month),
            })
          : await api.post("/report/sumMonthly", { year: Number(year) });
      const valid =
        kind === "daily"
          ? isDailySalesResponse(response.data)
          : isMonthlySalesResponse(response.data);
      if (!valid)
        throw new Error("Palvelin palautti virheellisiä raporttitietoja.");
      setRows(response.data.results);
      setTotal(response.data.totalAmount);
      setStatus("ready");
    } catch (reason: unknown) {
      setError(getApiErrorMessage(reason, "Raporttia ei voitu ladata."));
      setStatus(isPermissionDeniedError(reason) ? "forbidden" : "error");
    }
  }, [kind, month, year]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const title = kind === "daily" ? "Päivämyynti" : "Kuukausimyynti";
  const description =
    kind === "daily"
      ? "Myynti päivittäin valitulta kuukaudelta."
      : "Myynti kuukausittain valitulta vuodelta.";

  return (
    <div className="tw04-layout space-y-6 font-sans">
      <PageHeader
        title={title}
        description={description}
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
        aria-label="Raportin suodattimet"
        className="grid items-end gap-3 bg-surface p-4 sm:grid-cols-[220px_220px_auto]"
      >
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Vuosi
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((item) => (
                <SelectItem key={item} value={String(item)}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {kind === "daily" && (
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Kuukausi
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((item, index) => (
                  <SelectItem key={item} value={String(index + 1)}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
        <Button
          size="sm"
          onClick={() => void load()}
          disabled={status === "loading"}
        >
          Näytä
        </Button>
      </section>
      <Card size="sm" className="max-w-sm shadow-none">
        <CardHeader>
          <CardTitle className="font-sans text-base">Kokonaismyynti</CardTitle>
          <CardDescription>
            {kind === "daily" ? `${months[Number(month) - 1]} ${year}` : year}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-medium">
            {currencyFormatter.format(total)}
          </p>
        </CardContent>
      </Card>
      {status === "loading" ? (
        <LoadingState title="Raporttia ladataan" />
      ) : status === "forbidden" ? (
        <ErrorState
          title="Ei käyttöoikeutta"
          description="Sinulla ei ole oikeutta tarkastella tätä raporttia."
        />
      ) : status === "error" ? (
        <ErrorState
          title="Raporttia ei voitu ladata"
          description={error}
          action={<Button onClick={() => void load()}>Yritä uudelleen</Button>}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Myyntiä ei löytynyt"
          description="Valitulla ajanjaksolla ei ole kirjattua myyntiä."
        />
      ) : (
        <Table className="min-w-[520px] text-[13px]">
          <TableHeader className="bg-[#efece6]">
            <TableRow className="h-12 hover:bg-transparent">
              <TableHead>{kind === "daily" ? "Päivä" : "Kuukausi"}</TableHead>
              <TableHead className="text-right">Myynti</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const key = "date" in row ? row.date : row.month;
              const label =
                "date" in row
                  ? new Intl.DateTimeFormat("fi-FI", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      timeZone: "Europe/Helsinki",
                    }).format(new Date(`${row.date}T12:00:00+03:00`))
                  : months[Number(row.month) - 1];
              return (
                <TableRow key={key} className="h-14">
                  <TableCell>{label}</TableCell>
                  <TableCell className="text-right font-medium">
                    {currencyFormatter.format(row.amount)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Yhteensä</TableCell>
              <TableCell className="text-right">
                {currencyFormatter.format(total)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}
      <p className="text-[11px] text-muted-foreground">
        Aikavyöhyke: Europe/Helsinki · Valuutta: EUR
      </p>
    </div>
  );
}
