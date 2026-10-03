"use client";

import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { OrderRefund } from "@/components/orders/order-refund";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import {
  fetchOrderDetail,
  fetchOrderPages,
  type OrderStatus,
  type StaffOrder,
  type StaffOrderDetail,
} from "@/app/backoffice/orders/inbox/_lib/staff-orders";

dayjs.extend(utc);
dayjs.extend(timezone);

const zone = "Europe/Helsinki";
const currency = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});
const dateTime = new Intl.DateTimeFormat("fi-FI", {
  timeZone: zone,
  dateStyle: "short",
  timeStyle: "short",
});
const statusLabels: Record<OrderStatus, string> = {
  SUBMITTED: "Odottaa",
  CONFIRMED: "Vahvistettu",
  REJECTED: "Hylätty",
  PREPARING: "Valmistetaan",
  READY: "Valmis keittiöstä",
  SERVED: "Tarjoiltu",
  PAID: "Maksettu",
  COMPLETED: "Päätetty",
  CANCELLED: "Peruttu",
};
const lifecycleFields = [
  ["submittedAt", "Lähetetty"],
  ["confirmedAt", "Vahvistettu"],
  ["rejectedAt", "Hylätty"],
  ["preparingAt", "Valmistus aloitettu"],
  ["readyAt", "Valmis keittiöstä"],
  ["servedAt", "Tarjoiltu"],
  ["paidAt", "Maksettu"],
  ["completedAt", "Päätetty"],
  ["cancelledAt", "Peruttu"],
] as const;

function formatTime(value: string) {
  return dateTime.format(new Date(value));
}

function orderStatusTone(status: OrderStatus) {
  if (status === "REJECTED" || status === "CANCELLED") return "danger";
  if (status === "COMPLETED" || status === "PAID") return "success";
  if (status === "SUBMITTED") return "warning";
  return "info";
}

export default function OrderRecordsPage() {
  const today = dayjs().tz(zone).format("YYYY-MM-DD");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [channel, setChannel] = useState<"ALL" | "COUNTER" | "QR" | "STAFF">(
    "ALL",
  );
  const [sessionInput, setSessionInput] = useState("");
  const [orders, setOrders] = useState<StaffOrder[]>([]);
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

  const openDetail = async (id: number) => {
    setSelectedId(id);
    setDetail(null);
    setDetailError("");
    try {
      setDetail(await fetchOrderDetail(id));
    } catch (reason: unknown) {
      setDetailError(
        getApiErrorMessage(reason, "Tilauksen tietoja ei voitu ladata."),
      );
    }
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
        <div className="overflow-x-auto">
          <Table className="min-w-[760px] text-[13px]">
            <TableHeader className="bg-[#efece6]">
              <TableRow>
                <TableHead>Tilaus</TableHead>
                <TableHead>Kanava</TableHead>
                <TableHead>Pöytä / istunto</TableHead>
                <TableHead>Summa</TableHead>
                <TableHead>Tila</TableHead>
                <TableHead className="text-right">Toiminto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">
                    #{order.id} · {formatTime(order.submittedAt)}
                  </TableCell>
                  <TableCell>
                    {order.channel === "QR"
                      ? "QR"
                      : order.channel === "STAFF"
                        ? "Tarjoilija"
                        : order.serviceType === "TAKEAWAY"
                          ? "Mukaan"
                          : "Kassa"}
                  </TableCell>
                  <TableCell>
                    {order.serviceType === "TAKEAWAY"
                      ? `Nouto #${order.id}`
                      : `${order.tableNo}${order.tableSessionId ? ` / #${order.tableSessionId}` : ""}`}
                  </TableCell>
                  <TableCell>{currency.format(order.total)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={orderStatusTone(order.status)}>
                      {statusLabels[order.status]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => void openDetail(order.id)}>
                      Avaa
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Aikavyöhyke: {zone}. Myyntiraportit ja vanhat myynnit perustuvat
        kuittihistoriaan.
      </p>
      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setDetail(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tilaus #{selectedId}</DialogTitle>
            <DialogDescription>
              {detail
                ? `${detail.serviceType === "TAKEAWAY" ? `Mukaan · Nouto #${detail.id}` : `${detail.channel === "QR" ? "QR" : detail.channel === "STAFF" ? "Tarjoilija" : "Kassa"} · pöytä ${detail.tableNo}`} · ${statusLabels[detail.status]}`
                : "Tilauksen tiedot"}
            </DialogDescription>
          </DialogHeader>
          {detailError ? (
            <p role="alert" className="text-sm text-destructive">
              {detailError}
            </p>
          ) : !detail ? (
            <LoadingState title="Tilausta ladataan" />
          ) : (
            <div className="space-y-5 text-sm">
              <OrderRefund
                key={detail.id}
                order={detail}
                onChanged={async () => {
                  setDetail(await fetchOrderDetail(detail.id));
                  await load();
                }}
              />
              <p className="font-medium">
                Tilauksen summa: {currency.format(detail.total)} ·{" "}
                {detail.tableSessionId
                  ? `istunto #${detail.tableSessionId}`
                  : "ei pöytäistuntoa"}
              </p>
              {(detail.rejectionReason || detail.cancellationReason) && (
                <p className="text-destructive">
                  Syy: {detail.rejectionReason || detail.cancellationReason}
                </p>
              )}
              <ul className="space-y-2">
                {detail.items.map((item, index) => (
                  <li key={index}>
                    {item.quantity} × {item.name} ·{" "}
                    {currency.format(item.lineTotal)}
                    {item.modifiers.length > 0
                      ? ` · ${item.modifiers.map((modifier) => modifier.name).join(", ")}`
                      : ""}
                    {item.note ? ` · ${item.note}` : ""}
                  </li>
                ))}
              </ul>
              <section aria-label="Tilauksen vaiheet">
                <h3 className="font-semibold">Vaiheet</h3>
                <dl className="mt-2 grid grid-cols-2 gap-2">
                  {lifecycleFields.map(
                    ([key, label]) =>
                      detail[key] && (
                        <div key={key}>
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd>{formatTime(detail[key]!)}</dd>
                        </div>
                      ),
                  )}
                </dl>
              </section>
              <section aria-label="Tilahistoria">
                <h3 className="font-semibold">Tilahistoria</h3>
                <ol className="mt-2 space-y-1">
                  {detail.history.map((event) => (
                    <li key={event.version}>
                      #{event.version} {statusLabels[event.toStatus]} ·{" "}
                      {formatTime(event.at)}
                      {event.reason ? ` · ${event.reason}` : ""}
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
