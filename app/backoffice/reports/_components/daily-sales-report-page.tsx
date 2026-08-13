"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import {
  isDailySalesResponse,
  type DailySalesRow,
} from "@/lib/report-contracts";
import { cn } from "@/lib/utils";

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
const currentYear = new Date().getFullYear();

const currencyFormatter = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("fi-FI", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

type ReportStatus = "loading" | "ready" | "error" | "forbidden";

function formatReportDate(date: string) {
  return dateFormatter.format(new Date(`${date}T12:00:00Z`));
}

function getChartMaximum(rows: DailySalesRow[]) {
  const largestAmount = Math.max(0, ...rows.map((row) => row.amount));
  if (largestAmount === 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(largestAmount));
  return Math.ceil(largestAmount / magnitude) * magnitude;
}

function ReportFilter({
  label,
  value,
  onValueChange,
  children,
  className,
  triggerId,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  triggerId?: string;
}) {
  return (
    <label
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:flex-none",
        className,
      )}
    >
      {label}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger
          id={triggerId}
          className="h-11 w-full rounded-lg bg-surface font-normal text-foreground"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </label>
  );
}

function KpiCard({
  label,
  value,
  detail,
  primary = false,
  mobileLabel,
}: {
  label: string;
  value: string;
  detail: string;
  primary?: boolean;
  mobileLabel?: string;
}) {
  return (
    <article
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-[16px] font-sans shadow-none",
        "md:min-h-[116px] md:justify-center md:px-[18px] xl:min-h-[126px] xl:px-[20px]",
        primary ? "max-md:col-span-2 max-md:h-[103px]" : "max-md:h-[96px]",
      )}
    >
      <p className="m-0 text-[11px] leading-[15px] font-medium text-muted-foreground md:text-xs">
        {mobileLabel ? (
          <>
            <span className="md:hidden">{mobileLabel}</span>
            <span className="hidden md:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </p>
      <p
        className={cn(
          "m-0 leading-none font-semibold tracking-[-0.02em] text-foreground",
          primary ? "text-[25px]" : "text-lg md:text-[25px]",
        )}
      >
        {value}
      </p>
      <p className="m-0 text-[10px] leading-[13px] text-muted-foreground md:text-[11px]">
        {detail}
      </p>
    </article>
  );
}

function DailySalesChart({ rows }: { rows: DailySalesRow[] }) {
  const maximum = getChartMaximum(rows);
  const midpoint = maximum / 2;
  const lastDay = rows.length;
  const labelledDays = new Set([1, 7, 14, 21, lastDay]);

  return (
    <section
      aria-labelledby="daily-sales-chart-title"
      className="h-[308px] overflow-hidden rounded-[10px] border border-border bg-surface p-[16px] md:h-[360px] md:p-[18px] xl:h-[484px] xl:p-[20px]"
    >
      <h2
        id="daily-sales-chart-title"
        className="m-0 text-[17px] leading-[22px] font-semibold text-foreground md:text-lg"
      >
        Päivittäinen myynti
      </h2>
      <p className="mt-1.5 mb-0 text-[11px] leading-[15px] text-muted-foreground md:text-xs">
        <span className="md:hidden">Nollapäivät näkyvät aikajanalla.</span>
        <span className="hidden md:inline xl:hidden">
          Nollapäivät näkyvät aikajanalla hillittynä.
        </span>
        <span className="hidden xl:inline">
          Nollapäivät säilyvät aikajanalla, mutta eivät hallitse taulukkoa.
        </span>
      </p>

      <div
        role="img"
        aria-label={`Päivittäinen myyntikaavio. Suurin päivämyynti ${currencyFormatter.format(Math.max(0, ...rows.map((row) => row.amount)))}.`}
        className="relative mt-[12px] h-[226px] pl-[30px] md:h-[246px] md:pl-[38px] xl:h-[300px] xl:pl-11"
      >
        {[maximum, midpoint, 0].map((value, index) => (
          <div
            key={value}
            className="absolute right-0 left-0 flex items-center gap-1.5"
            style={{
              top:
                index === 0
                  ? "0%"
                  : index === 1
                    ? "calc(50% - 12px)"
                    : "calc(100% - 24px)",
            }}
          >
            <span className="w-[28px] shrink-0 -translate-y-1/2 text-right text-[9px] text-muted-foreground md:w-9 md:text-[10px]">
              {compactCurrencyFormatter.format(value)}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
        ))}

        <div className="absolute top-0 right-0 bottom-0 left-[32px] flex flex-col md:left-10 xl:left-11">
          <div
            className="grid min-h-0 flex-1 items-end gap-[2px] md:gap-1"
            style={{
              gridTemplateColumns: `repeat(${Math.max(rows.length, 1)}, minmax(0, 1fr))`,
            }}
          >
            {rows.map((row) => {
              const height =
                row.amount > 0 ? Math.max(3, (row.amount / maximum) * 100) : 1;

              return (
                <div key={row.date} className="flex h-full min-w-0 items-end">
                  <div
                    title={`${formatReportDate(row.date)}: ${currencyFormatter.format(row.amount)}`}
                    className={cn(
                      "mx-auto w-full max-w-3 rounded-t-[3px]",
                      row.amount > 0 ? "bg-olive" : "h-0.5 bg-[#efece6]",
                    )}
                    style={
                      row.amount > 0 ? { height: `${height}%` } : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
          <div
            className="grid h-6 shrink-0 gap-[2px] md:gap-1"
            style={{
              gridTemplateColumns: `repeat(${Math.max(rows.length, 1)}, minmax(0, 1fr))`,
            }}
          >
            {rows.map((row) => {
              const day = Number(row.date.slice(-2));
              return (
                <span
                  key={row.date}
                  className="mt-2 text-center text-[9px] leading-3 text-muted-foreground md:text-[10px]"
                >
                  {labelledDays.has(day) ? `${day}.` : ""}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="daily-chart-legend mt-2 items-center gap-2 text-[11px] text-muted-foreground">
        <span aria-hidden="true" className="size-2 rounded-full bg-olive" />
        Myynti päivittäin
      </div>
    </section>
  );
}

function DailyBreakdown({
  rows,
  allRowsCount,
  showZeroDays,
  onShowZeroDaysChange,
}: {
  rows: DailySalesRow[];
  allRowsCount: number;
  showZeroDays: boolean;
  onShowZeroDaysChange: (checked: boolean) => void;
}) {
  const zeroDayCount =
    allRowsCount - rows.filter((row) => row.amount > 0).length;
  const activeDayCount = rows.filter((row) => row.amount > 0).length;

  return (
    <section
      aria-labelledby="daily-breakdown-title"
      className="flex h-[233px] min-h-0 flex-col overflow-hidden rounded-[10px] border border-border bg-surface md:h-[209px] xl:h-[484px]"
    >
      <div className="flex min-h-[61px] shrink-0 items-center justify-between gap-4 px-3.5 py-3.5 md:min-h-[65px] md:px-4 xl:min-h-[71px] xl:px-[18px]">
        <div>
          <h2
            id="daily-breakdown-title"
            className="m-0 text-[17px] leading-[22px] font-semibold text-foreground md:text-lg"
          >
            Myyntipäivät
          </h2>
          <p className="m-0 text-[10px] leading-[13px] text-muted-foreground md:text-[11px]">
            {showZeroDays
              ? `Kaikki ${allRowsCount} päivää · ${zeroDayCount} nollapäivää näkyvissä`
              : `${activeDayCount} päivää · ${zeroDayCount} nollapäivää piilotettu`}
          </p>
        </div>
        <ZeroDayControl
          checked={showZeroDays}
          onCheckedChange={onShowZeroDaysChange}
          className="daily-zero-control-header"
        />
      </div>

      <div className="hidden h-[38px] items-center bg-[#efece6] px-[18px] text-[11px] font-medium text-muted-foreground xl:flex">
        <span className="flex-1">Päivä</span>
        <span className="w-[110px]">Myynti</span>
      </div>

      <div className="daily-breakdown-scroll min-h-0 flex-1 overflow-y-auto">
        {rows.map((row) => (
          <div
            key={row.date}
            className="flex h-11 items-center border-b border-border px-3.5 text-xs text-foreground last:border-b-0 md:h-12 md:px-4 md:text-[13px] xl:h-[52px] xl:px-[18px]"
          >
            <span className="min-w-0 flex-1">{formatReportDate(row.date)}</span>
            <span className="shrink-0 text-right font-semibold xl:w-[110px] xl:text-left">
              {currencyFormatter.format(row.amount)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex min-h-10 items-center px-3.5 md:hidden xl:flex xl:min-h-11 xl:px-[18px]">
        <ZeroDayControl
          checked={showZeroDays}
          onCheckedChange={onShowZeroDaysChange}
          className="daily-zero-control-footer"
        />
        <span className="ml-auto hidden text-[11px] text-muted-foreground xl:block">
          Kaikki {allRowsCount} päivää
        </span>
      </div>
    </section>
  );
}

function ZeroDayControl({
  checked,
  onCheckedChange,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 text-[11px] font-medium text-foreground md:text-xs",
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="size-4 rounded-[3px] border-border accent-olive"
      />
      Näytä myös 0 € päivät
    </label>
  );
}

function DailyReportSkeleton() {
  return (
    <div role="status" aria-label="Raporttia ladataan" className="space-y-5">
      <span className="sr-only">Raporttia ladataan</span>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3 xl:gap-4">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className={cn(
              "h-24 animate-pulse rounded-[10px] border border-border bg-surface p-[16px] motion-reduce:animate-none md:h-[116px] xl:h-[126px]",
              item === 0 && "max-md:col-span-2",
            )}
          >
            <div className="h-3 w-20 rounded-full bg-muted" />
            <div className="mt-3 h-6 w-32 rounded-full bg-muted" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.585fr)_minmax(320px,1fr)]">
        <div className="h-[308px] animate-pulse rounded-[10px] border border-border bg-surface p-[20px] motion-reduce:animate-none md:h-[360px] xl:h-[484px]">
          <div className="h-4 w-40 rounded-full bg-muted" />
          <div className="mt-4 h-3 w-64 max-w-full rounded-full bg-muted" />
          <div className="mt-6 h-40 rounded-md bg-muted/70 md:h-56" />
        </div>
        <div className="h-56 animate-pulse rounded-[10px] border border-border bg-surface motion-reduce:animate-none xl:h-[484px]" />
      </div>
    </div>
  );
}

export function DailySalesReportPage() {
  const years = useMemo(
    () => Array.from({ length: 5 }, (_, index) => currentYear - index),
    [],
  );
  const [year, setYear] = useState(String(currentYear));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [rows, setRows] = useState<DailySalesRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<ReportStatus>("loading");
  const [error, setError] = useState("");
  const [showZeroDays, setShowZeroDays] = useState(false);
  const latestRequestId = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    setStatus("loading");
    setError("");
    try {
      const response = await api.post("/report/dailySales", {
        year: Number(year),
        month: Number(month),
      });
      if (!isDailySalesResponse(response.data)) {
        throw new Error("Palvelin palautti virheellisiä raporttitietoja.");
      }
      // EN: Ignore a slower response when staff have already selected another reporting period.
      // FI: Ohita hitaampi vastaus, jos henkilökunta on jo valinnut toisen raportointijakson.
      if (requestId !== latestRequestId.current) return;
      setRows(response.data.results);
      setTotal(response.data.totalAmount);
      setStatus("ready");
    } catch (reason: unknown) {
      if (requestId !== latestRequestId.current) return;
      setError(getApiErrorMessage(reason, "Raporttia ei voitu ladata."));
      setStatus(isPermissionDeniedError(reason) ? "forbidden" : "error");
    }
  }, [month, year]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const activeRows = useMemo(
    () => rows.filter((row) => row.amount > 0),
    [rows],
  );
  const displayedRows = showZeroDays ? rows : activeRows;
  const averageSalesDay = activeRows.length > 0 ? total / activeRows.length : 0;
  const period = `${months[Number(month) - 1]} ${year}`;
  const hasSales = activeRows.length > 0;

  return (
    <div className="daily-sales-report tw04-layout -mx-[16px] -my-[20px] min-h-[calc(100dvh-4rem)] bg-canvas px-[20px] py-[24px] font-sans sm:mx-[0px] sm:my-[0px] sm:min-h-0 sm:px-[0px] sm:py-[0px] md:-mr-2 xl:mr-0">
      <header className="flex min-h-[55px] items-center justify-between gap-6">
        <div>
          <h1 className="m-0 text-[26px] leading-8 font-semibold text-foreground md:text-[28px] md:leading-[34px]">
            Päivämyynti
          </h1>
          <p className="mt-1 mb-0 h-[23px] text-[13px] leading-[23px] text-muted-foreground md:h-auto md:text-sm md:leading-[17px]">
            Päivittäinen myynti valitulta kuukaudelta.
          </p>
        </div>
        <div className="hidden text-right md:block">
          <p className="m-0 text-[13px] font-semibold text-foreground">
            {period}
          </p>
          <p className="m-0 text-[11px] text-muted-foreground xl:hidden">
            UTC · EUR
          </p>
          <p className="m-0 hidden text-[11px] text-muted-foreground xl:block">
            Raportin aikavyöhyke: UTC · Valuutta: EUR
          </p>
        </div>
      </header>

      <section
        aria-label="Raportin suodattimet"
        className="mt-[18px] grid h-[150px] grid-cols-2 gap-[10px] overflow-hidden rounded-[8px] border border-border bg-surface p-[14px] md:mt-[20px] md:h-[66px] md:grid-cols-[130px_164px_76px_minmax(0,1fr)] md:items-center md:p-[10px_14px] xl:mt-[24px] xl:h-[68px] xl:grid-cols-[138px_176px_80px_minmax(0,1fr)] xl:gap-[12px] xl:p-[12px_16px]"
      >
        <ReportFilter
          label="Vuosi"
          value={year}
          onValueChange={setYear}
          className="md:w-[130px] xl:w-[138px]"
          triggerId="daily-sales-year"
        >
          {years.map((item) => (
            <SelectItem key={item} value={String(item)}>
              {item}
            </SelectItem>
          ))}
        </ReportFilter>
        <ReportFilter
          label="Kuukausi"
          value={month}
          onValueChange={setMonth}
          className="md:w-[164px] xl:w-44"
        >
          {months.map((item, index) => (
            <SelectItem key={item} value={String(index + 1)}>
              {item}
            </SelectItem>
          ))}
        </ReportFilter>
        <Button
          type="button"
          onClick={() => void load()}
          disabled={status === "loading"}
          className="col-span-2 h-11 w-full rounded-[8px] font-medium md:col-span-1 md:h-10 md:w-[76px] xl:w-20"
        >
          <span className="md:hidden">Näytä raportti</span>
          <span className="hidden md:inline">Näytä</span>
        </Button>
        <p className="m-0 hidden min-w-0 text-xs text-muted-foreground md:block">
          Raportti päivittyy valitulle jaksolle.
        </p>
      </section>

      <div className="mt-[18px] md:mt-5 xl:mt-6">
        {status === "loading" ? (
          <DailyReportSkeleton />
        ) : status === "forbidden" ? (
          <ErrorState
            title="Ei käyttöoikeutta"
            description="Sinulla ei ole oikeutta tarkastella tätä raporttia."
            className="min-h-[300px] bg-surface"
          />
        ) : status === "error" ? (
          <ErrorState
            title="Raporttia ei voitu ladata"
            description={error}
            action={
              <Button onClick={() => void load()}>Yritä uudelleen</Button>
            }
            className="min-h-[300px] bg-surface"
          />
        ) : !hasSales ? (
          <EmptyState
            title="Myyntiä ei löytynyt"
            description={`${period} ei sisällä kirjattua myyntiä.`}
            action={
              <Button
                type="button"
                onClick={() =>
                  document.getElementById("daily-sales-year")?.focus()
                }
              >
                Vaihda ajanjaksoa
              </Button>
            }
            className="min-h-[300px] border-solid bg-[#efece6]"
          />
        ) : (
          <>
            <section
              aria-label="Myynnin tunnusluvut"
              className="grid grid-cols-2 gap-x-[10px] gap-y-[18px] md:grid-cols-3 md:gap-[12px] xl:gap-[16px]"
            >
              <KpiCard
                label="Kokonaismyynti"
                value={currencyFormatter.format(total)}
                detail={period}
                primary
              />
              <KpiCard
                label="Myyntipäiviä"
                value={String(activeRows.length)}
                detail="Päivät, joiden myynti > 0 €"
              />
              <KpiCard
                label="Myyntipäivän keskiarvo"
                mobileLabel="Päiväkeskiarvo"
                value={currencyFormatter.format(averageSalesDay)}
                detail="Vain myyntipäiviltä"
              />
            </section>

            <div className="mt-[18px] grid gap-[18px] md:mt-5 md:gap-5 xl:mt-6 xl:grid-cols-[minmax(0,1.585fr)_minmax(320px,1fr)] xl:gap-4">
              <DailySalesChart rows={rows} />
              <DailyBreakdown
                rows={displayedRows}
                allRowsCount={rows.length}
                showZeroDays={showZeroDays}
                onShowZeroDaysChange={setShowZeroDays}
              />
            </div>
          </>
        )}
      </div>

      <p className="mt-[18px] mb-0 text-[10px] text-muted-foreground md:hidden">
        UTC · EUR
      </p>
    </div>
  );
}
