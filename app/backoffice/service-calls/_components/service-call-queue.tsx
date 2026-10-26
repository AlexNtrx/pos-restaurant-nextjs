"use client";

import { RefreshButton } from "@/components/ui/refresh-button";

import { Button } from "@/components/ui/button";
import {
  useStaffServiceCalls,
  type StaffServiceCallsState,
} from "@/lib/use-staff-service-calls";

const timeOf = (value: string) =>
  new Date(value).toLocaleTimeString("fi-FI", {
    hour: "2-digit",
    minute: "2-digit",
  });

export default function ServiceCallQueue() {
  const queue = useStaffServiceCalls();
  return <ServiceCallQueueView queue={queue} />;
}

export function ServiceCallQueueView({
  queue,
}: {
  queue: StaffServiceCallsState;
}) {
  const { calls, loading, error, workingId, refresh, advance } = queue;
  return (
    <section className="font-sans">
      <header className="mb-7 flex justify-end">
        <RefreshButton type="button" onClick={() => void refresh()}>
          Päivitä
        </RefreshButton>
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
    </section>
  );
}
