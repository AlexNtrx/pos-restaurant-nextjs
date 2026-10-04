import "client-only";
import { readAuthSession } from "@/lib/auth-session";

export function pendingRequestKey(resource: string) {
  const userId =
    typeof window === "undefined" ? null : readAuthSession()?.userId;
  return userId && /^[1-9]\d*$/.test(userId)
    ? `pending-request:v1:${userId}:${resource}`
    : null;
}

// EN: Persist only request identifiers/intent under the signed-in user; malformed or inaccessible storage must never silently start a new mutation.
// FI: Tallenna vain pyynnön tunnisteet ja sisältö kirjautuneen käyttäjän alle; virheellinen tai saavuttamaton tallennus ei saa aloittaa uutta muutosta huomaamatta.
export function readPendingRequest<T>(
  resource: string,
  parse: (value: unknown) => T | null,
): T | null {
  const key = pendingRequestKey(resource);
  if (!key) return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const result = parse(JSON.parse(raw));
  if (!result)
    throw new Error(
      "Tallennettu pyyntö on virheellinen. Tarkista sen tila ennen uutta yritystä.",
    );
  return result;
}

// EN: An asynchronous attempt must stay with its original account, including after sign-out or account changes.
// FI: Asynkronisen yrityksen on pysyttävä alkuperäisellä käyttäjällä myös uloskirjautumisen tai käyttäjän vaihdon jälkeen.
export function assertPendingOwner(
  resource: string,
  expectedKey: string | null,
) {
  if (!expectedKey || pendingRequestKey(resource) !== expectedKey)
    throw new Error(
      "Käyttäjä vaihtui. Kirjaudu alkuperäisellä käyttäjällä tarkistaaksesi pyynnön.",
    );
}

export function savePendingRequest(
  resource: string,
  value: unknown,
  expectedKey = pendingRequestKey(resource),
) {
  assertPendingOwner(resource, expectedKey);
  const key = pendingRequestKey(resource);
  if (!key) throw new Error("Kirjaudu uudelleen ennen lähettämistä.");
  localStorage.setItem(key, JSON.stringify(value));
}

export function clearPendingRequest(
  resource: string,
  expectedKey = pendingRequestKey(resource),
) {
  assertPendingOwner(resource, expectedKey);
  const key = pendingRequestKey(resource);
  if (!key) throw new Error("Kirjaudu uudelleen ennen pyynnön tarkistamista.");
  localStorage.removeItem(key);
}

export function pendingResources(prefix: string) {
  const keyPrefix = pendingRequestKey(prefix);
  if (!keyPrefix) return [];
  return Array.from({ length: localStorage.length }, (_, index) =>
    localStorage.key(index),
  )
    .filter((key): key is string => !!key && key.startsWith(keyPrefix))
    .map((key) => `${prefix}${key.slice(keyPrefix.length)}`);
}
