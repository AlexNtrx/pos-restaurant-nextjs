"use client";

import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import api from "@/lib/api";

type Food = { id: number; name: string; price: number };
// Validates is food before it is used.
const isFood = (value: unknown): value is Food => {
  if (!value || typeof value !== "object") return false;
  const food = value as Record<string, unknown>;
  return (
    typeof food.id === "number" &&
    typeof food.name === "string" &&
    typeof food.price === "number"
  );
  // Renders the food paginate interface.
};

// Renders the food paginate interface.
export default function FoodPaginate() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const itemsPerPage = 10;

  const fetchData = useCallback(async (page: number) => {
    setIsLoading(true);
    try {
      const response = await api.post("/food/paginate", { page, itemsPerPage });
      const {
        results,
        totalItems: nextTotalItems,
        totalPages: nextTotalPages,
      } = response.data || {};
      if (
        !Array.isArray(results) ||
        !results.every(isFood) ||
        !Number.isInteger(nextTotalItems) ||
        !Number.isInteger(nextTotalPages)
      ) {
        throw new Error("Invalid paginated-food response");
      }
      setFoods(results);
      setTotalItems(nextTotalItems);
      setTotalPages(nextTotalPages);
      setCurrentPage(page);
    } catch (error: unknown) {
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: error instanceof Error ? error.message : "Unable to load foods",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const requestId = window.setTimeout(() => void fetchData(1), 0);
    return () => window.clearTimeout(requestId);
  }, [fetchData]);

  // Updates page without changing user-visible behavior.
  const changePage = (page: number) => {
    if (!isLoading && page >= 1 && page <= totalPages && page !== currentPage)
      void fetchData(page);
  };

  return (
    <div className="card mt-3">
      <div className="card-header">Menu Item List</div>
      <div className="card-body">
        <table className="table table-bordered mb-0">
          <thead>
            <tr>
              <th>Name</th>
              <th className="text-end" style={{ width: "100px" }}>
                Price
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={2} className="text-center">
                  Loading foods…
                </td>
              </tr>
            ) : foods.length === 0 ? (
              <tr>
                <td colSpan={2} className="text-center">
                  No foods found
                </td>
              </tr>
            ) : (
              foods.map((food) => (
                <tr key={food.id}>
                  <td>{food.name}</td>
                  <td className="text-end">{food.price}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="mt-2">
          จำนวนรายการ: {totalItems} จำนวนหน้า: {totalPages}
        </div>
        {totalPages > 1 && (
          <div className="mt-2">
            <button
              className="btn btn-primary me-1"
              disabled={isLoading || currentPage === 1}
              onClick={() => changePage(1)}
            >
              หน้าแรก
            </button>
            <button
              className="btn btn-primary me-1"
              disabled={isLoading || currentPage === 1}
              onClick={() => changePage(currentPage - 1)}
            >
              <i className="fa fa-chevron-left" />
            </button>
            {Array.from({ length: totalPages }, (_, index) => (
              <button
                key={index + 1}
                className={`btn btn-primary me-1${currentPage === index + 1 ? " active" : ""}`}
                disabled={isLoading}
                onClick={() => changePage(index + 1)}
              >
                {index + 1}
              </button>
            ))}
            <button
              className="btn btn-primary me-1"
              disabled={isLoading || currentPage === totalPages}
              onClick={() => changePage(currentPage + 1)}
            >
              <i className="fa fa-chevron-right" />
            </button>
            <button
              className="btn btn-primary"
              disabled={isLoading || currentPage === totalPages}
              onClick={() => changePage(totalPages)}
            >
              หน้าสุดท้าย
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
