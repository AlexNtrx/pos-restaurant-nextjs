"use client";

import { RefreshButton } from "@/components/ui/refresh-button";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { getApiErrorMessage } from "@/lib/api-error";
import { loadStaffTables, type StaffTable } from "@/lib/tables";
import TableSessionCheckout from "@/components/payments/table-session-checkout";
import { listPendingTablePayments } from "@/lib/payments/table-payment-attempt";
import QrTableOrders from "../../sale/_components/qr-table-orders";

// EN: Cashiers reach table settlement from Kassa without gaining table or QR administration.
// FI: Kassatyöntekijät pääsevät pöydän maksuun Kassasta saamatta pöytä- tai QR-hallinnan oikeuksia.
export default function TablePaymentsPage() {
  const [tables, setTables] = useState<StaffTable[]>([]);
  const [pending, setPending] = useState<
    { sessionId: number; tableNo: number }[]
  >([]);
  const [selected, setSelected] = useState<{
    sessionId: number;
    tableNo: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailTable, setDetailTable] = useState<number | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setError("");
      setTables(await loadStaffTables());
      setPending(listPendingTablePayments());
    } catch (cause) {
      setError(getApiErrorMessage(cause, "Pöytiä ei voitu ladata."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  if (loading) return <LoadingState title="Pöytien maksuja ladataan" />;
  if (error)
    return (
      <ErrorState
        title="Pöytiä ei voitu ladata"
        description={error}
        action={<Button onClick={() => void load()}>Yritä uudelleen</Button>}
      />
    );
  return (
    <main className="space-y-5">
      <PageHeader
        title="Pöytien maksut"
        actions={
          <RefreshButton onClick={() => void load()}>Päivitä</RefreshButton>
        }
      />
      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Keskeneräisten maksujen tarkistus</h2>
          {pending.map((item) => (
            <Button
              key={item.sessionId}
              variant="outline"
              onClick={() => setSelected(item)}
            >
              Tarkista pöydän {item.tableNo} maksu · istunto #{item.sessionId}
            </Button>
          ))}
        </section>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tables
          .filter((table) => table.openSession)
          .map((table) => (
            <li key={table.id} className="space-y-3 rounded-lg border p-4">
              <h2 className="font-semibold">Pöytä {table.tableNo}</h2>
              <div className="flex flex-wrap gap-4">
                <Button
                  variant="outline"
                  aria-expanded={detailTable === table.tableNo}
                  aria-controls={`table-order-details-${table.tableNo}`}
                  onClick={() =>
                    setDetailTable(
                      detailTable === table.tableNo ? null : table.tableNo,
                    )
                  }
                >
                  Näytä tilaukset · Pöytä {table.tableNo}
                </Button>
                <Button
                  onClick={() =>
                    setSelected({
                      sessionId: table.openSession!.id,
                      tableNo: table.tableNo,
                    })
                  }
                >
                  Tarkista ja maksa
                </Button>
              </div>
              {detailTable === table.tableNo && (
                <section
                  id={`table-order-details-${table.tableNo}`}
                  className="rounded-lg border p-4"
                  aria-label={`Pöydän ${detailTable} tilausten tiedot`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold">
                      Pöytä {detailTable} · tilaukset
                    </h2>
                    <Button
                      variant="ghost"
                      onClick={() => setDetailTable(null)}
                    >
                      Sulje tiedot
                    </Button>
                  </div>
                  <QrTableOrders key={detailTable} tableNo={detailTable} />
                </section>
              )}
            </li>
          ))}
      </ul>
      {!tables.some((table) => table.openSession) && (
        <p>Ei avoimia pöytäistuntoja.</p>
      )}
      {selected && (
        <TableSessionCheckout
          key={selected.sessionId}
          sessionId={selected.sessionId}
          tableNo={selected.tableNo}
          onClose={() => setSelected(null)}
          onSettled={load}
        />
      )}
    </main>
  );
}
