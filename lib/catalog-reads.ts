import "client-only";

import api, { publicApi } from "@/lib/api";
import { readAuthToken } from "@/lib/auth-session";
import { catalogReads, invalidateCatalogCache } from "@/lib/revalidated-cache";

export { invalidateCatalogCache } from "@/lib/revalidated-cache";

type Parser<T> = (data: unknown) => T | null;
const accepted = (status: number) => status === 200 || status === 304;

async function read<T>(
  scope: string,
  path: string,
  parse: Parser<T>,
  publicRead: boolean,
  signal?: AbortSignal,
): Promise<T> {
  const client = publicRead ? publicApi : api;
  const data = await catalogReads.read(
    JSON.stringify([scope, path]),
    async (etag, sharedSignal) => {
      const response = await client.get<unknown>(path, {
        signal: sharedSignal,
        validateStatus: accepted,
        ...(etag ? { headers: { "If-None-Match": etag } } : {}),
      });
      return {
        data: response.data,
        status: response.status,
        etag: response.headers?.etag,
      };
    },
    signal,
  );
  const parsed = parse(data);
  if (parsed === null) {
    invalidateCatalogCache();
    throw new Error("Palvelin palautti virheelliset ruokalistatiedot.");
  }
  return parsed;
}

export async function readStaffCatalog<T>(
  path: string,
  parse: Parser<T>,
  signal?: AbortSignal,
) {
  if (
    !/^\/(?:food\/(?:list|filter\/(?:all|food|drink))|foodType\/list|foodSize\/list|taste\/list|waiter\/menu)$/.test(
      path,
    )
  )
    throw new Error("Unsupported catalog resource");
  const token = typeof window === "undefined" ? null : readAuthToken();
  if (!token) {
    const response = signal
      ? await api.get<unknown>(path, { signal })
      : await api.get<unknown>(path);
    const parsed = parse(response.data);
    if (parsed === null)
      throw new Error("Palvelin palautti virheelliset ruokalistatiedot.");
    return parsed;
  }
  // EN: Token and endpoint scope isolate staff from QR and other sessions; every completed read rechecks current server permissions.
  // FI: Tunniste ja rajapinta erottavat henkilökunnan QR:stä ja muista istunnoista; jokainen valmis haku tarkistaa nykyiset palvelinoikeudet.
  return read(`staff:${token}`, path, parse, false, signal);
}

export function readQrCatalog<T>(
  token: string,
  parse: Parser<T>,
  signal?: AbortSignal,
) {
  return read(
    `qr:${token}`,
    `/qr/${encodeURIComponent(token)}/menu`,
    parse,
    true,
    signal,
  );
}
