import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { SentOrderView } from "../../../sale/_components/counter-sent-orders-list";

export function SentOrdersPanel({
  view = "active",
  busy = false,
  onViewChange,
  filters,
  loading,
  error,
  empty,
  children,
}: {
  view?: SentOrderView;
  busy?: boolean;
  onViewChange?: (view: SentOrderView) => void;
  filters: ReactNode;
  loading: boolean;
  error: string;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-surface"
      aria-label="Lähetetyt tilaukset"
      aria-busy={loading}
    >
      {/* EN: This workspace shows operational queues; historical orders are reviewed in Tilaushistoria.
          FI: Tämä työtila näyttää työjonot; aiemmat tilaukset tarkastellaan Tilaushistoriassa. */}
      <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:p-5">
        {filters}
        {onViewChange && (
          <div className="flex gap-2" role="group" aria-label="Tilausnäkymä">
            {(["active", "history"] as const).map((item) => (
              <Button
                key={item}
                type="button"
                className="min-h-11"
                variant={view === item ? "default" : "outline"}
                aria-pressed={view === item}
                disabled={busy}
                onClick={() => onViewChange(item)}
              >
                {item === "active" ? "Käynnissä" : "Historia"}
              </Button>
            ))}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="p-4 text-sm text-destructive sm:p-5">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="p-6 text-sm text-muted-foreground">
          Tilauksia ladataan…
        </p>
      )}
      {!loading && !error && empty && (
        <p className="flex min-h-40 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {view === "active"
            ? "Ei keskeneräisiä tilauksia."
            : "Ei päättyneitä tilauksia."}
        </p>
      )}
      {children}
    </section>
  );
}
