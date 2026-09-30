"use client";

import { isAxiosError } from "axios";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import {
  changeOrderStatus,
  fetchOrderDetail,
  fetchOrderPages,
  mergeActiveOrders,
  type OrderStatus,
  type StaffOrder,
  type StaffOrderDetail,
} from "./_lib/staff-orders";

type ActionStatus = "CONFIRMED" | "REJECTED" | "CANCELLED";
const currency = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});
const localTime = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  dateStyle: "short",
  timeStyle: "short",
});
const actionText: Record<ActionStatus, string> = {
  CONFIRMED: "Vahvista",
  REJECTED: "Hylkää",
  CANCELLED: "Peruuta",
};
const statusText: Partial<Record<OrderStatus, string>> = {
  SUBMITTED: "Odottaa",
  CONFIRMED: "Vahvistettu",
  REJECTED: "Hylätty",
  CANCELLED: "Peruttu",
};

function elapsed(minutes: number) {
  if (minutes < 1) return "juuri nyt";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function OrderSummary({
  order,
  onOpen,
  now,
}: {
  order: StaffOrder;
  onOpen: (id: number) => void;
  now: number;
}) {
  const age = Math.max(
    0,
    Math.floor((now - Date.parse(order.submittedAt)) / 60_000),
  );
  return (
    <article className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-heading text-lg font-semibold">
            Tilaus #{order.id}
          </h2>
          <p className="text-xs text-muted-foreground">
            {order.channel === "QR"
              ? "QR"
              : order.channel === "STAFF"
                ? "Tarjoilija"
                : "Kassa"}{" "}
            ·{" "}
            {order.serviceType === "TAKEAWAY"
              ? `Mukaan · Nouto #${order.id}`
              : `Pöytä ${order.tableNo}`}{" "}
            · {elapsed(age)}
          </p>
        </div>
        <StatusBadge
          tone={
            order.status === "REJECTED" || order.status === "CANCELLED"
              ? "danger"
              : "warning"
          }
        >
          {statusText[order.status] ?? order.status}
        </StatusBadge>
      </div>
      <ul className="space-y-2 text-sm">
        {order.items.map((item, index) => (
          <li key={index}>
            <span className="font-medium">
              {item.quantity} × {item.name}
            </span>
            {item.modifiers.length > 0 && (
              <p className="pl-5 text-xs text-muted-foreground">
                {item.modifiers.map((modifier) => modifier.name).join(", ")}
              </p>
            )}
            {item.note && (
              <p className="pl-5 text-xs text-foreground">Huom: {item.note}</p>
            )}
          </li>
        ))}
      </ul>
      {(order.rejectionReason || order.cancellationReason) && (
        <p className="text-xs text-destructive">
          Syy: {order.rejectionReason || order.cancellationReason}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="font-semibold">{currency.format(order.total)}</span>
        <Button size="sm" onClick={() => onOpen(order.id)}>
          Avaa
        </Button>
      </div>
    </article>
  );
}

export default function StaffOrderInboxPage() {
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [handled, setHandled] = useState<StaffOrder[]>([]);
  const [tab, setTab] = useState<"active" | "handled">("active");
  const [state, setState] = useState<
    "loading" | "ready" | "error" | "forbidden"
  >("loading");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StaffOrderDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [action, setAction] = useState<ActionStatus | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(0);
  const busy = useRef(false);
  const requestedFull = useRef(false);
  const watermark = useRef<string | null>(null);
  const polls = useRef(0);
  const mounted = useRef(false);

  const revokeView = useCallback(() => {
    // EN: A revoked session must not keep previously fetched Order snapshots visible.
    // FI: Perutun istunnon aiemmin haetut tilaustiedot eivät saa jäädä näkyviin.
    setOrders([]);
    setHandled([]);
    setSelectedId(null);
    setDetail(null);
    setAction(null);
    setError("");
    setState("forbidden");
    watermark.current = null;
    polls.current = 0;
  }, []);

  const sync = useCallback(async (forceFull = false) => {
    if (busy.current) {
      requestedFull.current ||= forceFull;
      return;
    }
    busy.current = true;
    try {
      // EN: Overlap incremental polling and periodically reconcile the full queue to tolerate delayed transactions.
      // FI: Limittäinen päivityshaku ja määräajoin tehtävä täysi täsmäytys huomioivat viivästyneet transaktiot.
      const full = forceFull || !watermark.current || polls.current >= 12;
      const page = await fetchOrderPages(
        full ? { status: "SUBMITTED" } : { updatedAfter: watermark.current! },
      );
      if (!mounted.current) return;
      setOrders((current) =>
        full
          ? mergeActiveOrders([], page.results)
          : mergeActiveOrders(current, page.results),
      );
      watermark.current = new Date(
        Date.parse(page.serverTime) - 5_000,
      ).toISOString();
      polls.current = full ? 0 : polls.current + 1;
      setError("");
      setState("ready");
    } catch (cause: unknown) {
      if (!mounted.current) return;
      if (
        isPermissionDeniedError(cause) ||
        (isAxiosError(cause) && cause.response?.status === 401)
      ) {
        // EN: The polling callback stays stable; clear cached data on access loss before any stale render.
        // FI: Kyselyfunktio pysyy vakaana; tyhjennä välimuistissa olevat tiedot ennen vanhan näkymän piirtämistä.
        setOrders([]);
        setHandled([]);
        setSelectedId(null);
        setDetail(null);
        setAction(null);
        setError("");
        setState("forbidden");
        watermark.current = null;
        polls.current = 0;
        return;
      }
      setError(getApiErrorMessage(cause, "Tilauksia ei voitu päivittää."));
      setState((previous) => (previous === "ready" ? "ready" : "error"));
    } finally {
      busy.current = false;
      if (mounted.current && requestedFull.current) {
        requestedFull.current = false;
        watermark.current = null;
      }
    }
  }, []);

  const loadHandled = useCallback(async () => {
    try {
      const [rejected, cancelled] = await Promise.all([
        fetchOrderPages({ status: "REJECTED" }),
        fetchOrderPages({ status: "CANCELLED" }),
      ]);
      if (!mounted.current) return;
      setHandled(
        [...rejected.results, ...cancelled.results].sort(
          (left, right) =>
            Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
            right.id - left.id,
        ),
      );
      setError("");
    } catch (cause: unknown) {
      if (!mounted.current) return;
      if (
        isPermissionDeniedError(cause) ||
        (isAxiosError(cause) && cause.response?.status === 401)
      ) {
        revokeView();
      } else {
        setError(
          getApiErrorMessage(cause, "Käsiteltyjä tilauksia ei voitu ladata."),
        );
      }
    }
  }, [revokeView]);

  useEffect(() => {
    mounted.current = true;
    const clock = window.setTimeout(() => setNow(Date.now()), 0);
    const first = window.setTimeout(() => void sync(true), 0);
    const interval = window.setInterval(() => {
      setNow(Date.now());
      void sync();
    }, 5_000);
    return () => {
      mounted.current = false;
      window.clearTimeout(clock);
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [sync]);

  async function openDetail(id: number) {
    setSelectedId(id);
    setDetail(null);
    setDetailError("");
    setAction(null);
    setReason("");
    try {
      const latest = await fetchOrderDetail(id);
      if (mounted.current) setDetail(latest);
    } catch (cause: unknown) {
      if (!mounted.current) return;
      if (
        isPermissionDeniedError(cause) ||
        (isAxiosError(cause) && cause.response?.status === 401)
      ) {
        revokeView();
      } else {
        setDetailError(getApiErrorMessage(cause, "Tilausta ei voitu avata."));
      }
    }
  }

  async function submitAction() {
    if (!detail || !action || saving) return;
    const trimmed = reason.trim();
    if (
      action !== "CONFIRMED" &&
      (trimmed.length < 3 || trimmed.length > 500)
    ) {
      setDetailError("Syyn pituuden on oltava 3–500 merkkiä.");
      return;
    }
    setSaving(true);
    setDetailError("");
    try {
      const updated = await changeOrderStatus(
        detail.id,
        detail.version,
        action,
        action === "CONFIRMED" ? undefined : trimmed,
      );
      setDetail(updated);
      setAction(null);
      setReason("");
      setOrders((current) => mergeActiveOrders(current, [updated]));
      if (tab === "handled") void loadHandled();
      void sync(true);
    } catch (cause: unknown) {
      if (
        isPermissionDeniedError(cause) ||
        (isAxiosError(cause) && cause.response?.status === 401)
      ) {
        revokeView();
      } else if (isAxiosError(cause) && cause.response?.status === 409) {
        setDetailError(
          "Tilaus muuttui toisessa istunnossa. Tiedot päivitettiin.",
        );
        try {
          setDetail(await fetchOrderDetail(detail.id));
        } catch {
          setDetail(null);
        }
        setAction(null);
        void sync(true);
      } else {
        setDetailError(
          getApiErrorMessage(cause, "Tilausta ei voitu päivittää."),
        );
      }
    } finally {
      setSaving(false);
    }
  }

  const visible = tab === "active" ? orders : handled;
  return (
    <div className="tw04-layout space-y-6 font-sans">
      <PageHeader
        title="Saapuvat tilaukset"
        description="Uudet QR- ja kassatilaukset. Lista päivittyy automaattisesti."
        actions={
          <Button
            size="sm"
            onClick={() => void (tab === "active" ? sync(true) : loadHandled())}
          >
            Päivitä
          </Button>
        }
      />
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Tilauslista"
      >
        <Button
          role="tab"
          aria-selected={tab === "active"}
          variant={tab === "active" ? "default" : "outline"}
          onClick={() => setTab("active")}
        >
          Odottavat ({orders.length})
        </Button>
        <Button
          role="tab"
          aria-selected={tab === "handled"}
          variant={tab === "handled" ? "default" : "outline"}
          onClick={() => {
            setTab("handled");
            void loadHandled();
          }}
        >
          Hylätyt ja perutut
        </Button>
      </div>
      {error && state === "ready" && (
        <p
          role="alert"
          className="rounded-md border border-destructive/35 p-3 text-sm text-destructive"
        >
          Päivitys epäonnistui. Näytetään viimeksi ladatut tiedot. {error}
        </p>
      )}
      {state === "loading" ? (
        <LoadingState title="Tilauksia ladataan" />
      ) : state === "forbidden" ? (
        <ErrorState
          title="Ei käyttöoikeutta"
          description="Vain henkilöstö voi nähdä tilaukset."
        />
      ) : state === "error" ? (
        <ErrorState
          title="Tilauksia ei voitu ladata"
          description={error}
          action={
            <Button onClick={() => void sync(true)}>Yritä uudelleen</Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title={
            tab === "active"
              ? "Ei odottavia tilauksia"
              : "Ei hylättyjä tai peruttuja tilauksia"
          }
          description={
            tab === "active"
              ? "Uudet tilaukset ilmestyvät tähän automaattisesti."
              : "Käsitellyt tilaukset säilyvät täällä."
          }
        />
      ) : (
        <section
          aria-label={
            tab === "active" ? "Odottavat tilaukset" : "Käsitellyt tilaukset"
          }
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          {visible.map((order) => (
            <OrderSummary
              key={order.id}
              order={order}
              onOpen={(id) => void openDetail(id)}
              now={now}
            />
          ))}
        </section>
      )}

      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setSelectedId(null);
            setAction(null);
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tilaus #{selectedId}</DialogTitle>
            <DialogDescription>
              {detail
                ? `${detail.channel === "QR" ? "QR" : detail.channel === "STAFF" ? "Tarjoilija" : "Kassa"} · ${detail.serviceType === "TAKEAWAY" ? `Mukaan · Nouto #${detail.id}` : `Pöytä ${detail.tableNo}`} · ${localTime.format(new Date(detail.submittedAt))}`
                : "Ladataan tilauksen tietoja"}
            </DialogDescription>
          </DialogHeader>
          {detailError && (
            <p role="alert" className="text-sm text-destructive">
              {detailError}
            </p>
          )}
          {detail ? (
            <>
              <StatusBadge
                tone={detail.status === "SUBMITTED" ? "warning" : "neutral"}
              >
                {statusText[detail.status] ?? detail.status}
              </StatusBadge>
              <ul className="space-y-3">
                {detail.items.map((item, index) => (
                  <li
                    key={index}
                    className="border-b border-border pb-3 text-sm"
                  >
                    <div className="flex justify-between gap-2 font-medium">
                      <span>
                        {item.quantity} × {item.name}
                      </span>
                      <span>{currency.format(item.lineTotal)}</span>
                    </div>
                    {item.modifiers.map((modifier, modifierIndex) => (
                      <p
                        key={modifierIndex}
                        className="text-xs text-muted-foreground"
                      >
                        {modifier.name} (
                        {currency.format(modifier.priceAdjustment)})
                      </p>
                    ))}
                    {item.note && <p className="text-xs">Huom: {item.note}</p>}
                  </li>
                ))}
              </ul>
              <p className="text-right font-semibold">
                Yhteensä {currency.format(detail.total)}
              </p>
              <div className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Tapahtumat</p>
                {detail.history.map((event) => (
                  <p key={event.version}>
                    {localTime.format(new Date(event.at))} ·{" "}
                    {statusText[event.toStatus] ?? event.toStatus}
                    {event.reason ? ` · ${event.reason}` : ""}
                  </p>
                ))}
              </div>
              {detail.status === "SUBMITTED" && !action && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setAction("CONFIRMED")}>
                    Vahvista
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setAction("REJECTED")}
                  >
                    Hylkää
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setAction("CANCELLED")}
                  >
                    Peruuta
                  </Button>
                </div>
              )}
              {detail.status === "SUBMITTED" && action && (
                <div className="space-y-3 border-t border-border pt-3">
                  <p className="font-semibold">{actionText[action]} tilaus?</p>
                  {action !== "CONFIRMED" && (
                    <label className="block space-y-1 text-sm">
                      <span>Syy (3–500 merkkiä)</span>
                      <textarea
                        className="min-h-24 w-full rounded-md border border-border bg-surface p-2"
                        maxLength={500}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </label>
                  )}
                  <DialogFooter>
                    <Button
                      variant="outline"
                      disabled={saving}
                      onClick={() => setAction(null)}
                    >
                      Takaisin
                    </Button>
                    <Button
                      variant={
                        action === "CONFIRMED" ? "default" : "destructive"
                      }
                      disabled={
                        saving ||
                        (action !== "CONFIRMED" && reason.trim().length < 3)
                      }
                      onClick={() => void submitAction()}
                    >
                      {saving ? "Tallennetaan…" : actionText[action]}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </>
          ) : !detailError ? (
            <LoadingState title="Tilausta ladataan" />
          ) : (
            <Button
              onClick={() => selectedId !== null && void openDetail(selectedId)}
            >
              Yritä uudelleen
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
