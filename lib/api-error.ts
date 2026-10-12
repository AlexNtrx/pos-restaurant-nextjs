import { isAxiosError } from "axios";
import {
  localizedMessages,
  messageTranslations,
  responseMessage,
} from "./api-error-messages";

const localMessagePrefixes = [
  "Palvelin palautti ",
  "Käyttäjä vaihtui.",
  "Kirjaudu uudelleen ",
  "Tallennettu pyyntö ",
  "Tallennettu maksupyyntö ",
  "Maksupyyntö kuuluu ",
  "Tilausluonnos on ",
  "Loppusumma muuttui.",
  "Vastaanotettu käteinen ",
  "Pöytäistuntoa ei voitu ",
];

export function isPermissionDeniedError(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 403;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<{ message?: unknown; error?: unknown }>(error)) {
    if (!error.response)
      return `${fallback} Palvelimeen ei saada yhteyttä. Tarkista verkkoyhteys ja aiemman yrityksen tila.`;
    // EN: Receipt decoding retains known localized guidance while leaving the original Blob response intact.
    // FI: Kuitin purku säilyttää tunnetun käännetyn ohjeen ja alkuperäisen Blob-vastauksen ennallaan.
    if (localizedMessages.has(error.message)) return error.message;
    return responseMessage(
      error.response.data,
      error.response.status,
      fallback,
    );
  }

  // EN: Preserve known Finnish application validation/recovery messages; arbitrary transport and server diagnostics use the caller's safe fallback.
  // FI: Säilytä tunnetut sovelluksen suomenkieliset tarkistus- ja palautumisviestit; mielivaltaiset yhteys- ja palvelindiagnoosit käyttävät kutsujan turvallista oletusviestiä.
  if (error instanceof Error) {
    const translated = messageTranslations.get(error.message);
    if (translated) return translated;
    if (
      localizedMessages.has(error.message) ||
      localMessagePrefixes.some((prefix) => error.message.startsWith(prefix))
    )
      return error.message;
  }
  return fallback;
}

// EN: PDF requests also receive JSON errors as Blobs; read a bounded body and never expose HTML error pages.
// FI: PDF-pyynnöt saavat myös JSON-virheet Blob-muodossa; lue rajattu sisältö äläkä näytä HTML-virhesivuja.
export async function getBlobApiErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  if (!isAxiosError(error) || !error.response)
    return getApiErrorMessage(error, fallback);
  let data: unknown = error.response?.data;
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    if (data.size > 64 * 1024) return fallback;
    try {
      data = JSON.parse(await data.text());
    } catch {
      return fallback;
    }
  }
  return responseMessage(data, error.response.status, fallback);
}
