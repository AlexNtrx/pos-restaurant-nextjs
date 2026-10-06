"use client";

import type { QrContext } from "@/lib/qr-customer";
import { Button } from "@/components/ui/button";
import ServiceCallCard from "./service-call-card";

export function QrFrame({
  context,
  token,
  children,
}: {
  context: QrContext | null;
  token: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas font-sans text-foreground">
      <header className="bg-foreground text-surface">
        <div className="mx-auto flex min-h-[78px] max-w-xl items-center justify-between gap-3 px-5">
          <span className="min-w-0 truncate font-heading text-[22px] font-semibold">
            {context?.restaurantName || "Ravintola"}
          </span>
          {context && (
            <span className="shrink-0 rounded-md bg-olive px-2.5 py-1 text-xs">
              Pöytä P{context.tableNo}
            </span>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-xl px-5 pb-28 pt-7">
        {context && context.state !== "CLOSED" && (
          <ServiceCallCard token={token} />
        )}
        {children}
      </main>
    </div>
  );
}

export function QrProblem({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail: string;
  onRetry?: () => void;
}) {
  return (
    <div className="pt-12">
      <div className="rounded-lg border border-border bg-surface px-6 py-10 text-center">
        <div
          aria-hidden
          className="mx-auto mb-8 flex size-16 items-center justify-center rounded-full bg-stone text-2xl text-olive"
        >
          ×
        </div>
        <h1 className="font-heading text-3xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{detail}</p>
      </div>
      {onRetry && (
        <Button className="mt-8 h-12 w-full" onClick={onRetry}>
          Yritä uudelleen
        </Button>
      )}
      <p className="mt-7 text-xs text-muted-foreground">
        Jos ongelma jatkuu, ota yhteys henkilökuntaan.
      </p>
    </div>
  );
}
