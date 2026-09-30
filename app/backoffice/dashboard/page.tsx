"use client";

import Link from "next/link";
import { ClipboardList, Plus, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";

const operationalMetrics = [
  { key: "activeOrders", title: "Avoimet tilaukset" },
  { key: "kitchenQueue", title: "Keittiöjonossa" },
  { key: "readyOrders", title: "Valmiina" },
  { key: "openTables", title: "Avoimet pöydät" },
] as const;

type DashboardOrder = {
  id: number;
  channel: "COUNTER" | "QR" | "STAFF";
  status: string;
  tableNo: number | null;
  total: number;
  submittedAt: string;
};
type Operations = {
  metrics: Record<(typeof operationalMetrics)[number]["key"], number>;
  recentOrders: DashboardOrder[];
};
const currency = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});
const localTime = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  dateStyle: "short",
  timeStyle: "short",
});
const statusLabels: Record<string, string> = {
  SUBMITTED: "Odottaa",
  CONFIRMED: "Vahvistettu",
  REJECTED: "Hylätty",
  PREPARING: "Valmistetaan",
  READY: "Valmis",
  SERVED: "Tarjoiltu",
  PAID: "Maksettu",
  COMPLETED: "Valmis",
  CANCELLED: "Peruttu",
};

function isOperations(value: unknown): value is Operations {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  if (!result.metrics || typeof result.metrics !== "object") return false;
  const metrics = result.metrics as Record<string, unknown>;
  if (
    !operationalMetrics.every(
      ({ key }) =>
        typeof metrics[key] === "number" &&
        Number.isSafeInteger(metrics[key]) &&
        (metrics[key] as number) >= 0,
    ) ||
    !Array.isArray(result.recentOrders)
  )
    return false;
  // EN: Only Counter takeaway orders have no table; QR and waiter orders must retain their table number.
  // FI: Vain kassan noutotilaukset ovat pöydättömiä; QR- ja tarjoilijatilauksilla on oltava pöytänumero.
  return result.recentOrders.every(
    (order: unknown) =>
      !!order &&
      typeof order === "object" &&
      typeof (order as DashboardOrder).id === "number" &&
      ["COUNTER", "QR", "STAFF"].includes((order as DashboardOrder).channel) &&
      typeof (order as DashboardOrder).status === "string" &&
      (Number.isSafeInteger((order as DashboardOrder).tableNo) ||
        ((order as DashboardOrder).channel === "COUNTER" &&
          (order as DashboardOrder).tableNo === null)) &&
      Number.isFinite((order as DashboardOrder).total) &&
      typeof (order as DashboardOrder).submittedAt === "string" &&
      Number.isFinite(Date.parse((order as DashboardOrder).submittedAt)),
  );
}

const quickActions = [
  {
    href: "/backoffice/orders/new",
    label: "Uusi tilaus",
    description: "Aloita tilaus kassalla",
    icon: Plus,
  },
  {
    href: "/backoffice/orders/history",
    label: "Kuittihistoria",
    description: "Tarkastele valmiita myyntejä",
    icon: ReceiptText,
  },
  {
    href: "/backoffice/catalog/menu-items",
    label: "Ruokalista",
    description: "Tarkastele ruokalistan tuotteita",
    icon: ClipboardList,
  },
] as const;

export default function Dashboard() {
  const [operations, setOperations] = useState<Operations | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "error" | "forbidden"
  >("loading");
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.get<unknown>("/dashboard/operations");
      if (!isOperations(response.data))
        throw new Error("Palvelin palautti virheelliset yhteenvetotiedot.");
      setOperations(response.data);
      setUpdatedAt(new Date());
      setError("");
      setState("ready");
    } catch (reason: unknown) {
      setError(getApiErrorMessage(reason, "Yhteenvetoa ei voitu ladata."));
      setState(isPermissionDeniedError(reason) ? "forbidden" : "error");
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

  if (state === "loading") return <LoadingState title="Yhteenvetoa ladataan" />;
  if (state === "forbidden")
    return (
      <ErrorState
        title="Ei käyttöoikeutta"
        description="Vain ylläpitäjä voi nähdä yhteenvedon."
      />
    );
  if (state === "error" && !operations)
    return (
      <ErrorState
        title="Yhteenvetoa ei voitu ladata"
        description={error}
        action={<Button onClick={() => void load()}>Yritä uudelleen</Button>}
      />
    );

  return (
    <div className="tw04-layout space-y-8 font-sans">
      <PageHeader
        title="Tänään"
        description="Tilausten ajantasainen operatiivinen tilanne"
        actions={
          <Button size="sm" onClick={() => void load()}>
            Päivitä
          </Button>
        }
      />

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/35 bg-destructive/10 p-3 text-sm text-destructive"
        >
          Tiedot voivat olla vanhentuneita. {error}
        </p>
      )}

      <section
        aria-label="Operatiiviset tunnusluvut"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {operationalMetrics.map(({ key, title }) => (
          <OperationalMetric
            key={key}
            title={title}
            value={operations!.metrics[key]}
          />
        ))}
      </section>

      <section className="grid items-stretch gap-[20px] lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,1fr)]">
        <Card className="min-h-[348px] gap-0 py-0 shadow-none">
          <CardHeader className="flex min-h-[70px] flex-row items-center justify-between px-5 py-4 sm:px-6">
            <CardTitle className="font-sans text-xl">
              Viimeisimmät tilaukset
            </CardTitle>
            <Link
              href="/backoffice/orders/history/orders"
              className="text-[13px] font-medium text-olive underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Näytä kaikki →
            </Link>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0 pb-0">
            {operations!.recentOrders.length === 0 ? (
              <EmptyState
                title="Tilauksia ei löytynyt"
                description="Uudet tilaukset näkyvät tässä automaattisesti."
              />
            ) : (
              <Table className="min-w-[680px] text-[13px] lg:min-w-0">
                <TableHeader className="bg-transparent">
                  <TableRow className="h-11 hover:bg-transparent">
                    <TableHead className="pl-6">Tilaus</TableHead>
                    <TableHead>Tilauskanava</TableHead>
                    <TableHead>Pöytä</TableHead>
                    <TableHead>Yhteensä</TableHead>
                    <TableHead className="pr-6">Tila</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operations!.recentOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="pl-6">
                        #{order.id} ·{" "}
                        {localTime.format(new Date(order.submittedAt))}
                      </TableCell>
                      <TableCell>
                        {order.channel === "QR"
                          ? "QR"
                          : order.channel === "STAFF"
                            ? "Tarjoilija"
                            : "Kassa"}
                      </TableCell>
                      <TableCell>{order.tableNo ?? "Mukaan"}</TableCell>
                      <TableCell>{currency.format(order.total)}</TableCell>
                      <TableCell className="pr-6">
                        {statusLabels[order.status] ?? order.status}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[348px] gap-0 py-0 shadow-none">
          <CardHeader className="min-h-[70px] px-5 py-4 sm:px-6">
            <CardTitle className="font-sans text-xl">Pikatoiminnot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 px-4 pb-5 sm:px-5">
            {quickActions.map(({ href, label, description, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="grid min-h-[76px] grid-cols-[42px_minmax(0,1fr)] items-center gap-4 rounded-lg px-1 py-2 outline-none transition-colors hover:bg-muted/55 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-[42px] items-center justify-center rounded-lg bg-muted text-olive">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium text-foreground">
                    {label}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {description}
                  </span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>

      <p className="text-xs leading-5 text-muted-foreground" role="note">
        {updatedAt
          ? `Päivitetty ${localTime.format(updatedAt)} · kysely 15 s. `
          : ""}
        Tilaussummat eivät ole myyntiraportin tuloja.
      </p>
    </div>
  );
}

function OperationalMetric({ title, value }: { title: string; value: number }) {
  return (
    <Card size="sm" className="h-[126px] gap-2 py-4 shadow-none">
      <CardHeader className="px-4">
        <CardTitle className="font-sans text-[13px] font-normal text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-[27px] leading-8 font-semibold">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">Nykyinen tilanne</p>
      </CardContent>
    </Card>
  );
}
