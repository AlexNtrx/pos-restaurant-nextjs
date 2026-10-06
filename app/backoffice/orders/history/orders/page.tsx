"use client";

import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ListPagination } from "@/components/ui/list-pagination";
import { OrderRecordsList } from "./_components/order-records-list";
import { OrderRecordDetail } from "./_components/order-record-detail";

import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import { fetchOrderDetail, fetchOrderPages } from "@/lib/orders/client";
import { type StaffOrder, type StaffOrderDetail } from "@/lib/orders/contracts";

dayjs.extend(utc);
dayjs.extend(timezone);

const zone = "Europe/Helsinki";
export default function OrderRecordsPage() {
  const today = dayjs().tz(zone).format("YYYY-MM-DD");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [channel, setChannel] = useState<"ALL" | "COUNTER" | "QR" | "STAFF">(
    "ALL",
  );
  const [sessionInput, setSessionInput] = useState("");
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(orders.length / pageSize)),
  );
  const visibleOrders = orders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const [state, setState] = useState<
    "loading" | "ready" | "error" | "forbidden"
  >("loading");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StaffOrderDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    if (!fromDate || !toDate || fromDate > toDate) {
      setError("Tarkista päivämääräväli.");
      setState("error");
      return;
    }
    if (sessionInput && !/^[1-9]\d*$/.test(sessionInput)) {
      setError("Pöytäistunnon tunnuksen on oltava positiivinen kokonaisluku.");
      setState("error");
      return;
    }
    const tableSessionId = sessionInput ? Number(sessionInput) : undefined;
    if (tableSessionId !== undefined && !Number.isSafeInteger(tableSessionId)) {
      setError("Pöytäistunnon tunnus on liian suuri.");
      setState("error");
      return;
    }
    setState("loading");
    setError("");
    try {
      // EN: Helsinki calendar days are converted to an exclusive UTC range before the server filters submittedAt.
      // FI: Helsingin kalenteripäivät muunnetaan yksinomaisen ylärajan UTC-väliksi ennen kuin palvelin suodattaa submittedAt-kentän.
      const page = await fetchOrderPages({
        submittedFrom: dayjs
          .tz(fromDate, "YYYY-MM-DD", zone)
          .startOf("day")
          .toISOString(),
        submittedBefore: dayjs
          .tz(toDate, "YYYY-MM-DD", zone)
          .add(1, "day")
          .startOf("day")
          .toISOString(),
        ...(channel === "ALL" ? {} : { channel }),
        ...(tableSessionId === undefined ? {} : { tableSessionId }),
      });
      if (requestId !== requestSequence.current) return;
      setOrders(
        [...page.results].sort(
          (left, right) =>
            Date.parse(right.submittedAt) - Date.parse(left.submittedAt) ||
            right.id - left.id,
        ),
      );
      setState("ready");
      setPage(1);
    } catch (reason: unknown) {
      if (requestId !== requestSequence.current) return;
      setError(getApiErrorMessage(reason, "Tilauksia ei voitu ladata."));
      setState(isPermissionDeniedError(reason) ? "forbidden" : "error");
    }
  }, [channel, fromDate, sessionInput, toDate]);

  useEffect(() => {
    const requestId = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(requestId);
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
        description="Kaikki Orders, myös maksamattomat, hylätyt ja perutut. Tilaussummat eivät ole myyntituloja."
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
            onChange={(event) => setFromDate(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Päättyen
          <Input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Tilauskanava
          <select
            className="h-10 w-full rounded-md border border-input bg-surface px-3 text-sm text-foreground"
            value={channel}
            onChange={(event) =>
              setChannel(event.target.value as typeof channel)
            }
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
            onChange={(event) => setSessionInput(event.target.value)}
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
          description="Valitulla aikavälillä ei ole Orders-tietueita. Vanhemmat myynnit näkyvät kuittihistoriassa."
        />
      ) : (
        <div>
          <div className="overflow-x-auto">
            <OrderRecordsList
              visibleOrders={visibleOrders}
              openDetail={openDetail}
            />
          </div>
          <ListPagination
            label="Tilaushistorian sivut"
            total={orders.length}
            page={currentPage}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Aikavyöhyke: {zone}. Myyntiraportit ja vanhat myynnit perustuvat
        kuittihistoriaan.
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
