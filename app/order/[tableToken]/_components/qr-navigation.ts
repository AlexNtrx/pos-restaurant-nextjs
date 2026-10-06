export const pathFor = (token: string, suffix = "") =>
  `/order/${encodeURIComponent(token)}${suffix}`;

export const orderIdFrom = (value: string | null) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};
