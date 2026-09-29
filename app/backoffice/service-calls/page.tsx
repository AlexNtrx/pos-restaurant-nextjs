"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  changeServiceCallStatus,
  loadStaffServiceCalls,
  serviceCallErrorText,
  type StaffServiceCall,
} from "@/lib/service-calls";

const timeOf = (value: string) =>
  new Date(value).toLocaleTimeString("fi-FI", {
    hour: "2-digit",
    minute: "2-digit",
  });

export default function ServiceCallsPage() {
  const [calls, setCalls] = useState<StaffServiceCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workingId, setWorkingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setCalls(await loadStaffServiceCalls());
      setError("");
    } catch (failure) {
      setError(serviceCallErrorText(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const advance = async (call: StaffServiceCall) => {
    setWorkingId(call.id);
    try {
      await changeServiceCallStatus(
        call,
        call.status === "REQUESTED" ? "ACKNOWLEDGED" : "RESOLVED",
      );
      await refresh();
    } catch (failure) {
      await refresh();
      setError(serviceCallErrorText(failure));
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl p-5 font-sans sm:p-8">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Henkilökunnan työjono</p>
          <h1 className="font-heading text-3xl font-semibold">Palvelukutsut</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Asiakkaiden QR-sivulta lähettämät kutsut päivittyvät
            automaattisesti.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void refresh()}>
          Päivitä
        </Button>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-destructive p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Ladataan palvelukutsuja…
        </p>
      ) : calls.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-sm text-muted-foreground">
          Avoimia palvelukutsuja ei ole.
        </div>
      ) : (
        <div className="space-y-3">
          {calls.map((call) => (
            <article
              key={call.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface p-5"
            >
              <div>
                <h2 className="text-lg font-semibold">Pöytä P{call.tableNo}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Kutsuttu klo {timeOf(call.createdAt)} ·{" "}
                  {call.status === "REQUESTED"
                    ? "Odottaa vastaanottoa"
                    : "Henkilökunta on tulossa"}
                </p>
              </div>
              <Button
                type="button"
                className="min-h-12"
                disabled={workingId !== null}
                onClick={() => void advance(call)}
              >
                {workingId === call.id
                  ? "Tallennetaan…"
                  : call.status === "REQUESTED"
                    ? "Ota vastaan"
                    : "Merkitse hoidetuksi"}
              </Button>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
