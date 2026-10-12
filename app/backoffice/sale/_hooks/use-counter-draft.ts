"use client";
import {
  isEuroAmount,
  moneySum,
  moneyMultiply,
  moneyDifference,
} from "@/lib/money";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAxiosError } from "axios";
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
export type DraftScope = number | "TAKEAWAY";
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
const emptyCatalog: Food[] = [];
const quoteErrorMessage = (error: unknown) => {
  const code = isAxiosError<{ code?: string }>(error)
    ? error.response?.data?.code
    : undefined;
  if (code === "FOOD_UNAVAILABLE")
    return "Jokin luonnoksen tuote ei ole enää saatavilla. Poista vanhentunut tuote ja yritä uudelleen.";
  if (code === "SIZE_UNAVAILABLE" || code === "TASTE_UNAVAILABLE")
    return "Jokin lisävalinta ei ole enää saatavilla. Poista tuote ja lisää se uudelleen nykyisillä valinnoilla.";
  return "Luonnoksen hintaa ei voitu vahvistaa. Muokkaa tuotteita tai yritä uudelleen.";
};
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
const storageKey = (scope: DraftScope) => {
  const userId = readAuthSession()?.userId;
  return userId && validId(Number(userId))
    ? `counter-draft:v1:${userId}:${scope === "TAKEAWAY" ? "takeaway" : scope}`
    : null;
};
const readDraft = (scope: DraftScope): DraftUnit[] => {
  const key = storageKey(scope);
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
const saveDraft = (scope: DraftScope, units: DraftUnit[]) => {
  const key = storageKey(scope);
  if (!key) throw new Error("Sign in again before editing this draft");
  if (units.length === 0) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(units));
};
const toIntent = (scope: DraftScope, units: DraftUnit[]) => {
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
  return {
    ...(scope === "TAKEAWAY"
      ? { serviceType: "TAKEAWAY" as const }
      : { tableNo: scope }),
    items: [...grouped.values()],
  };
};
const parseQuote = (value: unknown): Quote => {
  if (!value || typeof value !== "object")
    throw new Error("Invalid draft quote");
  const quote = value as Record<string, unknown>;
  if (
    !Array.isArray(quote.items) ||
    !isEuroAmount(quote.subtotal) ||
    !isEuroAmount(quote.modifierTotal) ||
    !isEuroAmount(quote.total) ||
    quote.items.some((item) => {
      if (!item || typeof item !== "object") return true;
      const line = item as Record<string, unknown>;
      return (
        !validId(line.foodId) ||
        typeof line.foodName !== "string" ||
        !validId(line.quantity) ||
        !isEuroAmount(line.unitBasePrice) ||
        !isEuroAmount(line.lineTotal) ||
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
    const base = moneyMultiply(line.unitBasePrice, line.quantity);
    group.pricing.baseAmount = moneySum([group.pricing.baseAmount, base]);
    group.pricing.addedAmount = moneySum([
      group.pricing.addedAmount,
      moneyDifference(line.lineTotal, base),
    ]);
    group.pricing.total = moneySum([group.pricing.total, line.lineTotal]);
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

// EN: Keep every saved unit editable when pricing fails; placeholder amounts must never be used for payment.
// FI: Säilytä jokainen tallennettu annos muokattavana hinnoittelun epäonnistuessa; paikkasummia ei saa käyttää maksuun.
const displayUnpricedItems = (
  units: DraftUnit[],
  catalog: Food[],
  previousItems: SaleTemp[],
): SaleTemp[] => {
  const foods = new Map(
    [...previousItems.map((item) => item.Food), ...catalog].map((food) => [
      food.id,
      food,
    ]),
  );
  const groups = new Map<number, SaleTemp>();
  for (const unit of units) {
    let group = groups.get(unit.foodId);
    if (!group) {
      group = {
        id: unit.foodId,
        qty: 0,
        Food: foods.get(unit.foodId) ?? {
          id: unit.foodId,
          name: `Tuote #${unit.foodId}`,
          img: "",
          price: 0,
        },
        saleTempDetails: [],
        pricing: { ...emptySummary },
      };
      groups.set(unit.foodId, group);
    }
    group.qty += 1;
    group.saleTempDetails.push({
      ...unit,
      saleTempId: unit.foodId,
      Food: group.Food,
    });
  }
  return [...groups.values()];
};

// EN: Persist identifiers per signed-in staff and dine-in table or takeaway scope; server quotes remain authoritative.
// FI: Tallenna tunnisteet työntekijän ja pöydän tai noutotilauksen mukaan; palvelimen hinta-arvio on määräävä.
export default function useCounterDraft(
  scope: DraftScope,
  onError: (error: unknown, kind: "load" | "mutation") => void,
  catalog: Food[] = emptyCatalog,
) {
  const [units, setUnits] = useState<DraftUnit[]>([]);
  const [items, setItems] = useState<SaleTemp[]>([]);
  const [summary, setSummary] = useState<CartSummary>(emptySummary);
  const [cartBusy, setCartBusy] = useState(false);
  const [quoteReady, setQuoteReady] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadedScope, setLoadedScope] = useState<DraftScope | null>(null);
  const unitsRef = useRef<DraftUnit[]>([]);
  const scopeRef = useRef(scope);
  const requestId = useRef(0);
  const mutationId = useRef(0);
  const mutationBusy = useRef(false);
  const quoteJob = useRef<{
    signature: string;
    controller: AbortController;
    promise: Promise<Quote>;
  } | null>(null);
  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  const quoteUnits = useCallback(
    async (targetScope: DraftScope, targetUnits: DraftUnit[]) => {
      const id = ++requestId.current;
      setQuoteReady(false);
      setQuoteError(null);
      setSummary(emptySummary);
      if (targetUnits.length === 0) {
        quoteJob.current?.controller.abort();
        quoteJob.current = null;
        if (scopeRef.current === targetScope && requestId.current === id) {
          setItems([]);
          setSummary(emptySummary);
          setQuoteReady(true);
        }
        return { results: [], summary: emptySummary };
      }
      const intent = toIntent(targetScope, targetUnits);
      const signature = JSON.stringify([readAuthSession()?.userId, intent]);
      // EN: Share only an in-flight quote for identical identifiers; a changed intent aborts the old read and every completed refresh asks the server again.
      // FI: Jaa vain samojen tunnisteiden keskeneräinen hinta-arvio; muuttunut pyyntö keskeyttää vanhan haun ja jokainen valmis päivitys kysyy palvelimelta uudelleen.
      if (quoteJob.current?.signature !== signature) {
        quoteJob.current?.controller.abort();
        const controller = new AbortController();
        const promise = api
          .post("/counterOrder/quote", intent, { signal: controller.signal })
          .then((response) => parseQuote(response.data?.results));
        const job = { signature, controller, promise };
        quoteJob.current = job;
        void promise
          .finally(() => {
            if (quoteJob.current === job) quoteJob.current = null;
          })
          .catch(() => {});
      }
      const job = quoteJob.current!;
      let quote: Quote;
      try {
        quote = await job.promise;
      } catch (error) {
        if (
          !job.controller.signal.aborted &&
          scopeRef.current === targetScope &&
          requestId.current === id
        )
          setQuoteError(quoteErrorMessage(error));
        throw error;
      }
      if (
        job.controller.signal.aborted ||
        scopeRef.current !== targetScope ||
        requestId.current !== id
      )
        return null;
      const results = displayItems(targetUnits, quote);
      const nextSummary = {
        baseAmount: quote.subtotal,
        addedAmount: quote.modifierTotal,
        total: quote.total,
      };
      if (scopeRef.current === targetScope && requestId.current === id) {
        setItems(results);
        setSummary(nextSummary);
        setQuoteReady(true);
      }
      return { results, summary: nextSummary };
    },
    [],
  );

  useEffect(() => {
    const targetScope = scope;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setCartBusy(false);
      mutationBusy.current = false;
      unitsRef.current = [];
      setUnits([]);
      setItems([]);
      setSummary(emptySummary);
      setQuoteReady(false);
      setQuoteError(null);
      let saved: DraftUnit[];
      // EN: Unreadable storage requires explicit recovery; a valid draft with unavailable products remains editable.
      // FI: Lukukelvoton tallennus vaatii erillisen palautuksen; kelvollista luonnosta voi muokata, vaikka tuotteita ei olisi saatavilla.
      try {
        saved = readDraft(targetScope);
      } catch (error) {
        if (!cancelled) {
          setLoadedScope(targetScope);
          setLoadFailed(true);
          onError(error, "load");
        }
        return;
      }
      if (cancelled) return;
      unitsRef.current = saved;
      setUnits(saved);
      setLoadedScope(targetScope);
      setLoadFailed(false);
      const quoteRequestId = requestId.current + 1;
      try {
        await quoteUnits(targetScope, saved);
      } catch (error) {
        if (!cancelled && requestId.current === quoteRequestId)
          onError(error, "load");
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      requestId.current += 1;
      mutationId.current += 1;
      quoteJob.current?.controller.abort();
      quoteJob.current = null;
    };
  }, [scope, quoteUnits, onError]);

  const change = async (next: DraftUnit[]) => {
    if (
      cartBusy ||
      loadFailed ||
      mutationBusy.current ||
      (scope !== "TAKEAWAY" && !validId(scope)) ||
      loadedScope !== scope
    )
      return null;
    let quoteRequestId: number | null = null;
    mutationBusy.current = true;
    const operationId = ++mutationId.current;
    // EN: A previous scope must not change the current cart's error or busy state.
    // FI: Edellinen rajaus ei saa muuttaa nykyisen ostoskorin virhe- tai odotustilaa.
    const isCurrent = () =>
      scopeRef.current === scope && mutationId.current === operationId;
    try {
      setCartBusy(true);
      saveDraft(scope, next);
      unitsRef.current = next;
      setUnits(next);
      setLoadFailed(false);
      quoteRequestId = requestId.current + 1;
      const result = await quoteUnits(scope, next);
      return isCurrent() ? result : null;
    } catch (error) {
      if (
        isCurrent() &&
        (quoteRequestId === null || requestId.current === quoteRequestId)
      ) {
        onError(error, "mutation");
      }
      return null;
    } finally {
      if (isCurrent()) {
        mutationBusy.current = false;
        setCartBusy(false);
      }
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
    const targetScope = scope;
    const refreshedId = requestId.current + 1;
    const isCurrent = () =>
      scopeRef.current === targetScope && requestId.current === refreshedId;
    if (loadFailed) {
      try {
        const saved = readDraft(targetScope);
        unitsRef.current = saved;
        setUnits(saved);
        setLoadFailed(false);
      } catch (error) {
        onError(error, "load");
        return null;
      }
    }
    try {
      const refreshed = await quoteUnits(scope, unitsRef.current);
      if (isCurrent()) setLoadFailed(false);
      return refreshed;
    } catch (error) {
      if (isCurrent()) {
        setQuoteReady(false);
        onError(error, "load");
      }
      return null;
    }
  };
  const discardDraft = () => {
    try {
      saveDraft(scope, []);
      // EN: A quote started before discarding must not restore the discarded items or their prices.
      // FI: Ennen tyhjennystä alkanut hinta-arvio ei saa palauttaa poistettuja tuotteita tai niiden hintoja.
      requestId.current += 1;
      mutationId.current += 1;
      quoteJob.current?.controller.abort();
      quoteJob.current = null;
      unitsRef.current = [];
      setUnits([]);
      setItems([]);
      setSummary(emptySummary);
      setLoadedScope(scope);
      mutationBusy.current = false;
      setCartBusy(false);
      setLoadFailed(false);
      setQuoteReady(true);
      setQuoteError(null);
    } catch (error) {
      onError(error, "mutation");
    }
  };
  const visibleItems = useMemo(
    () => (quoteReady ? items : displayUnpricedItems(units, catalog, items)),
    [quoteReady, items, units, catalog],
  );
  return {
    items: visibleItems,
    summary,
    cartBusy,
    quoteReady,
    quoteError,
    loadFailed,
    loadedScope,
    units,
    getIntent: () => toIntent(scope, unitsRef.current),
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
