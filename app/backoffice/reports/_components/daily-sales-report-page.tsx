"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import api from "@/lib/api";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import {
  isDailySalesResponse,
  type DailySalesRow,
} from "@/lib/report-contracts";
import { DailySalesReportView } from "./daily-sales-report-view";
import { type DailySalesReportStatus } from "./daily-sales-report-types";

const currentYear = new Date().getFullYear();

export function DailySalesReportPage() {
  const years = useMemo(
    () => Array.from({ length: 5 }, (_, index) => currentYear - index),
    [],
  );
  const [year, setYear] = useState(String(currentYear));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [rows, setRows] = useState<DailySalesRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<DailySalesReportStatus>("loading");
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

  return (
    <DailySalesReportView
      years={years}
      year={year}
      month={month}
      rows={rows}
      total={total}
      status={status}
      error={error}
      showZeroDays={showZeroDays}
      onYearChange={setYear}
      onMonthChange={setMonth}
      onLoad={() => void load()}
      onShowZeroDaysChange={setShowZeroDays}
    />
  );
}
