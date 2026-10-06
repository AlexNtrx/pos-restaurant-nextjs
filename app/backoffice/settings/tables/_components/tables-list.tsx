"use client";

import { Pencil, QrCode, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatTableDate } from "../_lib/table-date";
import type { RestaurantTable } from "./types";

type Props = {
  tables: RestaurantTable[];
  isAdmin: boolean;
  busy: boolean;
  currentTime: number;
  onRefresh: () => void;
  onShowQr: (table: RestaurantTable) => void;
  onRotate: (table: RestaurantTable) => void;
  onCloseSession: (table: RestaurantTable) => void;
  onOpenSession: (table: RestaurantTable) => void;
  onEdit: (table: RestaurantTable) => void;
  onDelete: (table: RestaurantTable) => void;
};

export function TablesList({
  tables,
  isAdmin,
  busy,
  currentTime,
  onRefresh,
  onShowQr,
  onRotate,
  onCloseSession,
  onOpenSession,
  onEdit,
  onDelete,
}: Props) {
  const openCount = tables.filter((table) => table.openSession).length;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="gap-0 py-0">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Avoimet istunnot</p>
            <p className="font-heading text-3xl font-semibold">{openCount}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Vapaat pöydät</p>
            <p className="font-heading text-3xl font-semibold">
              {tables.length - openCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="tables-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2
              id="tables-heading"
              className="font-heading text-xl font-semibold"
            >
              Pöydät
            </h2>
            <p className="text-sm text-muted-foreground">
              {tables.length} aktiivista pöytää
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onRefresh}
          >
            <RefreshCw aria-hidden="true" /> Päivitä
          </Button>
        </div>
        {tables.length === 0 ? (
          <EmptyState
            title="Ei pöytiä"
            description={
              isAdmin
                ? "Lisää ensimmäinen pöytä aloittaaksesi."
                : "Ylläpitäjä ei ole vielä lisännyt pöytiä."
            }
          />
        ) : (
          <div className="grid gap-3">
            {tables.map((table) => {
              const session = table.openSession;
              const qrExpired = !!(
                session?.qrTokenExpiresAt &&
                Date.parse(session.qrTokenExpiresAt) <= currentTime
              );

              return (
                <Card key={table.id} className="gap-0 py-0">
                  <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="flex items-center gap-4">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted font-heading text-lg font-semibold">
                        {table.tableNo}
                      </div>
                      <div>
                        <h3 className="font-semibold">
                          Pöytä {table.tableNo}
                          {table.name ? ` · ${table.name}` : ""}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <StatusBadge tone={session ? "success" : "neutral"}>
                            {session ? "Avoin" : "Vapaa"}
                          </StatusBadge>
                          {qrExpired ? (
                            <span className="text-xs text-destructive">
                              QR-koodi on vanhentunut · luo uusi koodi
                            </span>
                          ) : session?.qrTokenExpiresAt ? (
                            <span className="text-xs text-muted-foreground">
                              QR voimassa{" "}
                              {formatTableDate(session.qrTokenExpiresAt)} asti
                            </span>
                          ) : session ? (
                            <span className="text-xs text-muted-foreground">
                              QR-koodia ei vielä ole
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {session ? (
                        <>
                          {session.qrTokenExpiresAt && !qrExpired && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => onShowQr(table)}
                            >
                              <QrCode aria-hidden="true" /> Näytä / tulosta QR
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => onRotate(table)}
                          >
                            Uusi koodi
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => onCloseSession(table)}
                          >
                            Sulje istunto
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => onOpenSession(table)}
                        >
                          Avaa istunto
                        </Button>
                      )}
                      {isAdmin && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Muokkaa pöytää ${table.tableNo}`}
                            disabled={busy}
                            onClick={() => onEdit(table)}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Poista pöytä ${table.tableNo}`}
                            disabled={busy || !!session}
                            onClick={() => onDelete(table)}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
