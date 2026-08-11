"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chart as ChartJS } from "chart.js/auto";
import Swal from "sweetalert2";
import api from "@/lib/api";

type DailySalesRow = { date: string; amount: number };
type MonthlySalesRow = { month: string; amount: number };
type DailySalesResponse = { results: DailySalesRow[]; totalAmount: number };
type MonthlySalesResponse = { results: MonthlySalesRow[]; totalAmount: number };

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const isFiniteNonNegativeNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isDailySalesResponse = (value: unknown): value is DailySalesResponse => {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return isFiniteNonNegativeNumber(response.totalAmount) && Array.isArray(response.results) && response.results.every((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && isFiniteNonNegativeNumber(row.amount);
  });
};

const isMonthlySalesResponse = (value: unknown): value is MonthlySalesResponse => {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return isFiniteNonNegativeNumber(response.totalAmount) && Array.isArray(response.results) && response.results.length === 12 && response.results.every((item, index) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return row.month === String(index + 1).padStart(2, "0") && isFiniteNonNegativeNumber(row.amount);
  });
};

export default function Dashboard() {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [dailySales, setDailySales] = useState<DailySalesResponse | null>(null);
  const [monthlySales, setMonthlySales] = useState<MonthlySalesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const dailyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const monthlyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dailyChartRef = useRef<ChartJS | null>(null);
  const monthlyChartRef = useRef<ChartJS | null>(null);
  const years = Array.from({ length: 5 }, (_, index) => currentDate.getFullYear() - index);

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const [dailyResponse, monthlyResponse] = await Promise.all([
        api.post("/report/dailySales", { year: selectedYear, month: selectedMonth }),
        api.post("/report/sumMonthly", { year: selectedYear }),
      ]);
      if (!isDailySalesResponse(dailyResponse.data) || !isMonthlySalesResponse(monthlyResponse.data)) {
        throw new Error("Invalid dashboard report response");
      }
      setDailySales(dailyResponse.data);
      setMonthlySales(monthlyResponse.data);
    } catch (error: unknown) {
      await Swal.fire({ title: "Error", text: error instanceof Error ? error.message : "Unable to load dashboard reports", icon: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth, selectedYear, setDailySales, setIsLoading, setMonthlySales]);

  useEffect(() => {
    const requestId = window.setTimeout(() => void fetchReports(), 0);
    return () => window.clearTimeout(requestId);
  }, [fetchReports]);

  useEffect(() => {
    const canvas = dailyCanvasRef.current;
    if (!canvas || !dailySales) return;
    dailyChartRef.current?.destroy();
    const chart = new ChartJS(canvas, {
      type: "bar",
      data: { labels: dailySales.results.map((item) => item.date.slice(-2)), datasets: [{ label: "Daily sales", data: dailySales.results.map((item) => item.amount), borderWidth: 1, backgroundColor: "#0d6efd" }] },
      options: { responsive: true, scales: { y: { beginAtZero: true } } },
    });
    dailyChartRef.current = chart;
    return () => { chart.destroy(); if (dailyChartRef.current === chart) dailyChartRef.current = null; };
  }, [dailySales]);

  useEffect(() => {
    const canvas = monthlyCanvasRef.current;
    if (!canvas || !monthlySales) return;
    monthlyChartRef.current?.destroy();
    const chart = new ChartJS(canvas, {
      type: "bar",
      data: { labels: monthNames, datasets: [{ label: "Monthly sales", data: monthlySales.results.map((item) => item.amount), borderWidth: 1, backgroundColor: "#198754" }] },
      options: { responsive: true, scales: { y: { beginAtZero: true } } },
    });
    monthlyChartRef.current = chart;
    return () => { chart.destroy(); if (monthlyChartRef.current === chart) monthlyChartRef.current = null; };
  }, [monthlySales]);

  return <div className="mt-3 card"><div className="card-header">Dashboard</div><div className="card-body">
    <div className="row"><div className="col-md-3"><label htmlFor="dashboard-year">Year</label><select id="dashboard-year" className="form-control" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></div>
      <div className="col-md-3"><label htmlFor="dashboard-month">Month</label><select id="dashboard-month" className="form-control" value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>{monthNames.map((month, index) => <option value={index + 1} key={month}>{month}</option>)}</select></div>
      <div className="col-md-3 d-flex align-items-end"><button className="btn btn-primary" onClick={() => void fetchReports()} disabled={isLoading}><i className="fa fa-search me-2" aria-hidden="true" />View Dashboard</button></div></div>
    <div className="row mt-3"><div className="col-md-6"><div className="alert alert-primary mb-0">Selected Month Total: {dailySales?.totalAmount.toLocaleString("fi-FI", { style: "currency", currency: "EUR" }) ?? "-"}</div></div><div className="col-md-6"><div className="alert alert-success mb-0">Selected Year Total: {monthlySales?.totalAmount.toLocaleString("fi-FI", { style: "currency", currency: "EUR" }) ?? "-"}</div></div></div>
    <div className="mt-4"><h2 className="h4">Daily Sales</h2>{isLoading && !dailySales ? <p>Loading daily sales…</p> : <canvas ref={dailyCanvasRef} aria-label="Daily sales chart" role="img" />}</div>
    <div className="mt-4"><h2 className="h4">Monthly Sales</h2>{isLoading && !monthlySales ? <p>Loading monthly sales…</p> : <canvas ref={monthlyCanvasRef} aria-label="Monthly sales chart" role="img" />}</div>
  </div></div>;
}
