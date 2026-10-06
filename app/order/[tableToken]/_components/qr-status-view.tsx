"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { isAxiosError } from "axios";
import { Button } from "@/components/ui/button";
import { usePolling } from "@/lib/use-polling";
import {
  loadQrOrder,
  qrErrorText,
  qrMoney,
  type QrOrder,
} from "@/lib/qr-customer";
import { pathFor } from "./qr-navigation";
import { QrProblem } from "./qr-view-shell";

export function QrStatusView({
  token,
  orderId,
  confirmation,
  canOrderAgain,
}: {
  token: string;
  orderId: number | null;
  confirmation: boolean;
  canOrderAgain: boolean;
}) {
  const router = useRouter();
  const [order, setOrder] = useState<QrOrder | null>(null);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const poll = useCallback(
    async (signal: AbortSignal) => {
      if (!orderId) return;
      try {
        const result = await loadQrOrder(token, orderId, signal);
        if (signal.aborted) return;
        setOrder(result);
        setError("");
      } catch (failure) {
        if (signal.aborted) return;
        if (
          isAxiosError(failure) &&
          [403, 404, 410].includes(failure.response?.status ?? 0)
        ) {
          setOrder(null);
          setUnavailable(true);
        }
        setError(qrErrorText(failure));
        throw failure;
      }
    },
    [token, orderId],
  );
  const refresh = usePolling(poll, {
    intervalMs: 10_000,
    enabled: Boolean(orderId) && !unavailable,
  });
  if (!orderId)
    return (
      <QrProblem
        title="Tilausta ei löytynyt"
        detail="Avaa vahvistuslinkki tai lähetä uusi tilaus."
        onRetry={() => router.push(pathFor(token))}
      />
    );
  if (!order && error)
    return (
      <QrProblem
        title="Tilauksen tila ei avaudu"
        detail={error}
        onRetry={() => void refresh()}
      />
    );
  if (!order) return <p role="status">Ladataan tilausta…</p>;
  const stages = [
    {
      label: "Tilaus vastaanotettu",
      statuses: [
        "SUBMITTED",
        "CONFIRMED",
        "PREPARING",
        "READY",
        "SERVED",
        "PAID",
        "COMPLETED",
      ],
    },
    {
      label: "Valmistelussa",
      statuses: ["PREPARING", "READY", "SERVED", "PAID", "COMPLETED"],
    },
    { label: "Valmis", statuses: ["READY", "SERVED", "PAID", "COMPLETED"] },
  ];
  const terminalError = ["REJECTED", "CANCELLED"].includes(order.status);
  const statusLabel: Record<string, string> = {
    SUBMITTED: "Vastaanotettu",
    CONFIRMED: "Vahvistettu",
    PREPARING: "Valmistelussa",
    READY: "Valmis",
    SERVED: "Tarjoiltu",
    PAID: "Maksettu",
    COMPLETED: "Valmis",
    REJECTED: "Hylätty",
    CANCELLED: "Peruttu",
  };
  return (
    <>
      {confirmation && (
        <p className="mb-3 rounded-lg bg-[#e9eee8] p-3 text-sm text-olive">
          Tilaus lähetetty onnistuneesti.
        </p>
      )}
      <h1 className="font-heading text-3xl font-semibold">
        Tilaus #{order.id}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Lähetetty{" "}
        {new Date(order.submittedAt).toLocaleTimeString("fi-FI", {
          hour: "2-digit",
          minute: "2-digit",
        })}{" "}
        · Pöytä P{order.tableNo}
      </p>
      <section className="mt-7 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-medium">Tilauksen tila</h2>
        {terminalError ? (
          <p role="status" className="mt-4 text-destructive">
            Tilaus on {order.status === "REJECTED" ? "hylätty" : "peruttu"}. Ota
            yhteys henkilökuntaan.
          </p>
        ) : (
          <ol className="mt-5 space-y-5 border-l-2 border-olive pl-6">
            {stages.map((stage) => (
              <li key={stage.label} className="relative text-sm">
                <span
                  aria-hidden
                  className={`absolute -left-[33px] top-0 flex size-4 items-center justify-center rounded-full ${stage.statuses.includes(order.status) ? "bg-olive text-surface" : "bg-stone text-olive"}`}
                >
                  •
                </span>
                {stage.label}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-5 text-xs text-muted-foreground">
          Nykyinen tila: {statusLabel[order.status] || "Päivitetään"}
        </p>
      </section>
      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-medium">Tuotteet</h2>
        <div className="mt-4 space-y-3">
          {order.items.map((item, index) => (
            <div key={index} className="flex justify-between gap-3 text-sm">
              <div>
                {item.name} × {item.quantity}
                {item.modifiers.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {item.modifiers
                      .map((modifier) => modifier.name)
                      .join(" · ")}
                  </p>
                )}
                {item.note && <p className="text-xs text-olive">{item.note}</p>}
              </div>
              <span>{qrMoney(item.lineTotal)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-between border-t border-border pt-4 font-semibold">
          <span>Yhteensä</span>
          <span>{qrMoney(order.total)}</span>
        </div>
      </section>
      <p className="mt-7 text-sm text-muted-foreground">
        Tämä näkymä päivittyy automaattisesti.
      </p>
      <p className="mt-5 text-sm text-olive">
        Ota yhteys henkilökuntaan, jos haluat muuttaa tilausta.
      </p>
      {canOrderAgain && (
        <Button
          variant="outline"
          className="mt-6 h-12 w-full"
          onClick={() => router.push(pathFor(token))}
        >
          Tilaa lisää
        </Button>
      )}
      {confirmation && (
        <Button
          className="mt-6 h-12 w-full"
          onClick={() =>
            router.replace(pathFor(token, `/status?orderId=${order.id}`))
          }
        >
          Seuraa tilausta
        </Button>
      )}
    </>
  );
}
