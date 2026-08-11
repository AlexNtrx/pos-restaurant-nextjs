"use client";
import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import api from "@/lib/api";
import dayjs from "dayjs";
import {
  isDailySalesResponse,
  type DailySalesRow,
  // Renders the daily sales interface.
} from "@/lib/report-contracts";

// Renders the daily sales interface.
export default function DailySales() {
  const [arrYear] = useState(() =>
    Array.from({ length: 5 }, (_, index) => dayjs().year() - index),
  );
  const arrMonth = [
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
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear(),
  );
  const [selectedMonth, setSelectedMonth] = useState<number>(
    new Date().getMonth() + 1,
  );
  const [data, setData] = useState<DailySalesRow[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.post("/report/dailySales", {
        year: selectedYear,
        month: selectedMonth,
      });
      if (!isDailySalesResponse(response.data))
        throw new Error("Invalid daily-sales response");
      setData(response.data.results);
      setTotalAmount(response.data.totalAmount);
    } catch (error: unknown) {
      await Swal.fire({
        title: "Error",
        text:
          error instanceof Error ? error.message : "Unable to load daily sales",
        icon: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    const requestId = window.setTimeout(() => void fetchData(), 0);
    return () => window.clearTimeout(requestId);
  }, [fetchData]);

  return (
    <>
      <div className="card mt-3">
        <div className="card-header">Daily Sales Report</div>
        <div className="card-body">
          <div className="row">
            <div className="col-3">
              <div>Year</div>
              <select
                className="form-control"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
              >
                {arrYear.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-3">
              <div>Month</div>
              <select
                id="ddlMonth"
                className="form-control"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
              >
                {arrMonth.map((month, index) => (
                  <option key={index} value={index + 1}>
                    {month}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-3">
              <div>&nbsp;</div>
              <button
                className="btn btn-primary"
                onClick={() => void fetchData()}
                disabled={isLoading}
              >
                View Report
              </button>
            </div>
          </div>
          <table className="table table-bordered mt-3">
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-end" style={{ width: "100px" }}>
                  Sales Total
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={2} className="text-center">
                    Loading daily sales…
                  </td>
                </tr>
              ) : (
                data.map((item) => (
                  <tr key={item.date}>
                    <td>{item.date.slice(-2)}</td>
                    <td className="text-end">
                      {item.amount.toLocaleString("th-TH")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className="text-end">Total</td>
                <td className="text-end">
                  {totalAmount.toLocaleString("th-TH")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
