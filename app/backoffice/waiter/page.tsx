"use client";

import { isAxiosError } from "axios";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import ServiceCallQueue from "@/app/backoffice/service-calls/_components/service-call-queue";
import type { StaffOrder } from "@/app/backoffice/orders/inbox/_lib/staff-orders";
import { fetchOrderPages } from "@/app/backoffice/orders/inbox/_lib/staff-orders";
import { usePolling } from "@/lib/use-polling";
import {
  cancelWaiterOrder,
  loadWaiterSnapshot,
  mergeWaiterOrders,
  loadWaiterSetup,
  openWaiterTable,
  sendWaiterOrder,
  serveWaiterOrder,
  type WaiterCategory,
  type WaiterItem,
  type WaiterTable,
} from "@/lib/waiter-orders";

const money = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});

export default function WaiterPage() {
  const [tables, setTables] = useState<WaiterTable[]>([]);
  const [categories, setCategories] = useState<WaiterCategory[]>([]);
  const [tableId, setTableId] = useState<number | null>(null);
  const [foodId, setFoodId] = useState<number | null>(null);
  const [sizeId, setSizeId] = useState<number | null>(null);
  const [tasteId, setTasteId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<WaiterItem[]>([]);
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [cancelOrder, setCancelOrder] = useState<StaffOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [serviceCallsOpen, setServiceCallsOpen] = useState(false);
  const [state, setState] = useState<
    "loading" | "ready" | "error" | "forbidden"
  >("loading");
  const [error, setError] = useState("");
  const [queueError, setQueueError] = useState("");
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [success, setSuccess] = useState("");
  const pendingKey = useRef<string | null>(null);
  const mounted = useRef(false);
  const accessRevoked = useRef(false);
  const servedVersions = useRef(new Map<number, number>());
  const watermark = useRef<string | null>(null);
  const polls = useRef(0);

  const revoke = useCallback(() => {
    accessRevoked.current = true;
    setTables([]);
    setCategories([]);
    setOrders([]);
    setCancelOrder(null);
    setServiceCallsOpen(false);
    setItems([]);
    setState("forbidden");
  }, []);

  const showError = useCallback(
    (cause: unknown, fallback: string) => {
      if (
        isPermissionDeniedError(cause) ||
        (isAxiosError(cause) && cause.response?.status === 401)
      ) {
        revoke();
      } else {
        setError(getApiErrorMessage(cause, fallback));
      }
    },
    [revoke],
  );

  const pollQueues = useCallback(
    async (signal: AbortSignal, reconcile: boolean) => {
      try {
        // EN: Read only changes between periodic full snapshots; include terminal changes so departed orders leave the queue.
        // FI: Lue vain muutokset määräaikaisten kokonaishakujen välillä; hae myös päättävät tilat, jotta poistuneet tilaukset lähtevät jonosta.
        const full = reconcile || !watermark.current || polls.current >= 12;
        const page = full
          ? await loadWaiterSnapshot(signal)
          : await fetchOrderPages({ updatedAfter: watermark.current! }, signal);
        if (signal.aborted || accessRevoked.current) return;
        // EN: A poll started before serving must not reinsert the older READY snapshot after confirmation.
        // FI: Ennen tarjoilua alkanut kysely ei saa palauttaa vanhaa READY-tietoa vahvistuksen jälkeen.
        setOrders((current) =>
          mergeWaiterOrders(full ? [] : current, page.results).filter(
            (order) =>
              !["SERVED", "COMPLETED"].includes(order.status) &&
              (servedVersions.current.get(order.id) ?? 0) < order.version,
          ),
        );
        watermark.current = new Date(
          Date.parse(page.serverTime) - 5_000,
        ).toISOString();
        polls.current = full ? 0 : polls.current + 1;
        setQueueError("");
      } catch (cause) {
        if (signal.aborted) return;
        if (
          isPermissionDeniedError(cause) ||
          (isAxiosError(cause) && cause.response?.status === 401)
        )
          revoke();
        else
          setQueueError(
            getApiErrorMessage(cause, "Tilausjonoa ei voitu päivittää."),
          );
        throw cause;
      }
    },
    [revoke],
  );

  const refreshQueues = usePolling(pollQueues, {
    enabled: state !== "forbidden",
  });

  const refreshSetup = useCallback(async () => {
    try {
      const setup = await loadWaiterSetup();
      if (!mounted.current || accessRevoked.current) return;
      setTables(setup.tables);
      setCategories(setup.categories);
      setTableId((current) =>
        current && setup.tables.some((table) => table.id === current)
          ? current
          : (setup.tables[0]?.id ?? null),
      );
      setState("ready");
      setError("");
    } catch (cause) {
      if (!mounted.current) return;
      showError(cause, "Tarjoilijan näkymää ei voitu ladata.");
      setState((current) => (current === "forbidden" ? current : "error"));
    }
  }, [showError]);

  useEffect(() => {
    mounted.current = true;
    const initial = window.setTimeout(() => {
      void refreshSetup();
    }, 0);
    return () => {
      mounted.current = false;
      window.clearTimeout(initial);
    };
  }, [refreshSetup]);

  const selectedTable = tables.find((table) => table.id === tableId);
  const selectedCategory = categories.find((category) =>
    category.food.some((food) => food.id === foodId),
  );
  const selectedFood = selectedCategory?.food.find(
    (food) => food.id === foodId,
  );
  const total = items.reduce((sum, item) => {
    const category = categories.find((candidate) =>
      candidate.food.some((food) => food.id === item.foodId),
    );
    const food = category?.food.find(
      (candidate) => candidate.id === item.foodId,
    );
    const size = category?.foodSizes.find(
      (candidate) => candidate.id === item.foodSizeId,
    );
    return (
      sum +
      (food?.price ?? 0) * item.quantity +
      (size?.moneyAdded ?? 0) * item.quantity
    );
  }, 0);

  function addItem() {
    if (
      !selectedFood ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 200 ||
      note.trim().length > 500
    )
      return;
    if (items.reduce((sum, item) => sum + item.quantity, 0) + quantity > 200) {
      setError("Tilauksessa voi olla enintään 200 annosta.");
      return;
    }
    setItems((current) => [
      ...current,
      {
        foodId: selectedFood.id,
        foodSizeId: sizeId,
        tasteId,
        quantity,
        note: note.trim(),
      },
    ]);
    pendingKey.current = null;
    setNote("");
    setQuantity(1);
    setError("");
  }

  async function submit() {
    if (!selectedTable || !items.length || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    const key = pendingKey.current ?? crypto.randomUUID();
    pendingKey.current = key;
    try {
      let sessionId = selectedTable.openSession?.id;
      if (!sessionId) {
        sessionId = await openWaiterTable(selectedTable.id);
        await refreshSetup();
      }
      const order = await sendWaiterOrder(sessionId, items, key, total);
      setItems([]);
      pendingKey.current = null;
      setSuccess(`Tilaus #${order.id} lähetettiin keittiöön.`);
      await refreshQueues();
    } catch (cause) {
      showError(
        cause,
        "Tilausta ei voitu lähettää. Tarkista pöytä ja tuotteet.",
      );
      await refreshSetup();
    } finally {
      setSaving(false);
    }
  }

  async function serve(order: StaffOrder) {
    if (workingId != null) return;
    setWorkingId(order.id);
    setError("");
    try {
      const served = await serveWaiterOrder(order);
      servedVersions.current.set(order.id, served.version);
      setOrders((current) =>
        current.filter((candidate) => candidate.id !== order.id),
      );
      await refreshQueues();
    } catch (cause) {
      showError(cause, "Tilaus muuttui. Päivitä jono ja yritä uudelleen.");
      await refreshQueues();
    } finally {
      setWorkingId(null);
    }
  }

  async function cancel() {
    if (!cancelOrder || workingId != null || cancelReason.trim().length < 3)
      return;
    setWorkingId(cancelOrder.id);
    setError("");
    setSuccess("");
    try {
      await cancelWaiterOrder(cancelOrder, cancelReason);
      setSuccess(`Tilaus #${cancelOrder.id} peruttiin.`);
    } catch (cause) {
      showError(
        cause,
        "Tilausta ei voitu perua. Tarkista tilauksen nykyinen tila.",
      );
    } finally {
      setCancelOrder(null);
      setCancelReason("");
      await refreshQueues();
      setWorkingId(null);
    }
  }

  function requestCancel(order: StaffOrder) {
    setCancelReason("");
    setCancelOrder(order);
  }

  if (state === "loading")
    return <LoadingState title="Tarjoilijan näkymää ladataan…" />;
  if (state === "forbidden")
    return (
      <ErrorState
        title="Pääsy estetty"
        description="Tarjoilijan oikeudet eivät ole voimassa."
      />
    );
  if (state === "error")
    return (
      <ErrorState
        title="Tietoja ei voitu ladata"
        description={error}
        action={
          <Button onClick={() => void refreshSetup()}>Yritä uudelleen</Button>
        }
      />
    );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-5 font-sans sm:p-8">
      <PageHeader
        title="Tarjoilijan työpiste"
        description="Ota pöytätilaus ja seuraa tilausten etenemistä keittiöstä pöytään."
      />
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => setServiceCallsOpen(true)}
        >
          Palvelukutsut
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void refreshQueues()}
        >
          Päivitä tilaukset
        </Button>
      </div>
      {(error || queueError) && (
        <p
          role="alert"
          className="rounded-md border border-destructive p-3 text-sm text-destructive"
        >
          {error || queueError}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="rounded-md border border-border p-3 text-sm"
        >
          {success}
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="space-y-5 rounded-xl border border-border bg-surface p-5">
          <div>
            <h2 className="font-heading text-xl font-semibold">
              Ota pöytätilaus
            </h2>
            <p className="text-sm text-muted-foreground">
              Tilaus lähetetään keittiöön. Maksu käsitellään kassalla myöhemmin.
            </p>
          </div>
          <label className="block space-y-1 text-sm font-medium">
            Pöytä
            <select
              className="h-10 w-full rounded-md border border-border bg-background px-3"
              value={tableId ?? ""}
              onChange={(event) => {
                setTableId(Number(event.target.value));
                setItems([]);
                pendingKey.current = null;
              }}
            >
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  Pöytä {table.tableNo}
                  {table.name ? ` · ${table.name}` : ""}
                  {table.openSession ? " · avoin" : ""}
                </option>
              ))}
            </select>
          </label>
          {tables.length === 0 && (
            <EmptyState
              title="Ei pöytiä"
              description="Ylläpitäjän on lisättävä pöytä ennen tilauksen vastaanottoa."
            />
          )}
          <label className="block space-y-1 text-sm font-medium">
            Tuote
            <select
              className="h-10 w-full rounded-md border border-border bg-background px-3"
              value={foodId ?? ""}
              onChange={(event) => {
                setFoodId(Number(event.target.value));
                setSizeId(null);
                setTasteId(null);
              }}
            >
              <option value="">Valitse tuote</option>
              {categories.map((category) => (
                <optgroup key={category.id} label={category.name}>
                  {category.food.map((food) => (
                    <option key={food.id} value={food.id}>
                      {food.name} · {money.format(food.price)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {selectedCategory && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-sm font-medium">
                Koko
                <select
                  className="h-10 w-full rounded-md border border-border bg-background px-3"
                  value={sizeId ?? ""}
                  onChange={(event) =>
                    setSizeId(
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                >
                  <option value="">Ei kokoa</option>
                  {selectedCategory.foodSizes.map((size) => (
                    <option key={size.id} value={size.id}>
                      {size.name} (+{money.format(size.moneyAdded)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Valinta
                <select
                  className="h-10 w-full rounded-md border border-border bg-background px-3"
                  value={tasteId ?? ""}
                  onChange={(event) =>
                    setTasteId(
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                >
                  <option value="">Ei valintaa</option>
                  {selectedCategory.tastes.map((taste) => (
                    <option key={taste.id} value={taste.id}>
                      {taste.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-[100px_minmax(0,1fr)]">
            <label className="block space-y-1 text-sm font-medium">
              Määrä
              <input
                type="number"
                min={1}
                max={200}
                className="h-10 w-full rounded-md border border-border bg-background px-3"
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
              />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Huomautus
              <input
                maxLength={500}
                className="h-10 w-full rounded-md border border-border bg-background px-3"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!selectedFood || saving}
            onClick={addItem}
          >
            Lisää tilaukseen
          </Button>
          <div className="space-y-2 border-t border-border pt-4">
            <h3 className="font-semibold">Tilausluonnos</h3>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Valitse tuote ja lisää se tilaukseen.
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((item, index) => {
                  const category = categories.find((candidate) =>
                    candidate.food.some((food) => food.id === item.foodId),
                  );
                  const food = category?.food.find(
                    (candidate) => candidate.id === item.foodId,
                  );
                  return (
                    <li
                      key={index}
                      className="flex items-start justify-between gap-3 rounded-md border border-border p-3 text-sm"
                    >
                      <span>
                        {item.quantity} × {food?.name}
                        {item.note && (
                          <span className="block text-muted-foreground">
                            {item.note}
                          </span>
                        )}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => {
                          setItems((current) =>
                            current.filter((_, at) => at !== index),
                          );
                          pendingKey.current = null;
                        }}
                      >
                        Poista
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">Arvio {money.format(total)}</span>
              <Button
                type="button"
                disabled={!selectedTable || !items.length || saving}
                onClick={() => void submit()}
              >
                {saving ? "Lähetetään…" : "Lähetä keittiöön"}
              </Button>
            </div>
          </div>
        </section>
        <OrderTracking
          orders={orders}
          workingId={workingId}
          onServe={(order) => void serve(order)}
          onCancel={requestCancel}
        />
      </div>
      <Dialog open={serviceCallsOpen} onOpenChange={setServiceCallsOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Palvelukutsut</DialogTitle>
            <DialogDescription>
              Vastaanota asiakkaan kutsu ja merkitse se hoidetuksi.
            </DialogDescription>
          </DialogHeader>
          <ServiceCallQueue />
        </DialogContent>
      </Dialog>
      <Dialog
        open={cancelOrder !== null}
        onOpenChange={(open) => {
          if (!open && workingId === null) setCancelOrder(null);
        }}
      >
        <DialogContent showCloseButton={workingId === null}>
          <DialogHeader>
            <DialogTitle>Peru tilaus #{cancelOrder?.id}</DialogTitle>
            <DialogDescription>
              Pöytä {cancelOrder?.tableNo}. Peruuttaminen poistaa tilauksen
              aktiivisista jonoista. Anna syy ennen vahvistamista.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1 text-sm font-medium">
            Peruutuksen syy
            <textarea
              className="min-h-24 w-full rounded-md border border-border bg-background p-3"
              value={cancelReason}
              maxLength={500}
              disabled={workingId !== null}
              onChange={(event) => setCancelReason(event.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">3–500 merkkiä.</p>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={workingId !== null}
              onClick={() => setCancelOrder(null)}
            >
              Takaisin
            </Button>
            <Button
              variant="destructive"
              disabled={workingId !== null || cancelReason.trim().length < 3}
              onClick={() => void cancel()}
            >
              {workingId !== null ? "Perutaan…" : "Vahvista peruutus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

const orderStages = [
  { status: "SUBMITTED", label: "Saapunut" },
  { status: "CONFIRMED", label: "Vahvistettu" },
  { status: "PREPARING", label: "Valmistelussa" },
  { status: "READY", label: "Valmis" },
  { status: "SERVED", label: "Tarjoiltu" },
] as const;

function OrderTracking({
  orders,
  workingId,
  onServe,
  onCancel,
}: {
  orders: StaffOrder[];
  workingId: number | null;
  onServe: (order: StaffOrder) => void;
  onCancel: (order: StaffOrder) => void;
}) {
  return (
    <section className="self-start space-y-3 rounded-xl border border-border bg-surface p-5">
      <div>
        <h2 className="font-heading text-xl font-semibold">
          Tilausten seuranta{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({orders.length})
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">
          Näet jokaisen pöytätilauksen nykyisen vaiheen ja etenemisen.
        </p>
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ei tilauksia.</p>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id} className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    Pöytä {order.tableNo} · Tilaus #{order.id}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {order.channel === "QR"
                      ? "QR"
                      : order.channel === "STAFF"
                        ? "Tarjoilija"
                        : "Kassa"}
                    {" · "}
                    {order.status === "SUBMITTED"
                      ? "Odottaa vahvistusta"
                      : orderStages.find(
                          (stage) => stage.status === order.status,
                        )?.label}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {order.status === "READY" && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={workingId !== null}
                      onClick={() => onServe(order)}
                    >
                      {workingId === order.id
                        ? "Tallennetaan…"
                        : "Merkitse tarjoilluksi"}
                    </Button>
                  )}
                  {canCancelOrder(order) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={workingId !== null}
                      onClick={() => onCancel(order)}
                    >
                      Peru tilaus
                    </Button>
                  )}
                </div>
              </div>
              <ol
                aria-label={`Tilauksen #${order.id} eteneminen`}
                className="mt-3 grid grid-cols-5 gap-1 text-center text-[10px] sm:text-xs"
              >
                {orderStages.map((stage, index) => {
                  const currentIndex = orderStages.findIndex(
                    (candidate) => candidate.status === order.status,
                  );
                  return (
                    <li
                      key={stage.status}
                      aria-current={
                        stage.status === order.status ? "step" : undefined
                      }
                      className={`rounded-md border px-1 py-2 ${
                        index === currentIndex
                          ? "border-primary bg-primary/10 font-semibold text-foreground"
                          : index < currentIndex
                            ? "border-border bg-muted text-foreground"
                            : "border-border text-muted-foreground"
                      }`}
                    >
                      <span className="block">{index + 1}</span>
                      {stage.label}
                    </li>
                  );
                })}
              </ol>
              <ul className="mt-3 space-y-1 text-sm">
                {order.items.map((item, index) => (
                  <li key={index}>
                    {item.quantity} × {item.name}
                    {item.modifiers.length > 0 &&
                      ` · ${item.modifiers.map((modifier) => modifier.name).join(", ")}`}
                    {item.note && (
                      <span className="block text-muted-foreground">
                        Huom: {item.note}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// EN: This is a UI hint; the backend rechecks payment, status and version when cancelling.
// FI: Tämä on käyttöliittymän vihje; palvelin tarkistaa maksun, tilan ja version uudelleen peruttaessa.
function canCancelOrder(order: StaffOrder) {
  return (
    order.paidAt === null &&
    order.preparingAt === null &&
    ["SUBMITTED", "CONFIRMED"].includes(order.status)
  );
}
