"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  RESTAURANT_TIME_ZONE,
  restaurantToday,
  restaurantDateRange,
} from "@/lib/restaurant-calendar";

import { Button } from "@/components/ui/button";
import { OrderRecordsList } from "./_components/order-records-list";
import { OrderRecordDetail } from "./_components/order-record-detail";

import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import { fetchOrderDetail, fetchOrderHistoryPage } from "@/lib/orders/client";
import { type StaffOrder, type StaffOrderDetail } from "@/lib/orders/contracts";

export default function OrderRecordsPage() {
  const today = restaurantToday();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [channel, setChannel] = useState<"ALL" | "COUNTER" | "QR" | "STAFF">(
    "ALL",
  );
  const [sessionInput, setSessionInput] = useState("");
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const pageCursors = useRef<(string | null)[]>([null]);
  const listRequest = useRef<AbortController | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "error" | "forbidden"
  >("loading");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StaffOrderDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const requestSequence = useRef(0);

  const resetHistory = () => {
    requestSequence.current += 1;
    listRequest.current?.abort();
    pageCursors.current = [null];
    setOrders([]);
    setPage(1);
    setNextCursor(null);
    setState("loading");
  };

  const load = useCallback(
    async (cursor: string | null = null, pageNumber = 1) => {
      const requestId = ++requestSequence.current;
      listRequest.current?.abort();
      const controller = new AbortController();
      listRequest.current = controller;
      if (!fromDate || !toDate || fromDate > toDate) {
        setError("Tarkista päivämääräväli.");
        setState("error");
        return;
      }
      if (sessionInput && !/^[1-9]\d*$/.test(sessionInput)) {
        setError(
          "Pöytäistunnon tunnuksen on oltava positiivinen kokonaisluku.",
        );
        setState("error");
        return;
      }
      const tableSessionId = sessionInput ? Number(sessionInput) : undefined;
      if (
        tableSessionId !== undefined &&
        !Number.isSafeInteger(tableSessionId)
      ) {
        setError("Pöytäistunnon tunnus on liian suuri.");
        setState("error");
        return;
      }
      setState("loading");
      setError("");
      try {
        // EN: Helsinki calendar days are converted to an exclusive UTC range before the server filters submittedAt.
        // FI: Helsingin kalenteripäivät muunnetaan yksinomaisen ylärajan UTC-väliksi ennen kuin palvelin suodattaa submittedAt-kentän.
        const result = await fetchOrderHistoryPage(
          {
            ...restaurantDateRange(fromDate, toDate),
            ...(channel === "ALL" ? {} : { channel }),
            ...(tableSessionId === undefined ? {} : { tableSessionId }),
          },
          cursor,
          controller.signal,
        );
        if (requestId !== requestSequence.current) return;
        setOrders(result.results);
        setNextCursor(result.nextCursor);
        // EN: Retain only page-start cursors, never previously loaded Order rows; refresh and filter changes restart the chain.
        // FI: Säilytä vain sivujen alkukohdistimet, älä aiemmin ladattuja tilausrivejä; päivitys ja suodatinmuutokset aloittavat ketjun uudelleen.
        pageCursors.current = [
          ...pageCursors.current.slice(0, pageNumber - 1),
          cursor,
        ];
        setState("ready");
        setPage(pageNumber);
      } catch (reason: unknown) {
        if (requestId !== requestSequence.current) return;
        setError(getApiErrorMessage(reason, "Tilauksia ei voitu ladata."));
        setState(isPermissionDeniedError(reason) ? "forbidden" : "error");
      }
    },
    [channel, fromDate, sessionInput, toDate],
  );

  useEffect(() => {
    const requestId = window.setTimeout(() => void load(), 300);
    return () => {
      window.clearTimeout(requestId);
      requestSequence.current += 1;
      listRequest.current?.abort();
    };
  }, [load]);

  const detailGeneration = useRef(0);
  const selectedOrderRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      detailGeneration.current += 1;
      selectedOrderRef.current = null;
    },
    [],
  );

  // EN: Closing or replacing a detail invalidates late responses, including refund refreshes.
  // FI: Tietonäkymän sulkeminen tai vaihtaminen mitätöi myöhäiset vastaukset, myös hyvityspäivitykset.
  const readSelectedDetail = async (id: number) => {
    const generation = ++detailGeneration.current;
    try {
      const result = await fetchOrderDetail(id);
      if (
        generation === detailGeneration.current &&
        selectedOrderRef.current === id
      ) {
        if (result.id !== id) throw new Error("Virheellinen tilauksen tunnus.");
        setDetail(result);
      }
    } catch (reason: unknown) {
      if (
        generation === detailGeneration.current &&
        selectedOrderRef.current === id
      )
        setDetailError(
          getApiErrorMessage(reason, "Tilauksen tietoja ei voitu ladata."),
        );
    }
  };

  const openDetail = async (id: number) => {
    selectedOrderRef.current = id;
    setSelectedId(id);
    setDetail(null);
    setDetailError("");
    await readSelectedDetail(id);
  };

  return (
    <div className="tw04-layout space-y-6 font-sans">
      <PageHeader
        title="Tilaushistoria"
        description="Tilaukset, kuitit sekä peruutukset ja palautukset yhdessä paikassa."
        actions={
          <Button
            size="sm"
            onClick={() => void load()}
            disabled={state === "loading"}
          >
            Päivitä
          </Button>
        }
      />
      <section
        aria-label="Tilaushistorian suodattimet"
        className="grid gap-3 border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_minmax(130px,1fr)_minmax(130px,1fr)_auto]"
      >
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Alkaen
          <Input
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value);
              resetHistory();
            }}
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Päättyen
          <Input
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value);
              resetHistory();
            }}
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Tilauskanava
          <select
            className="h-10 w-full rounded-md border border-input bg-surface px-3 text-sm text-foreground"
            value={channel}
            onChange={(event) => {
              setChannel(event.target.value as typeof channel);
              resetHistory();
            }}
          >
            <option value="ALL">Kaikki</option>
            <option value="COUNTER">Kassa</option>
            <option value="QR">QR</option>
            <option value="STAFF">Tarjoilija</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Pöytäistunto
          <Input
            inputMode="numeric"
            placeholder="Kaikki"
            value={sessionInput}
            onChange={(event) => {
              setSessionInput(event.target.value);
              resetHistory();
            }}
          />
        </label>
        <Button
          size="sm"
          className="self-end"
          onClick={() => void load()}
          disabled={state === "loading"}
        >
          Näytä
        </Button>
      </section>
      {state === "loading" ? (
        <LoadingState title="Tilauksia ladataan" />
      ) : state === "forbidden" ? (
        <ErrorState
          title="Ei käyttöoikeutta"
          description="Sinulla ei ole oikeutta tarkastella tilaushistoriaa."
        />
      ) : state === "error" ? (
        <ErrorState
          title="Tilauksia ei voitu ladata"
          description={error}
          action={<Button onClick={() => void load()}>Yritä uudelleen</Button>}
        />
      ) : orders.length === 0 ? (
        <EmptyState
          title="Tilauksia ei löytynyt"
          description="Valitulla aikavälillä ei ole tilauksia."
        />
      ) : (
        <div>
          <div
            className="overflow-x-auto"
            role="region"
            aria-label="Tilauslista"
            tabIndex={0}
          >
            <OrderRecordsList visibleOrders={orders} openDetail={openDetail} />
          </div>
        </div>
      )}
      {(state === "ready" || state === "loading") &&
        (orders.length > 0 || page > 1) && (
          <nav
            aria-label="Tilaushistorian sivut"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p
              aria-live="polite"
              aria-atomic="true"
              className="text-sm text-muted-foreground"
            >
              Sivu {page} ·{" "}
              {orders.length > 0
                ? `${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + orders.length}`
                : "0"}{" "}
              tilausta
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={state !== "ready" || page <= 1}
                onClick={() =>
                  void load(pageCursors.current[page - 2], page - 1)
                }
              >
                Edellinen
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={state !== "ready" || nextCursor === null}
                onClick={() => void load(nextCursor, page + 1)}
              >
                Seuraava
              </Button>
            </div>
          </nav>
        )}
      <p className="text-[11px] text-muted-foreground">
        Aikavyöhyke: {RESTAURANT_TIME_ZONE}. Päivä vaihtuu klo 00.00.
        Päivämääräväli perustuu tilauksen lähetysaikaan. Kuitit perustuvat
        alkuperäisiin maksutietoihin. Tilaussummat eivät ole myyntituloja.
      </p>
      <OrderRecordDetail
        selectedId={selectedId}
        detail={detail}
        detailError={detailError}
        onOpenChange={(open) => {
          if (!open) {
            detailGeneration.current += 1;
            selectedOrderRef.current = null;
            setSelectedId(null);
            setDetail(null);
          }
        }}
        onChanged={async () => {
          if (detail) await readSelectedDetail(detail.id);
          await load();
        }}
      />
    </div>
  );
}
