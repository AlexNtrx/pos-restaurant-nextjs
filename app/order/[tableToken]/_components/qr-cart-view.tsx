"use client";

import { useRef, useState } from "react";
import { moneySum, moneyMultiply } from "@/lib/money";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { isMutationRejected } from "@/lib/mutation-outcome";
import { pathFor } from "./qr-navigation";
import {
  qrErrorText,
  qrMoney,
  readQrCart,
  readQrPending,
  submitQrOrder,
  writeLastQrOrder,
  writeQrCart,
  writeQrPending,
  type QrCartItem,
  type QrMenu,
  type QrPending,
} from "@/lib/qr-customer";

export function QrCartView({ token, menu }: { token: string; menu: QrMenu }) {
  const router = useRouter();
  const [cart, setCart] = useState<QrCartItem[]>(() => readQrCart(token));
  const [pending, setPending] = useState<QrPending | null>(() =>
    readQrPending(token),
  );
  const [busy, setBusy] = useState(false);
  const [confirmedOrderId, setConfirmedOrderId] = useState<number | null>(null);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const rows = cart.map((item, index) => {
    const category = menu.categories.find((row) =>
      row.food.some((food) => food.id === item.foodId),
    );
    const food = category?.food.find((row) => row.id === item.foodId);
    const size = category?.foodSizes.find((row) => row.id === item.foodSizeId);
    const taste = category?.tastes.find((row) => row.id === item.tasteId);
    return {
      item,
      index,
      food,
      size,
      taste,
      total: moneyMultiply(
        moneySum([food?.price ?? 0, size?.moneyAdded ?? 0]),
        item.quantity,
      ),
    };
  });
  const missing = rows.some(
    (row) =>
      !row.food ||
      (row.item.foodSizeId && !row.size) ||
      (row.item.tasteId && !row.taste),
  );
  const total = moneySum(rows.map((row) => row.total));
  const change = (index: number, quantity: number) => {
    if (inFlight.current || pending || confirmedOrderId) return;
    const next = cart.flatMap((item, itemIndex) =>
      itemIndex !== index
        ? [item]
        : quantity > 0
          ? [{ ...item, quantity }]
          : [],
    );
    if (next.reduce((sum, item) => sum + item.quantity, 0) > 200) return;
    setCart(next);
    writeQrCart(token, next);
  };
  const submit = async () => {
    if (
      inFlight.current ||
      (confirmedOrderId && !error) ||
      (!pending && (missing || menu.state !== "ORDERING"))
    )
      return;
    inFlight.current = true;
    const attempt = pending || {
      idempotencyKey: crypto.randomUUID(),
      expectedTotal: total,
      items: cart,
    };
    setBusy(true);
    setError("");
    let requestSent = false;
    let receivedOrderId = confirmedOrderId;
    try {
      if (!pending) {
        writeQrPending(token, attempt);
        setPending(attempt);
      }
      requestSent = true;
      const result = await submitQrOrder(token, attempt);
      receivedOrderId = result.orderId;
      setConfirmedOrderId(result.orderId);
      writeLastQrOrder(token, result.orderId);
      writeQrCart(token, []);
      writeQrPending(token, null);
      router.replace(pathFor(token, `/confirmation?orderId=${result.orderId}`));
    } catch (failure) {
      // EN: A confirmed Order remains successful even if local cleanup fails; recovery still replays its exact request.
      // FI: Vahvistettu tilaus pysyy onnistuneena, vaikka paikallinen siivous epäonnistuu; palautus toistaa saman pyynnön.
      setError(
        receivedOrderId
          ? "Tilauksen vahvistusta ei voitu viimeistellä tällä laitteella. Yritä samaa tilausta uudelleen tai pyydä henkilökuntaa tarkistamaan tilaus."
          : !requestSent
            ? "Tilausta ei lähetetty, koska sitä ei voitu tallentaa tälle laitteelle. Yritä uudelleen tai pyydä henkilökunnalta apua."
            : isMutationRejected(failure)
              ? `Tilausta ei hyväksytty. ${qrErrorText(failure)}`
              : qrErrorText(failure),
      );
      // EN: A definitive HTTP rejection can be corrected; an unknown network outcome must retry unchanged.
      // FI: Varma HTTP-hylkäys voidaan korjata; epäselvä verkkotulos on yritettävä uudelleen muuttumattomana.
      if (!receivedOrderId && isMutationRejected(failure)) {
        writeQrPending(token, null);
        setPending(null);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        variant="secondary"
        className="mb-5 min-h-11 bg-gray-200 px-4 text-gray-900 hover:bg-gray-300"
        disabled={busy || confirmedOrderId !== null}
        onClick={() => router.push(pathFor(token))}
      >
        ← Ruokalista
      </Button>
      <h1 className="font-heading text-3xl font-semibold">Ostoskori</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tarkista tilaus ennen lähettämistä pöytään P{menu.tableNo}.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Voit muuttaa huomautuksia palaamalla ruokalistaan.
      </p>
      <div className="mt-6 space-y-3">
        {rows.length === 0 && (
          <p className="rounded-lg border border-border bg-surface p-5 text-sm">
            Ostoskori on tyhjä.
          </p>
        )}
        {rows.map((row) => (
          <article
            key={row.index}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <div className="flex justify-between gap-4">
              <h2 className="min-w-0 break-words font-medium">
                {row.food?.name || "Tuote ei ole enää saatavilla"}
              </h2>
              <span className="shrink-0 tabular-nums">
                {qrMoney(row.total)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {[row.size?.name, row.taste?.name].filter(Boolean).join(" · ")}
            </p>
            {row.item.note && (
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-olive">
                Huomautus keittiölle: {row.item.note}
              </p>
            )}
            {!pending && !busy && !confirmedOrderId && (
              <div className="mt-3 flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={`Vähennä ${row.food?.name || "tuote"}`}
                  onClick={() => change(row.index, row.item.quantity - 1)}
                >
                  −
                </Button>
                <span>{row.item.quantity}</span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={`Lisää ${row.food?.name || "tuote"}`}
                  onClick={() => change(row.index, row.item.quantity + 1)}
                >
                  +
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => change(row.index, 0)}
                >
                  Poista
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>
      {missing && !pending && !confirmedOrderId && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Jokin tuote tai valinta ei ole enää saatavilla. Poista se
          ostoskorista.
        </p>
      )}
      {busy && (
        <p role="status" className="mt-4 text-sm text-olive">
          Lähetetään tilausta… Odota vahvistusta.
        </p>
      )}
      {!busy && confirmedOrderId && (
        <p role="status" className="mt-4 text-sm text-olive">
          Tilaus #{confirmedOrderId} vastaanotettu.
        </p>
      )}
      {pending && !busy && !confirmedOrderId && (
        <p role="status" className="mt-4 text-sm text-olive">
          Edellisen lähetyksen tulos on epäselvä. Yritä samaa tilausta
          uudelleen; älä muuta ostoskoria.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <section
        aria-label="Tilausyhteenveto"
        className="mt-6 border-t border-border pt-4"
      >
        <h2 className="font-semibold">Tilausyhteenveto</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {rows.map((row) => (
            <li
              key={row.index}
              className="flex items-start justify-between gap-3"
            >
              <span className="min-w-0 break-words">
                {row.item.quantity} ×{" "}
                {row.food?.name || "Tuote ei ole enää saatavilla"}
                {[row.size?.name, row.taste?.name].filter(Boolean).length >
                  0 && (
                  <span>
                    {" "}
                    ·{" "}
                    {[row.size?.name, row.taste?.name]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
                {row.item.note && (
                  <span className="text-olive"> ({row.item.note})</span>
                )}
              </span>
              <span className="shrink-0 tabular-nums">
                {qrMoney(row.total)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t border-border pt-4 font-semibold">
          <span>Yhteensä</span>
          <span className="shrink-0 tabular-nums">{qrMoney(total)}</span>
        </div>
      </section>
      <Button
        className="mt-6 h-12 w-full"
        disabled={
          busy ||
          (confirmedOrderId !== null && !error) ||
          (!pending && (!cart.length || missing || menu.state !== "ORDERING"))
        }
        onClick={submit}
      >
        {busy
          ? "Lähetetään…"
          : confirmedOrderId && !error
            ? "Tilaus vastaanotettu"
            : pending
              ? "Yritä lähettää sama tilaus uudelleen"
              : "Lähetä tilaus"}
      </Button>
      {menu.state !== "ORDERING" && (
        <p className="mt-3 text-sm text-olive">
          QR-tilaaminen ei ole juuri nyt käytettävissä.
        </p>
      )}
    </>
  );
}
