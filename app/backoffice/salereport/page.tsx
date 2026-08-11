"use client";

import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import Swal from "sweetalert2";
import api from "@/lib/api";
import {
  type Bill,
  type BillSummary,
  parseBillHistoryResponse,
} from "./_lib/bill-history-contract";
import MyModal from "../components/mymodal";

const businessTimeZone = "Europe/Helsinki";
const currencyFormatter = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});
dayjs.extend(utc);
dayjs.extend(timezone);
// Coordinates format currency behavior for this module.
const formatCurrency = (amount: number) => currencyFormatter.format(amount);

const emptySummary: BillSummary = {
  activeCount: 0,
  activeAmount: 0,
  cancelledCount: 0,
  cancelledAmount: 0,
};
// Coordinates error message behavior for this module.
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : // Renders the sale report page interface.
      "Unable to complete the bill-history request";

// Renders the sale report page interface.
export default function SaleReportPage() {
  const today = dayjs().tz(businessTimeZone).format("YYYY-MM-DD");
  const [billSales, setBillSales] = useState<Bill[]>([]);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [summary, setSummary] = useState<BillSummary>(emptySummary);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fetchData = useCallback(async () => {
    if (fromDate > toDate) {
      await Swal.fire({
        icon: "warning",
        title: "Validation",
        text: "From date must not be after To date",
      });
      return;
    }
    setIsLoading(true);
    try {
      const response = await api.post("/billSale/list", {
        startDate: fromDate,
        endDate: toDate,
      });
      const parsed = parseBillHistoryResponse(response.data);
      if (!parsed) {
        throw new Error("Invalid bill-history response");
      }
      setBillSales(parsed.results);
      setSummary(parsed.summary);
    } catch (error: unknown) {
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: errorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, [fromDate, toDate]);
  useEffect(() => {
    const requestId = window.setTimeout(() => void fetchData(), 0);
    return () => window.clearTimeout(requestId);
  }, [fetchData]);
  // Handles cancel bill events and preserves existing side effects.
  const handleCancelBill = async (bill: Bill) => {
    const confirmation = await Swal.fire({
      icon: "warning",
      title: "Confirm cancellation",
      text: `Bill #${bill.id} will remain in history as cancelled.`,
      input: "textarea",
      inputLabel: "Cancellation reason",
      inputPlaceholder: "At least 3 characters",
      // Coordinates input validator behavior for this module.
      inputValidator: (value) =>
        value.trim().length < 3
          ? "Cancellation reason must be at least 3 characters"
          : undefined,
      showCancelButton: true,
      confirmButtonText: "Cancel bill",
    });
    if (!confirmation.isConfirmed) return;
    try {
      await api.delete(`/billSale/remove/${bill.id}`, {
        data: { reason: confirmation.value },
      });
      await fetchData();
    } catch (error: unknown) {
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: errorMessage(error),
      });
    }
  };
  return (
    <>
      <div className="card mt-3">
        <div className="card-header">Sales History</div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-3">
              <label htmlFor="bill-from">From</label>
              <input
                id="bill-from"
                type="date"
                className="form-control"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </div>
            <div className="col-md-3">
              <label htmlFor="bill-to">To</label>
              <input
                id="bill-to"
                type="date"
                className="form-control"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </div>
            <div className="col-md-2 d-flex align-items-end">
              <button
                className="btn btn-primary"
                onClick={() => void fetchData()}
                disabled={isLoading}
              >
                <i className="fa fa-search me-2" />
                Show
              </button>
            </div>
          </div>
          <div className="row mt-3" aria-label="Sales summary">
            <div className="col-md-6 mb-2">
              <div className="border rounded p-3">
                <div className="fw-semibold">Active sales</div>
                <div>{summary.activeCount} bills</div>
                <div>{formatCurrency(summary.activeAmount)}</div>
              </div>
            </div>
            <div className="col-md-6 mb-2">
              <div className="border rounded p-3 text-muted">
                <div className="fw-semibold">Cancelled sales</div>
                <div>{summary.cancelledCount} bills</div>
                <div>{formatCurrency(summary.cancelledAmount)}</div>
              </div>
            </div>
          </div>
          <table className="table table-bordered mt-3">
            <thead>
              <tr>
                <th style={{ width: "210px" }}>Actions</th>
                <th>Date &amp; Time</th>
                <th>Receipt No.</th>
                <th>Seller</th>
                <th className="text-end">Table</th>
                <th className="text-end">Sale Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center">
                    Loading bills…
                  </td>
                </tr>
              ) : billSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center">
                    No bills in this date range
                  </td>
                </tr>
              ) : (
                billSales.map((bill) => (
                  <tr
                    key={bill.id}
                    className={
                      bill.status === "cancelled" ? "table-secondary" : ""
                    }
                  >
                    <td>
                      <button
                        className="btn btn-primary me-2"
                        onClick={() => setSelectedBill(bill)}
                        data-bs-toggle="modal"
                        data-bs-target="#modalBillSaleDetail"
                      >
                        <i className="fa fa-info me-2" />
                        Detail
                      </button>
                      {bill.status === "use" && (
                        <button
                          className="btn btn-danger"
                          onClick={() => void handleCancelBill(bill)}
                        >
                          <i className="fa fa-times me-2" />
                          Cancel
                        </button>
                      )}
                    </td>
                    <td>
                      {dayjs(bill.payDate)
                        .tz(businessTimeZone)
                        .format("DD/MM/YYYY HH:mm:ss")}
                    </td>
                    <td>{bill.id}</td>
                    <td>{bill.User.name}</td>
                    <td className="text-end">{bill.tableNo}</td>
                    <td className="text-end">{formatCurrency(bill.amount)}</td>
                    <td>
                      {bill.status === "use" ? (
                        "Active"
                      ) : (
                        <span>
                          Cancelled
                          {bill.cancelledAt
                            ? ` — ${dayjs(bill.cancelledAt).tz(businessTimeZone).format("DD/MM/YYYY HH:mm")}`
                            : ""}
                          <br />
                          {bill.cancelReason ||
                            "Legacy cancellation (audit details unavailable)"}
                          {bill.CancelledBy
                            ? ` (${bill.CancelledBy.name})`
                            : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <MyModal
        id="modalBillSaleDetail"
        title={selectedBill ? `Bill #${selectedBill.id} detail` : "Detail"}
        modalSize="modal-lg"
      >
        <table className="table table-bordered">
          <thead>
            <tr>
              <th>Menu</th>
              <th>Size</th>
              <th>Taste</th>
              <th className="text-end">Price</th>
            </tr>
          </thead>
          <tbody>
            {selectedBill?.BillSaleDetails.map((detail) => (
              <tr key={detail.id}>
                <td>{detail.foodName}</td>
                <td>{detail.foodSizeName || "-"}</td>
                <td>{detail.tasteName || "-"}</td>
                <td className="text-end">
                  {formatCurrency(detail.price + detail.moneyAdded)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </MyModal>
    </>
  );
}
