import { isAxiosError } from "axios";
const currencyFormatter = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});

export const qrMoney = (amount: number) => currencyFormatter.format(amount);

export const qrErrorCode = (error: unknown): string | null =>
  isAxiosError(error) && typeof error.response?.data?.code === "string"
    ? error.response.data.code
    : null;

export const qrErrorText = (error: unknown) => {
  const code = qrErrorCode(error);
  if (code === "QR_INVALID")
    return "QR-koodi ei ole enää voimassa. Pyydä henkilökunnalta uusi koodi.";
  if (code === "QR_ORDERING_CLOSED")
    return "QR-tilaaminen ei ole juuri nyt käytettävissä.";
  if (
    code === "FOOD_UNAVAILABLE" ||
    code === "SIZE_UNAVAILABLE" ||
    code === "TASTE_UNAVAILABLE"
  )
    return "Jokin tuote tai valinta ei ole enää saatavilla. Tarkista ostoskori.";
  if (code === "QUOTE_CHANGED")
    return "Hinta on muuttunut. Tarkista ostoskori ennen uutta yritystä.";
  if (code === "QR_RATE_LIMITED")
    return "Pöydästä on lähetetty monta tilausta. Yritä hetken kuluttua.";
  if (code === "IDEMPOTENCY_CONFLICT")
    return "Tilausyritys on muuttunut. Päivitä sivu ja tarkista tilanne.";
  if (code === "ORDER_NOT_FOUND") return "Tilausta ei löytynyt tästä pöydästä.";
  return "Yhteys epäonnistui. Yritä uudelleen.";
};
