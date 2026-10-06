"use client";

import { OrderComposer } from "./_components/order-composer";
import { OrderTracking } from "./_components/order-tracking";
import { OrderCancelDialog } from "./_components/order-cancel-dialog";
import type { StaffTable } from "@/lib/tables";

import { isAxiosError } from "axios";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import ServiceCallQueue from "@/app/backoffice/service-calls/_components/service-call-queue";
import type { StaffOrder } from "@/lib/orders/contracts";
import { fetchOrderPages } from "@/lib/orders/client";
import { usePolling } from "@/lib/use-polling";
import { isMutationRejected } from "@/lib/mutation-outcome";
import {
  readPendingRequest,
  savePendingRequest,
  clearPendingRequest,
  pendingRequestKey,
  assertPendingOwner,
} from "@/lib/pending-request";
import { parseWaiterPending, type WaiterPending } from "@/lib/waiter-pending";
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
} from "@/lib/waiter-orders";

export default function WaiterPage() {
  const [tables, setTables] = useState<StaffTable[]>([]);
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
  const [pending, setPending] = useState<WaiterPending | null>(null);
  const [invalidPending, setInvalidPending] = useState(false);
  const inFlight = useRef(false);
  const ownerKeyRef = useRef(pendingRequestKey("waiter-order"));
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
      try {
        if (ownerKeyRef.current)
          assertPendingOwner("waiter-order", ownerKeyRef.current);
        const saved = readPendingRequest("waiter-order", parseWaiterPending);
        if (saved) {
          setPending(saved);
          setItems(saved.items);
          setTableId(saved.tableId);
          pendingKey.current = saved.idempotencyKey;
        }
      } catch {
        setInvalidPending(true);
      }
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
      pending ||
      invalidPending ||
      inFlight.current ||
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
    if (
      inFlight.current ||
      invalidPending ||
      (!pending && (!selectedTable || !items.length))
    )
      return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    setSuccess("");
    const ownerKey = ownerKeyRef.current;
    try {
      let attempt = pending;
      if (!attempt) {
        let sessionId = selectedTable!.openSession?.id;
        if (!sessionId) {
          sessionId = await openWaiterTable(selectedTable!.id);
          await refreshSetup();
        }
        attempt = {
          tableId: selectedTable!.id,
          tableNo: selectedTable!.tableNo,
          tableSessionId: sessionId,
          items: structuredClone(items),
          expectedTotal: total,
          idempotencyKey: pendingKey.current ?? crypto.randomUUID(),
        };
        // EN: Save the exact order before sending; a timeout or reload must not change its session, items or key.
        // FI: Tallenna täsmällinen tilaus ennen lähetystä; aikakatkaisu tai uudelleenlataus ei saa vaihtaa istuntoa, tuotteita tai avainta.
        savePendingRequest("waiter-order", attempt, ownerKey);
        pendingKey.current = attempt.idempotencyKey;
        setPending(attempt);
      }
      assertPendingOwner("waiter-order", ownerKey);
      const order = await sendWaiterOrder(
        attempt.tableSessionId,
        attempt.items,
        attempt.idempotencyKey,
        attempt.expectedTotal,
      );
      clearPendingRequest("waiter-order", ownerKey);
      setPending(null);
      setItems([]);
      pendingKey.current = null;
      setSuccess(`Tilaus #${order.id} lähetettiin keittiöön.`);
      await refreshQueues();
    } catch (cause) {
      if (
        isMutationRejected(cause) &&
        pendingRequestKey("waiter-order") === ownerKey
      ) {
        clearPendingRequest("waiter-order", ownerKey);
        setPending(null);
        pendingKey.current = null;
      }
      await refreshSetup();
      showError(
        cause,
        "Tilausta ei voitu lähettää. Tarkista pöytä ja tuotteet.",
      );
    } finally {
      inFlight.current = false;
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
      {(pending || invalidPending) && (
        <p role="alert" className="rounded-md border border-border p-3 text-sm">
          {invalidPending
            ? "Tallennettu tilaus on virheellinen. Tarkista tilanne ennen uuden tilauksen lähettämistä."
            : `Pöydän ${pending!.tableNo} lähetyksen tulos on epävarma. Tarkista sama tilaus ilman muutoksia.`}
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
        <OrderComposer
          tables={tables}
          categories={categories}
          tableId={tableId}
          foodId={foodId}
          sizeId={sizeId}
          tasteId={tasteId}
          quantity={quantity}
          note={note}
          items={items}
          saving={saving}
          pending={pending}
          invalidPending={invalidPending}
          selectedCategory={selectedCategory}
          selectedFood={selectedFood}
          selectedTable={selectedTable}
          total={total}
          addItem={addItem}
          submit={submit}
          onDraftChange={() => {
            pendingKey.current = null;
          }}
          setItems={setItems}
          setTableId={setTableId}
          setFoodId={setFoodId}
          setSizeId={setSizeId}
          setTasteId={setTasteId}
          setQuantity={setQuantity}
          setNote={setNote}
        />
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
      <OrderCancelDialog
        cancelOrder={cancelOrder}
        workingId={workingId}
        setCancelOrder={setCancelOrder}
        cancelReason={cancelReason}
        setCancelReason={setCancelReason}
        cancel={cancel}
      />
    </main>
  );
}
