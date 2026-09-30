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
  isMonthlySalesResponse,
  type MonthlySalesRow,
} from "@/lib/report-contracts";

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

export function SalesReportPage() {
  const now = new Date();
  const years = Array.from(
    { length: 5 },
    (_, index) => now.getFullYear() - index,
  );
  const [year, setYear] = useState(String(now.getFullYear()));
  const [rows, setRows] = useState<MonthlySalesRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "forbidden"
  >("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const response = await api.post("/report/sumMonthly", {
        year: Number(year),
      });
      if (!isMonthlySalesResponse(response.data))
        throw new Error("Palvelin palautti virheellisiä raporttitietoja.");
      setRows(response.data.results);
      setTotal(response.data.totalAmount);
      setStatus("ready");
    } catch (reason: unknown) {
      setError(getApiErrorMessage(reason, "Raporttia ei voitu ladata."));
      setStatus(isPermissionDeniedError(reason) ? "forbidden" : "error");
    }
  }, [year]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  return (
    <div className="tw04-layout space-y-6 font-sans">
      <PageHeader
        title="Kuukausimyynti"
        description="Myynti kuukausittain valitulta vuodelta."
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
          <CardDescription>{year}</CardDescription>
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
              <TableHead>Kuukausi</TableHead>
              <TableHead className="text-right">Myynti</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.month} className="h-14">
                <TableCell>{months[Number(row.month) - 1]}</TableCell>
                <TableCell className="text-right font-medium">
                  {currencyFormatter.format(row.amount)}
                </TableCell>
              </TableRow>
            ))}
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
