"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { getApiErrorMessage } from "@/lib/api-error";
import { loadStaffTables, type StaffTable } from "@/lib/tables";
import TableSessionCheckout from "@/components/payments/table-session-checkout";
import { listPendingTablePayments } from "@/lib/payments/table-payment-attempt";

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
        description="Tarkista tarjoillut tilaukset ja maksa pöydän koko lasku."
        actions={
          <Button variant="outline" onClick={() => void load()}>
            Päivitä
          </Button>
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
