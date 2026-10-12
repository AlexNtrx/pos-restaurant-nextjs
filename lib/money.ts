// EN: API and saved payment bodies use EUR; calculations use exact, safe integer cents.
// FI: API ja tallennetut maksupyynnöt käyttävät euroja; laskenta käyttää tarkkoja, turvallisia kokonaislukusenttejä.
export function euroCents(value: unknown, signed = false): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const text = String(value).trim();
  if (text.length > 32) return null;
  const match = /^(\-?)(\d+)(?:[.,](\d{1,2}))?$/.exec(text);
  if (!match || (!signed && match[1])) return null;
  const cents = (BigInt(match[2]) * BigInt(100) + BigInt((match[3] ?? "").padEnd(2, "0"))) * BigInt(match[1] ? -1 : 1);
  const result = Number(cents);
  if (!Number.isSafeInteger(result) || BigInt(result) !== cents) return null;
  const wire = /^(\-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(Number(text.replace(",", "."))));
  if (!wire) return null;
  const wireCents = (BigInt(wire[2]) * BigInt(100) + BigInt((wire[3] ?? "").padEnd(2, "0"))) * BigInt(wire[1] ? -1 : 1);
  return wireCents === cents ? result : null;
}

export const isEuroAmount = (value: unknown, signed = false): value is number =>
  typeof value === "number" && euroCents(value, signed) !== null;

export function centsEuros(cents: number): number {
  if (!Number.isSafeInteger(cents)) throw new RangeError("Money total is out of range");
  const absolute = Math.abs(cents);
  const result = Number(`${cents < 0 ? "-" : ""}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`);
  if (euroCents(result, true) !== cents) throw new RangeError("Money cannot be represented exactly");
  return result;
}

export function moneySum(values: readonly number[]): number {
  let cents = BigInt(0);
  for (const value of values) {
    const parsed = euroCents(value, true);
    if (parsed === null) throw new RangeError("Invalid money amount");
    cents += BigInt(parsed);
  }
  const result = Number(cents);
  if (!Number.isSafeInteger(result) || BigInt(result) !== cents) throw new RangeError("Money total is out of range");
  return centsEuros(result);
}

export function moneyMultiply(value: number, quantity: number): number {
  const cents = euroCents(value, true);
  if (cents === null || !Number.isSafeInteger(quantity) || quantity < 0) throw new RangeError("Invalid money quantity");
  const total = BigInt(cents) * BigInt(quantity);
  const result = Number(total);
  if (!Number.isSafeInteger(result) || BigInt(result) !== total) throw new RangeError("Money total is out of range");
  return centsEuros(result);
}

export const moneyDifference = (left: number, right: number) => moneySum([left, -right]);
