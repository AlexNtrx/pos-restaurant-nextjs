"use client";
import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import api from "@/lib/api";
import {
  isMonthlySalesResponse,
  type MonthlySalesRow,
  // Renders the monthly sales interface.
} from "@/lib/report-contracts";

// Renders the monthly sales interface.
export default function MonthlySales() {
  const [data, setData] = useState<MonthlySalesRow[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [arrYear] = useState(() =>
    Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - index),
  );
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.post("/report/sumMonthly", {
        year: selectedYear,
      });
      if (!isMonthlySalesResponse(response.data))
        throw new Error("Invalid monthly-sales response");
      setData(response.data.results);
      setTotalAmount(response.data.totalAmount);
    } catch (error: unknown) {
      await Swal.fire({
        title: "Error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to load monthly sales",
        icon: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    const requestId = window.setTimeout(() => void fetchData(), 0);
    return () => window.clearTimeout(requestId);
  }, [fetchData]);
  return (
    <>
      <div className="card mt-3">
        <div className="card-header">Monthly Sales Report</div>
        <div className="card-body">
          <div className="row">
            <div className="col-3">
              <div>Year</div>
              <select
                className="form-select"
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
                <th>Month</th>
                <th className="text-end" style={{ width: "100px" }}>
                  Sales Total
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={2} className="text-center">
                    Loading monthly sales…
                  </td>
                </tr>
              ) : (
                data.map((item) => (
                  <tr key={item.month}>
                    <td>{item.month}</td>
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
