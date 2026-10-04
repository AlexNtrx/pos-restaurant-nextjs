import "client-only";

// EN: Gateway timeouts, server failures and revoked access cannot establish whether an earlier write committed; keep its exact intent/key.
// FI: Yhdyskäytävän aikakatkaisu, palvelinvirhe tai peruttu käyttöoikeus ei vahvista aiemman kirjoituksen tulosta; säilytä sen täsmällinen pyyntö ja avain.
export function isMutationRejected(error: unknown) {
  if (!error || typeof error !== "object" || !("response" in error))
    return false;
  const response = error.response as
    { status?: number; data?: { code?: string } } | undefined;
  return (
    !!response &&
    [400, 409, 422].includes(response.status ?? 0) &&
    ![
      "IDEMPOTENCY_CONFLICT",
      "TABLE_SESSION_INACTIVE",
      "QR_ORDERING_CLOSED",
    ].includes(response.data?.code ?? "")
  );
}
