"use client";

import { isAxiosError } from "axios";
import { LogOut, Search, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { StaffRoleContext } from "@/lib/staff-role-context";
import { clearAuthSession } from "@/lib/auth-session";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import {
  fetchOrderPages,
  type StaffOrder,
} from "@/app/backoffice/orders/inbox/_lib/staff-orders";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import {
  changeKitchenStatus,
  fetchKitchenSnapshot,
  mergeKitchenOrders,
  serveKitchenOrder,
} from "./_lib/kitchen-orders";

const columns = [
  {
    status: "CONFIRMED",
    title: "Odottaa",
    badge: "ODOTTAA",
    badgeClass: "bg-[#ece6da]",
  },
  {
    status: "PREPARING",
    title: "Valmistelussa",
    badge: "TYÖSSÄ",
    badgeClass: "bg-[#e7e5de]",
  },
  {
    status: "READY",
    title: "Valmis",
    badge: "VALMIS",
    badgeClass: "bg-[#e4e5e2]",
  },
] as const;

const timeFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  hour: "2-digit",
  minute: "2-digit",
});
const headerFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  weekday: "short",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type PendingAction = {
  id: number;
  version: number;
  nextStatus: "PREPARING" | "READY" | "SERVED";
};

function elapsed(submittedAt: string, now: number) {
  const seconds = Math.max(
    0,
    Math.floor((now - Date.parse(submittedAt)) / 1000),
  );
  if (seconds >= 3600)
    return `${Math.floor(seconds / 3600)} h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")} min`;
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function KitchenCard({
  order,
  now,
  saving,
  canServe,
  onAction,
}: {
  order: StaffOrder;
  now: number;
  saving: boolean;
  canServe: boolean;
  onAction: (nextStatus: "PREPARING" | "READY" | "SERVED") => void;
}) {
  return (
    <Card
      size="sm"
      className="min-h-[224px] min-w-0 gap-0 rounded-[8px] border-[#d8d4cc] bg-[#fbfaf7] py-0 shadow-none"
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <h3 className="font-sans text-[18px] leading-6 font-semibold">
            {order.serviceType === "TAKEAWAY"
              ? `Nouto #${order.id}`
              : `#${order.id}`}
          </h3>
          <p className="mt-1 text-[12px] leading-5 text-[#767168]">
            {order.channel === "QR"
              ? "QR"
              : order.channel === "STAFF"
                ? "Tarjoilija"
                : order.serviceType === "TAKEAWAY"
                  ? "Mukaan"
                  : "Kassa"}
            {order.tableNo == null ? "" : ` · Pöytä ${order.tableNo}`} ·{" "}
            {timeFormatter.format(new Date(order.submittedAt))}
          </p>
        </div>
        <span className="shrink-0 rounded-[5px] bg-[#f1efea] px-2 py-1 font-sans text-[11px] text-[#514f49]">
          {order.status === "READY"
            ? timeFormatter.format(new Date(order.updatedAt))
            : elapsed(order.submittedAt, now)}
        </span>
      </div>
      <div className="flex-1 space-y-2 px-4 py-4 text-[14px] leading-5 text-[#2c2b27]">
        {order.items.map((item, index) => (
          <div key={index}>
            <p className="font-medium">
              {item.name} × {item.quantity}
            </p>
            {item.modifiers.length > 0 && (
              <p className="text-[12px] text-[#767168]">
                {item.modifiers.map((modifier) => modifier.name).join(", ")}
              </p>
            )}
            {item.note && (
              <p className="mt-2 border-l-[3px] border-[#a68c62] pl-2 text-[12px] text-[#6b5840]">
                Huomio: {item.note}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="px-4 pb-3">
        {order.status === "CONFIRMED" ? (
          <Button
            className="h-9 w-full rounded-[5px] bg-[#e7e5de] text-[12px] text-[#514f49] hover:bg-[#d8d4cc]"
            disabled={saving}
            onClick={() => onAction("PREPARING")}
          >
            Aloita
          </Button>
        ) : order.status === "PREPARING" ? (
          <Button
            className="h-9 w-full rounded-[5px] bg-[#e7e5de] text-[12px] text-[#514f49] hover:bg-[#d8d4cc]"
            disabled={saving}
            onClick={() => onAction("READY")}
          >
            Merkitse valmiiksi
          </Button>
        ) : canServe ? (
          <Button
            className="h-9 w-full rounded-[5px] bg-[#e4e5e2] text-[12px] text-[#514f49] hover:bg-[#d8d4cc]"
            disabled={saving}
            onClick={() => onAction("SERVED")}
          >
            Merkitse tarjoilluksi
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function matchesSearch(order: StaffOrder, query: string) {
  if (!query) return true;
  const text = [
    String(order.id),
    order.tableNo == null ? "" : String(order.tableNo),
    order.channel,
    ...order.items.flatMap((item) => [
      item.name,
      item.note ?? "",
      ...item.modifiers.map((modifier) => modifier.name),
    ]),
  ]
    .join(" ")
    .toLocaleLowerCase("fi-FI");
  return text.includes(query);
}

export default function KitchenPage() {
  const level = useContext(StaffRoleContext);
  const router = useRouter();
  const canServe = level === "admin";
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [state, setState] = useState<
    "loading" | "ready" | "error" | "forbidden"
  >("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const currentOrders = useRef<StaffOrder[]>([]);
  const watermark = useRef<string | null>(null);
  const pollCount = useRef(0);
  const busy = useRef(false);
  const requestedFull = useRef(false);
  const mounted = useRef(false);

  const sync = useCallback(async (forceFull = false) => {
    if (busy.current) {
      requestedFull.current ||= forceFull;
      return;
    }
    busy.current = true;
    try {
      // EN: Incremental updates include cancellation; periodic full reads repair missed or delayed changes.
      // FI: Osittaiset päivitykset sisältävät peruutukset; määräaikainen täysi haku korjaa väliin jääneet muutokset.
      const full = forceFull || !watermark.current || pollCount.current >= 12;
      const page = full
        ? await fetchKitchenSnapshot()
        : await fetchOrderPages({ updatedAfter: watermark.current! });
      if (!mounted.current) return;
      if (!full) {
        const cancelled = page.results.find(
          (order) =>
            order.status === "CANCELLED" &&
            currentOrders.current.some((current) => current.id === order.id),
        );
        if (cancelled)
          setNotice(`Tilaus #${cancelled.id} peruttu ja poistettu keittiöstä.`);
      }
      const merged = mergeKitchenOrders(
        full ? [] : currentOrders.current,
        page.results,
      );
      currentOrders.current = merged;
      setOrders(merged);
      watermark.current = new Date(
        Date.parse(page.serverTime) - 5_000,
      ).toISOString();
      pollCount.current = full ? 0 : pollCount.current + 1;
      setLastUpdate(page.serverTime);
      setError("");
      setState("ready");
    } catch (cause: unknown) {
      if (!mounted.current) return;
      if (
        isPermissionDeniedError(cause) ||
        (isAxiosError(cause) && cause.response?.status === 401)
      ) {
        currentOrders.current = [];
        watermark.current = null;
        pollCount.current = 0;
        setOrders([]);
        setPending(null);
        setLastUpdate(null);
        setError("");
        setState("forbidden");
      } else {
        setError(
          getApiErrorMessage(cause, "Keittiön tilauksia ei voitu päivittää."),
        );
        setState((previous) => (previous === "ready" ? "ready" : "error"));
      }
    } finally {
      busy.current = false;
      if (requestedFull.current) {
        requestedFull.current = false;
        watermark.current = null;
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const first = window.setTimeout(() => void sync(true), 0);
    const clock = window.setTimeout(() => setNow(Date.now()), 0);
    const polling = window.setInterval(() => void sync(), 5_000);
    const ticking = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      mounted.current = false;
      window.clearTimeout(first);
      window.clearTimeout(clock);
      window.clearInterval(polling);
      window.clearInterval(ticking);
    };
  }, [sync]);

  async function applyAction() {
    if (!pending || savingId !== null) return;
    const action = pending;
    setSavingId(action.id);
    setError("");
    try {
      const updated =
        action.nextStatus === "SERVED"
          ? await serveKitchenOrder(action.id, action.version)
          : await changeKitchenStatus(
              action.id,
              action.version,
              action.nextStatus,
            );
      const merged = mergeKitchenOrders(currentOrders.current, [updated]);
      currentOrders.current = merged;
      setOrders(merged);
      setPending(null);
      setNotice(
        action.nextStatus === "PREPARING"
          ? `Tilaus #${action.id} siirretty valmisteluun.`
          : action.nextStatus === "READY"
            ? `Tilaus #${action.id} merkitty valmiiksi.`
            : `Tilaus #${action.id} merkitty tarjoilluksi.`,
      );
      void sync(true);
    } catch (cause: unknown) {
      setPending(null);
      if (isAxiosError(cause) && cause.response?.status === 409) {
        setNotice(
          "Tilaus muuttui toisessa laitteessa. Päivitä tiedot ennen uutta toimintoa.",
        );
        void sync(true);
      } else if (
        isPermissionDeniedError(cause) ||
        (isAxiosError(cause) && cause.response?.status === 401)
      ) {
        currentOrders.current = [];
        watermark.current = null;
        pollCount.current = 0;
        setOrders([]);
        setLastUpdate(null);
        setError("");
        setState("forbidden");
      } else {
        setError(getApiErrorMessage(cause, "Tilausta ei voitu päivittää."));
      }
    } finally {
      setSavingId(null);
    }
  }

  const query = search.trim().toLocaleLowerCase("fi-FI");
  const stale =
    state === "ready" &&
    lastUpdate !== null &&
    now - Date.parse(lastUpdate) > 15_000;
  return (
    <div className="min-h-dvh min-w-0 bg-[#f5f3ef] font-sans text-[#1f201d]">
      <header className="flex min-h-[82px] flex-wrap items-center justify-between gap-3 bg-[#1f201d] px-6 py-3 text-[#fbfaf7] sm:px-8">
        <div>
          <h1 className="text-[26px] leading-7 font-semibold">Keittiö</h1>
          <p className="mt-1 text-[12px] text-[#d8d4cc]">
            {now ? headerFormatter.format(new Date(now)) : "—"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-[5px] bg-[#706f5e] px-3 py-1.5 text-[11px] font-medium">
            {error ? "Yhteys katkesi" : "Aktiivinen"}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-[#e7e5de] hover:bg-[#3a3b36] hover:text-white"
            aria-label="Hae tilauksia"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <Search aria-hidden="true" />
          </Button>
          {canServe && (
            <Button
              asChild
              variant="ghost"
              size="icon-sm"
              className="text-[#e7e5de] hover:bg-[#3a3b36] hover:text-white"
            >
              <Link
                href="/backoffice/settings/tables"
                aria-label="Avaa asetukset"
              >
                <Settings2 aria-hidden="true" />
              </Link>
            </Button>
          )}
          {level === "kitchen" && (
            <Button
              variant="ghost"
              className="text-[#e7e5de] hover:bg-[#3a3b36] hover:text-white"
              onClick={() => {
                clearAuthSession();
                router.replace("/signin");
              }}
            >
              <LogOut aria-hidden="true" /> Kirjaudu ulos
            </Button>
          )}
        </div>
        {searchOpen && (
          <label className="w-full text-xs text-[#d8d4cc]">
            Hae tilausta
            <input
              autoFocus
              className="mt-1 h-10 w-full rounded-md border border-[#706f5e] bg-[#fbfaf7] px-3 text-sm text-[#1f201d] sm:max-w-96"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Numero, pöytä tai ruoka"
            />
          </label>
        )}
      </header>

      <main className="mx-auto w-full max-w-[1440px] space-y-5 px-4 py-6 sm:px-7">
        {notice && (
          <p
            role="status"
            className="rounded-md border border-[#d8d4cc] bg-[#fbfaf7] p-3 text-sm"
          >
            {notice}
          </p>
        )}
        {(error || stale) && state === "ready" && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#a68c62] bg-[#fbfaf7] p-3 text-sm"
          >
            <p>
              {error
                ? `Yhteys katkesi. Näytetään viimeksi ladatut tiedot. ${error}`
                : "Tiedot voivat olla vanhentuneita. Tarkista yhteys."}
            </p>
            <Button variant="outline" size="sm" onClick={() => void sync(true)}>
              Yritä uudelleen
            </Button>
          </div>
        )}
        {state === "loading" ? (
          <LoadingState title="Keittiön tilauksia ladataan" />
        ) : state === "forbidden" ? (
          <ErrorState
            title="Ei käyttöoikeutta"
            description="Vain aktiivinen henkilökunta voi käyttää keittiötä."
          />
        ) : state === "error" ? (
          <ErrorState
            title="Keittiön tilauksia ei voitu ladata"
            description={error}
            action={
              <Button onClick={() => void sync(true)}>Yritä uudelleen</Button>
            }
          />
        ) : (
          <div className="grid min-w-0 gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-[30px]">
            {columns.map((column) => {
              const visible = orders.filter(
                (order) =>
                  order.status === column.status && matchesSearch(order, query),
              );
              return (
                <section
                  key={column.status}
                  aria-label={column.title}
                  className="min-w-0 space-y-6"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[20px] font-semibold">
                      {column.title}
                    </h2>
                    <span
                      className={`rounded-[5px] px-2 py-1 text-[11px] text-[#33473d] ${column.badgeClass}`}
                    >
                      {column.badge}
                    </span>
                  </div>
                  {visible.length === 0 ? (
                    <EmptyState
                      className="min-h-[224px] bg-[#fbfaf7]"
                      title={query ? "Ei hakutuloksia" : "Ei tilauksia"}
                      description={
                        query
                          ? "Kokeile toista hakua."
                          : "Uudet tilaukset näkyvät tässä automaattisesti."
                      }
                    />
                  ) : (
                    visible.map((order) => (
                      <KitchenCard
                        key={order.id}
                        order={order}
                        now={now}
                        saving={savingId === order.id}
                        canServe={canServe}
                        onAction={(nextStatus) =>
                          setPending({
                            id: order.id,
                            version: order.version,
                            nextStatus,
                          })
                        }
                      />
                    ))
                  )}
                </section>
              );
            })}
          </div>
        )}
        <p className="pt-3 text-[12px] text-[#767168]">
          {lastUpdate
            ? `Päivitetty ${timeFormatter.format(new Date(lastUpdate))} · kysely 5 s · WebSocket myöhemmässä vaiheessa`
            : "Kysely 5 s · WebSocket myöhemmässä vaiheessa"}
        </p>
      </main>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && savingId === null && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.nextStatus === "PREPARING"
                ? "Aloita valmistelu?"
                : pending?.nextStatus === "READY"
                  ? "Merkitse valmiiksi?"
                  : "Merkitse tarjoilluksi?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tilaus #{pending?.id} siirretään seuraavaan keittiön tilaan.
              Muutos näkyy myös muille laitteille.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingId !== null}>
              Takaisin
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={savingId !== null}
              onClick={(event) => {
                event.preventDefault();
                void applyAction();
              }}
            >
              {savingId !== null ? "Tallennetaan…" : "Vahvista"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
