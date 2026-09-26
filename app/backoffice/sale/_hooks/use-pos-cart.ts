"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import {
  parseCartResponse,
  type CartSummary,
  type SaleTemp,
} from "@/lib/sale-contracts";

const emptySummary: CartSummary = { baseAmount: 0, addedAmount: 0, total: 0 };

type UsePosCartOptions = {
  checkoutBusy: boolean;
  onError: (error: unknown, kind: "load" | "mutation") => void;
  // Coordinates use pos cart behavior for this module.
};

// Coordinates use pos cart behavior for this module.
export default function usePosCart({
  checkoutBusy,
  onError,
}: UsePosCartOptions) {
  const [table, setTableState] = useState(1);
  const [items, setItems] = useState<SaleTemp[]>([]);
  const [summary, setSummary] = useState<CartSummary>(emptySummary);
  const [cartBusy, setCartBusy] = useState(false);
  const [loadedTable, setLoadedTable] = useState<number | null>(null);
  const cartRequestId = useRef(0);
  const currentTableRef = useRef(table);

  // Validates is current table before it is used.
  const isCurrentTable = (tableNo: number) =>
    currentTableRef.current === tableNo;

  const setTable = useCallback((nextTable: number) => {
    currentTableRef.current = nextTable;
    cartRequestId.current += 1;
    setLoadedTable(null);
    setTableState(nextTable);

    if (!Number.isInteger(nextTable) || nextTable < 1) {
      setItems([]);
      setSummary(emptySummary);
    }
  }, []);

  const refreshCart = useCallback(
    async (requestedTable = currentTableRef.current) => {
      const requestId = ++cartRequestId.current;
      // Validates can commit before it is used.
      const canCommit = () =>
        requestId === cartRequestId.current && isCurrentTable(requestedTable);

      if (!Number.isInteger(requestedTable) || requestedTable < 1) {
        if (canCommit()) {
          setItems([]);
          setSummary(emptySummary);
        }
        return null;
      }

      try {
        const res = await api.get("/saleTemp/list/", {
          params: { tableNo: requestedTable },
        });
        const parsed = parseCartResponse(res.data);
        if (!parsed) throw new Error("Invalid cart response");
        if (!canCommit()) return;
        setItems(parsed.results);
        setSummary(parsed.summary);
        setLoadedTable(requestedTable);
        return parsed;
      } catch (error: unknown) {
        if (!canCommit()) return;
        onError(error, "load");
        return null;
      }
    },
    [onError],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshCart(table), 0);
    return () => window.clearTimeout(timer);
  }, [refreshCart, table]);

  // Coordinates add item behavior for this module.
  const addItem = async (foodId: number) => {
    const operationTable = currentTableRef.current;
    if (
      cartBusy ||
      checkoutBusy ||
      !Number.isInteger(operationTable) ||
      operationTable < 1
    )
      return;
    try {
      setCartBusy(true);
      await api.post("/saleTemp/create", { tableNo: operationTable, foodId });
      if (isCurrentTable(operationTable)) await refreshCart(operationTable);
    } catch (error: unknown) {
      onError(error, "mutation");
    } finally {
      setCartBusy(false);
    }
  };

  // Updates quantity without changing user-visible behavior.
  const updateQuantity = async (id: number, qty: number) => {
    const operationTable = currentTableRef.current;
    if (cartBusy || checkoutBusy) return;
    try {
      setCartBusy(true);
      await api.put("/saleTemp/updateQty", { qty, id });
      if (isCurrentTable(operationTable)) await refreshCart(operationTable);
    } catch (error: unknown) {
      onError(error, "mutation");
    } finally {
      setCartBusy(false);
    }
  };

  // Removes or clears item using the existing workflow.
  const removeItem = async (id: number) => {
    const operationTable = currentTableRef.current;
    if (cartBusy || checkoutBusy) return;
    try {
      setCartBusy(true);
      await api.delete("/saleTemp/remove/" + id);
      if (isCurrentTable(operationTable)) await refreshCart(operationTable);
    } catch (error: unknown) {
      onError(error, "mutation");
    } finally {
      setCartBusy(false);
    }
  };

  // Removes or clears cart using the existing workflow.
  const clearCart = async () => {
    const operationTable = currentTableRef.current;
    if (cartBusy || checkoutBusy) return;
    try {
      setCartBusy(true);
      await api.delete("/saleTemp/removeAll", {
        data: { tableNo: Number(operationTable) },
      });
      if (isCurrentTable(operationTable)) await refreshCart(operationTable);
    } catch (error: unknown) {
      onError(error, "mutation");
    } finally {
      setCartBusy(false);
    }
  };

  return {
    table,
    setTable,
    items,
    summary,
    cartBusy,
    loadedTable,
    refreshCart,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  };
}
