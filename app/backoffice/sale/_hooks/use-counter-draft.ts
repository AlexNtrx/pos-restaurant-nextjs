"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { readAuthSession } from "@/lib/auth-session";
import type {
  CartSummary,
  Food,
  SaleTemp,
  SaleTempDetail,
} from "@/lib/sale-contracts";

type DraftUnit = {
  id: number;
  foodId: number;
  foodSizeId: number | null;
  tasteId: number | null;
};
type DraftItem = {
  foodId: number;
  quantity: number;
  foodSizeId: number | null;
  tasteId: number | null;
};
type QuoteItem = {
  foodId: number;
  foodName: string;
  quantity: number;
  unitBasePrice: number;
  lineTotal: number;
  modifiers: {
    type: "SIZE" | "TASTE";
    foodSizeId: number | null;
    tasteId: number | null;
    priceAdjustment: number;
  }[];
};
type Quote = {
  subtotal: number;
  modifierTotal: number;
  total: number;
  items: QuoteItem[];
};
const emptySummary: CartSummary = { baseAmount: 0, addedAmount: 0, total: 0 };
const validId = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;
const validUnit = (value: unknown): value is DraftUnit => {
  if (!value || typeof value !== "object") return false;
  const unit = value as Record<string, unknown>;
  return (
    validId(unit.id) &&
    validId(unit.foodId) &&
    (unit.foodSizeId === null || validId(unit.foodSizeId)) &&
    (unit.tasteId === null || validId(unit.tasteId))
  );
};
const storageKey = (tableNo: number) => {
  const userId = readAuthSession()?.userId;
  return userId && validId(Number(userId))
    ? `counter-draft:v1:${userId}:${tableNo}`
    : null;
};
const readDraft = (tableNo: number): DraftUnit[] => {
  const key = storageKey(tableNo);
  if (!key) return [];
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length > 200 || !parsed.every(validUnit))
    throw new Error("Saved draft is invalid");
  if (new Set(parsed.map((unit) => unit.id)).size !== parsed.length)
    throw new Error("Saved draft has duplicate items");
  return parsed;
};
const saveDraft = (tableNo: number, units: DraftUnit[]) => {
  const key = storageKey(tableNo);
  if (!key) throw new Error("Sign in again before editing this draft");
  if (units.length === 0) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(units));
};
const toIntent = (tableNo: number, units: DraftUnit[]) => {
  const grouped = new Map<string, DraftItem>();
  for (const unit of units) {
    const key = JSON.stringify([unit.foodId, unit.foodSizeId, unit.tasteId]);
    const found = grouped.get(key);
    if (found) found.quantity += 1;
    else
      grouped.set(key, {
        foodId: unit.foodId,
        foodSizeId: unit.foodSizeId,
        tasteId: unit.tasteId,
        quantity: 1,
      });
  }
  return { tableNo, items: [...grouped.values()] };
};
const parseQuote = (value: unknown): Quote => {
  if (!value || typeof value !== "object")
    throw new Error("Invalid draft quote");
  const quote = value as Record<string, unknown>;
  if (
    !Array.isArray(quote.items) ||
    !Number.isSafeInteger(quote.subtotal) ||
    !Number.isSafeInteger(quote.modifierTotal) ||
    !Number.isSafeInteger(quote.total) ||
    quote.items.some((item) => {
      if (!item || typeof item !== "object") return true;
      const line = item as Record<string, unknown>;
      return (
        !validId(line.foodId) ||
        typeof line.foodName !== "string" ||
        !validId(line.quantity) ||
        !Number.isSafeInteger(line.unitBasePrice) ||
        !Number.isSafeInteger(line.lineTotal) ||
        !Array.isArray(line.modifiers)
      );
    })
  )
    throw new Error("Invalid draft quote");
  return quote as Quote;
};
const displayItems = (units: DraftUnit[], quote: Quote): SaleTemp[] => {
  const byFood = new Map<number, SaleTemp>();
  for (const line of quote.items) {
    const food: Food = {
      id: line.foodId,
      name: line.foodName,
      price: line.unitBasePrice,
      img: "",
    };
    let group = byFood.get(line.foodId);
    if (!group) {
      group = {
        id: line.foodId,
        qty: 0,
        Food: food,
        saleTempDetails: [],
        pricing: { ...emptySummary },
      };
      byFood.set(line.foodId, group);
    }
    group.qty += line.quantity;
    group.pricing.baseAmount += line.unitBasePrice * line.quantity;
    group.pricing.addedAmount +=
      line.lineTotal - line.unitBasePrice * line.quantity;
    group.pricing.total += line.lineTotal;
  }
  for (const unit of units) {
    const group = byFood.get(unit.foodId);
    if (group)
      group.saleTempDetails.push({
        ...unit,
        saleTempId: unit.foodId,
        Food: group.Food,
      });
  }
  return [...byFood.values()];
};

// EN: Persist identifiers per signed-in staff/table; every displayed amount comes from a fresh server quote.
// FI: Tallenna tunnisteet kirjautuneen työntekijän ja pöydän mukaan; jokainen näytetty summa tulee tuoreesta palvelimen hinta-arviosta.
export default function useCounterDraft(
  tableNo: number,
  onError: (error: unknown, kind: "load" | "mutation") => void,
) {
  const [units, setUnits] = useState<DraftUnit[]>([]);
  const [items, setItems] = useState<SaleTemp[]>([]);
  const [summary, setSummary] = useState<CartSummary>(emptySummary);
  const [cartBusy, setCartBusy] = useState(false);
  const [quoteReady, setQuoteReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadedTable, setLoadedTable] = useState<number | null>(null);
  const unitsRef = useRef<DraftUnit[]>([]);
  const tableRef = useRef(tableNo);
  const requestId = useRef(0);
  useEffect(() => {
    tableRef.current = tableNo;
  }, [tableNo]);

  const quoteUnits = useCallback(
    async (targetTable: number, targetUnits: DraftUnit[]) => {
      const id = ++requestId.current;
      setQuoteReady(false);
      if (targetUnits.length === 0) {
        if (tableRef.current === targetTable && requestId.current === id) {
          setItems([]);
          setSummary(emptySummary);
          setQuoteReady(true);
        }
        return { results: [], summary: emptySummary };
      }
      const response = await api.post(
        "/counterOrder/quote",
        toIntent(targetTable, targetUnits),
      );
      const quote = parseQuote(response.data?.results);
      const results = displayItems(targetUnits, quote);
      const nextSummary = {
        baseAmount: quote.subtotal,
        addedAmount: quote.modifierTotal,
        total: quote.total,
      };
      if (tableRef.current === targetTable && requestId.current === id) {
        setItems(results);
        setSummary(nextSummary);
        setQuoteReady(true);
      }
      return { results, summary: nextSummary };
    },
    [],
  );

  useEffect(() => {
    const targetTable = tableNo;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const saved = readDraft(targetTable);
        if (cancelled) return;
        unitsRef.current = saved;
        setUnits(saved);
        setLoadedTable(targetTable);
        setLoadFailed(false);
        await quoteUnits(targetTable, saved);
      } catch (error) {
        if (!cancelled) {
          setLoadedTable(targetTable);
          setLoadFailed(true);
          setQuoteReady(false);
          onError(error, "load");
        }
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      requestId.current += 1;
    };
  }, [tableNo, quoteUnits, onError]);

  const change = async (next: DraftUnit[]) => {
    if (cartBusy || !validId(tableNo) || loadedTable !== tableNo) return null;
    let persisted = false;
    try {
      setCartBusy(true);
      saveDraft(tableNo, next);
      persisted = true;
      unitsRef.current = next;
      setUnits(next);
      setLoadFailed(false);
      return await quoteUnits(tableNo, next);
    } catch (error) {
      if (persisted) setQuoteReady(false);
      onError(error, "mutation");
      return null;
    } finally {
      setCartBusy(false);
    }
  };
  const addItem = (foodId: number) => {
    if (!validId(foodId) || unitsRef.current.length >= 200)
      return Promise.resolve(null);
    const id = Math.max(0, ...unitsRef.current.map((unit) => unit.id)) + 1;
    return change([
      ...unitsRef.current,
      { id, foodId, foodSizeId: null, tasteId: null },
    ]);
  };
  const updateQuantity = (foodId: number, quantity: number) => {
    const current = unitsRef.current.filter((unit) => unit.foodId === foodId);
    if (
      !validId(quantity) ||
      !current.length ||
      unitsRef.current.length - current.length + quantity > 200
    )
      return Promise.resolve(null);
    let next = unitsRef.current;
    if (quantity < current.length) {
      const removed = new Set(current.slice(quantity).map((unit) => unit.id));
      next = next.filter((unit) => !removed.has(unit.id));
    } else {
      let id = Math.max(0, ...next.map((unit) => unit.id));
      next = [
        ...next,
        ...Array.from({ length: quantity - current.length }, () => ({
          id: ++id,
          foodId,
          foodSizeId: null,
          tasteId: null,
        })),
      ];
    }
    return change(next);
  };
  const removeItem = (foodId: number) =>
    change(unitsRef.current.filter((unit) => unit.foodId !== foodId));
  const clearCart = () => change([]);
  const changeDetail = async (
    detailId: number,
    changes: Partial<DraftUnit>,
  ) => {
    const next = unitsRef.current.map((unit) =>
      unit.id === detailId ? { ...unit, ...changes } : unit,
    );
    await change(next);
    return detailsFor(next.find((unit) => unit.id === detailId)?.foodId ?? 0);
  };
  const removeDetail = async (detailId: number) => {
    const foodId = unitsRef.current.find(
      (unit) => unit.id === detailId,
    )?.foodId;
    await change(unitsRef.current.filter((unit) => unit.id !== detailId));
    return detailsFor(foodId ?? 0);
  };
  const detailsFor = (foodId: number): SaleTempDetail[] => {
    const food = items.find((item) => item.id === foodId)?.Food ?? {
      id: foodId,
      name: "",
      img: "",
      price: 0,
    };
    return unitsRef.current
      .filter((unit) => unit.foodId === foodId)
      .map((unit) => ({ ...unit, saleTempId: foodId, Food: food }));
  };
  const refreshCart = async () => {
    try {
      const refreshed = await quoteUnits(tableNo, unitsRef.current);
      setLoadFailed(false);
      return refreshed;
    } catch (error) {
      setQuoteReady(false);
      onError(error, "load");
      return null;
    }
  };
  const discardDraft = () => {
    try {
      saveDraft(tableNo, []);
      unitsRef.current = [];
      setUnits([]);
      setItems([]);
      setSummary(emptySummary);
      setLoadedTable(tableNo);
      setLoadFailed(false);
      setQuoteReady(true);
    } catch (error) {
      onError(error, "mutation");
    }
  };
  return {
    items,
    summary,
    cartBusy,
    quoteReady,
    loadFailed,
    loadedTable,
    units,
    getIntent: () => toIntent(tableNo, unitsRef.current),
    refreshCart,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    changeDetail,
    removeDetail,
    detailsFor,
    discardDraft,
  };
}
