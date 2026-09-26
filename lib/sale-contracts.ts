export type Food = { id: number; name: string; img: string; price: number };
export type Taste = { id: number; name: string };
export type FoodSize = { id: number; name: string; moneyAdded: number };
export type SaleTempDetail = {
  id: number;
  saleTempId: number;
  tasteId: number | null;
  foodSizeId: number | null;
  Food: Food;
};
export type SaleTemp = {
  id: number;
  qty: number;
  Food: Food;
  saleTempDetails: SaleTempDetail[];
  pricing: CartSummary;
};
export type CartSummary = {
  baseAmount: number;
  addedAmount: number;
  total: number;
};
export type CheckoutResult = {
  billId: number;
  amount: number;
  inputMoney: number;
  returnMoney: number;
  replayed: boolean;
};
export type PendingCounterOrder = {
  id: number;
  status: string;
  total: number;
  version: number;
  submittedAt: string;
  Items: { foodName: string; quantity: number }[];
};

// Validates is record before it is used.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
// Validates is finite number before it is used.
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
// Validates is safe integer before it is used.
const isSafeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

// Parses and validates food responses.
export const parseFood = (value: unknown): Food | null => {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.id) ||
    typeof value.name !== "string" ||
    typeof value.img !== "string" ||
    !isFiniteNumber(value.price)
  )
    return null;
  return { id: value.id, name: value.name, img: value.img, price: value.price };
};

// Parses and validates foods responses.
export const parseFoods = (value: unknown): Food[] | null => {
  if (!Array.isArray(value)) return null;
  const foods = value.map(parseFood);
  return foods.every((food): food is Food => food !== null) ? foods : null;
};

// Parses and validates cart response responses.
export const parseCartResponse = (
  value: unknown,
): { results: SaleTemp[]; summary: CartSummary } | null => {
  if (
    !isRecord(value) ||
    !Array.isArray(value.results) ||
    !isRecord(value.summary)
  )
    return null;
  const summary = value.summary;
  if (
    !isFiniteNumber(summary.baseAmount) ||
    !isFiniteNumber(summary.addedAmount) ||
    !isFiniteNumber(summary.total)
  )
    return null;
  const results: SaleTemp[] = [];
  for (const item of value.results) {
    if (
      !isRecord(item) ||
      !isFiniteNumber(item.id) ||
      !isFiniteNumber(item.qty) ||
      !Array.isArray(item.saleTempDetails) ||
      !isRecord(item.pricing)
    )
      return null;
    const food = parseFood(item.Food);
    const pricing = item.pricing;
    if (
      !food ||
      !isFiniteNumber(pricing.baseAmount) ||
      !isFiniteNumber(pricing.addedAmount) ||
      !isFiniteNumber(pricing.total)
    )
      return null;
    results.push({
      ...item,
      id: item.id,
      qty: item.qty,
      Food: food,
      saleTempDetails: item.saleTempDetails as SaleTempDetail[],
      pricing: {
        baseAmount: pricing.baseAmount,
        addedAmount: pricing.addedAmount,
        total: pricing.total,
      },
    });
  }
  return {
    results,
    summary: {
      baseAmount: summary.baseAmount,
      addedAmount: summary.addedAmount,
      total: summary.total,
    },
  };
};

// Coordinates parse checkout result while preserving transaction behavior.
export const parseCheckoutResult = (value: unknown): CheckoutResult | null => {
  if (!isRecord(value)) return null;
  const { billId, amount, inputMoney, returnMoney, replayed } = value;
  if (
    !isSafeInteger(billId) ||
    billId < 1 ||
    !isSafeInteger(amount) ||
    !isSafeInteger(inputMoney) ||
    !isSafeInteger(returnMoney)
  )
    return null;
  return {
    billId,
    amount,
    inputMoney,
    returnMoney,
    replayed: replayed === true,
  };
};

// EN: Validate the pending-order boundary before showing kitchen-queue records in Counter.
// FI: Tarkista odottavien tilausten rajapinta ennen keittiöjonon tietojen näyttämistä kassalla.
export const parsePendingCounterOrders = (
  value: unknown,
): PendingCounterOrder[] | null => {
  if (!isRecord(value) || !Array.isArray(value.results)) return null;
  const orders: PendingCounterOrder[] = [];
  for (const raw of value.results) {
    if (
      !isRecord(raw) ||
      !isSafeInteger(raw.id) ||
      raw.id < 1 ||
      typeof raw.status !== "string" ||
      !["SUBMITTED", "CONFIRMED", "PREPARING", "READY", "SERVED"].includes(
        raw.status,
      ) ||
      !isSafeInteger(raw.total) ||
      raw.total < 0 ||
      !isSafeInteger(raw.version) ||
      raw.version < 1 ||
      typeof raw.submittedAt !== "string" ||
      !Array.isArray(raw.Items)
    )
      return null;
    const items: PendingCounterOrder["Items"] = [];
    for (const item of raw.Items) {
      if (
        !isRecord(item) ||
        typeof item.foodName !== "string" ||
        !isSafeInteger(item.quantity) ||
        item.quantity < 1
      )
        return null;
      items.push({ foodName: item.foodName, quantity: item.quantity });
    }
    orders.push({
      id: raw.id,
      status: raw.status,
      total: raw.total,
      version: raw.version,
      submittedAt: raw.submittedAt,
      Items: items,
    });
  }
  return orders;
};
