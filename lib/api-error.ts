import { isAxiosError } from "axios";

export function isPermissionDeniedError(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 403;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<{ message?: unknown; error?: unknown }>(error)) {
    const message =
      error.response?.data?.message ?? error.response?.data?.error;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return error instanceof Error ? error.message : fallback;
}

// EN: PDF requests also receive JSON errors as Blobs; read a bounded body and never expose HTML error pages.
// FI: PDF-pyynnöt saavat myös JSON-virheet Blob-muodossa; lue rajattu sisältö äläkä näytä HTML-virhesivuja.
export async function getBlobApiErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  if (!isAxiosError(error)) return getApiErrorMessage(error, fallback);
  let data: unknown = error.response?.data;
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    if (data.size > 64 * 1024) return fallback;
    try {
      data = JSON.parse(await data.text());
    } catch {
      return fallback;
    }
  }
  if (!data || typeof data !== "object") return fallback;
  const body = data as { error?: unknown; message?: unknown };
  const message = body.message ?? body.error;
  if (message === "Organization is not configured")
    return "Ravintolan tiedot puuttuvat. Tallenna tiedot kohdassa Asetukset → Ravintolan tiedot ennen kuitin tulostamista.";
  return typeof message === "string" && message.trim() ? message : fallback;
}
