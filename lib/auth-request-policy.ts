// EN: Authentication may wake a sleeping API; bound that wait without extending ordinary business requests.
// FI: Tunnistautuminen voi herättää lepotilassa olevan API:n; rajaa odotus pidentämättä tavallisia liiketoimintapyyntöjä.
export const AUTH_REQUEST_TIMEOUT_MS = 60_000;
export const AUTH_SLOW_NOTICE_MS = 5_000;
