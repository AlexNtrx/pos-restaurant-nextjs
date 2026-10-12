"use client";
import { moneySum, moneyMultiply } from "@/lib/money";

import { OrderComposer } from "./order-composer";
import { DraftDiscardDialog } from "./draft-discard-dialog";
import useWaiterDraft from "../_hooks/use-waiter-draft";
import {
  hasWaiterDraft,
  waiterItemAvailable,
  type WaiterDraft,
} from "@/lib/waiter-draft";
import { OrderTracking } from "./order-tracking";
import { OrderCancelDialog } from "./order-cancel-dialog";
import type { StaffTable } from "@/lib/tables";

import { isAxiosError } from "axios";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

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

const WaiterViews = createContext<{
  composer: ReactNode;
  tracking: ReactNode;
} | null>(null);

function useWaiterViews() {
  const views = useContext(WaiterViews);
  if (!views) throw new Error("Waiter pages require WaiterWorkspace.");
  return views;
}

export function WaiterOrderEntry() {
  return useWaiterViews().composer;
}

export function WaiterOrderTracking() {
  return useWaiterViews().tracking;
}

// EN: Own draft, pending mutations and polling in the shared layout so route navigation also preserves unsaved in-memory edits.
// FI: Säilytä luonnos, odottavat muutokset ja kyselyt yhteisessä asettelussa, jotta reittisiirtymät säilyttävät myös tallentamattomat muutokset muistissa.
export default function WaiterWorkspace({ children }: { children: ReactNode }) {
  const trackingPage = usePathname() === "/backoffice/waiter/tracking";
  const [tables, setTables] = useState<StaffTable[]>([]);
  const [categories, setCategories] = useState<WaiterCategory[]>([]);
  const draftCart = useWaiterDraft();
  const { draft, load: loadDraft, selectInitialTable, clearMemory } = draftCart;
  const { tableId, foodId, sizeId, tasteId, quantity, note, items } = draft;
  const [discardTarget, setDiscardTarget] = useState<
    { tableId: number; tableNo: number } | "recovery" | null
  >(null);
  const [discardError, setDiscardError] = useState("");
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
    clearMemory();
    setState("forbidden");
  }, [clearMemory]);

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
      // EN: A recovered draft or pending order keeps its original table even if it is no longer in setup.
      // FI: Palautettu luonnos tai odottava tilaus säilyttää alkuperäisen pöytänsä, vaikka pöytä puuttuisi asetuksista.
      selectInitialTable(setup.tables[0]?.id ?? null);
      setState("ready");
      setError("");
    } catch (cause) {
      if (!mounted.current) return;
      showError(cause, "Tarjoilijan näkymää ei voitu ladata.");
      setState((current) => (current === "forbidden" ? current : "error"));
    }
  }, [showError, selectInitialTable]);

  useEffect(() => {
    mounted.current = true;
    const initial = window.setTimeout(() => {
      let saved: WaiterPending | null = null;
      try {
        if (ownerKeyRef.current)
          assertPendingOwner("waiter-order", ownerKeyRef.current);
        saved = readPendingRequest("waiter-order", parseWaiterPending);
        if (saved) {
          setPending(saved);
          pendingKey.current = saved.idempotencyKey;
        }
      } catch {
        setInvalidPending(true);
      }
      loadDraft(saved);
      void refreshSetup();
    }, 0);
    return () => {
      mounted.current = false;
      window.clearTimeout(initial);
    };
  }, [refreshSetup, loadDraft]);

  const selectedTable = tables.find((table) => table.id === tableId);
  const selectedCategory = categories.find((category) =>
    category.food.some((food) => food.id === foodId),
  );
  const selectedFood = selectedCategory?.food.find(
    (food) => food.id === foodId,
  );
  const unavailableItems = items.some(
    (item) => !waiterItemAvailable(item, categories),
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
    return moneySum([
      sum,
      moneyMultiply(
        moneySum([food?.price ?? 0, size?.moneyAdded ?? 0]),
        item.quantity,
      ),
    ]);
  }, 0);

  function addItem() {
    if (
      pending ||
      draftCart.blocked ||
      invalidPending ||
      inFlight.current ||
      !selectedFood ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 200 ||
      note.trim().length > 500
    )
      return;
    const item: WaiterItem = {
      foodId: selectedFood.id,
      foodSizeId: sizeId,
      tasteId,
      quantity,
      note: note.trim(),
    };
    if (!waiterItemAvailable(item, categories)) {
      setError(
        "Valittu tuote tai vaihtoehto ei ole enää saatavilla. Valitse vaihtoehdot uudelleen.",
      );
      return;
    }
    if (items.reduce((sum, item) => sum + item.quantity, 0) + quantity > 200) {
      setError("Tilauksessa voi olla enintään 200 annosta.");
      return;
    }
    draftCart.change((current) => ({
      ...current,
      items: [...current.items, item],
      note: "",
      quantity: 1,
    }));
    pendingKey.current = null;
    setError("");
  }

  function requestTableChange(next: number | null) {
    if (
      next === tableId ||
      inFlight.current ||
      pending ||
      invalidPending ||
      draftCart.blocked
    )
      return;
    const table = tables.find((table) => table.id === next);
    if (!table) return;
    setDiscardError("");
    if (hasWaiterDraft(draft))
      setDiscardTarget({ tableId: table.id, tableNo: table.tableNo });
    else if (draftCart.discard(table.id)) pendingKey.current = null;
  }

  function changeForm(fields: Partial<Omit<WaiterDraft, "tableId" | "items">>) {
    if (inFlight.current || pending || invalidPending) return;
    draftCart.change((current) => ({ ...current, ...fields }));
    pendingKey.current = null;
  }

  function confirmDiscard() {
    if (!discardTarget || inFlight.current || pending || invalidPending) return;
    const next = discardTarget === "recovery" ? tableId : discardTarget.tableId;
    if (draftCart.discard(next)) {
      pendingKey.current = null;
      setDiscardTarget(null);
      setDiscardError("");
    } else
      setDiscardError(
        "Luonnosta ei voitu poistaa. Nykyinen pöytä ja luonnos säilytettiin.",
      );
  }

  async function submit() {
    if (
      inFlight.current ||
      invalidPending ||
      (!pending &&
        (draftCart.blocked ||
          unavailableItems ||
          !selectedTable ||
          !items.length))
    )
      return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    setSuccess("");
    const ownerKey = ownerKeyRef.current;
    try {
      assertPendingOwner("waiter-order", ownerKey);
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
      draftCart.clearStored();
      clearPendingRequest("waiter-order", ownerKey);
      setPending(null);
      draftCart.resetAfterSubmit();
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
    <div className="mx-auto w-full max-w-7xl space-y-6 font-sans">
      <PageHeader
        title="Tarjoilijan työpiste"
        description={
          trackingPage
            ? "Seuraa tilausten etenemistä keittiöstä pöytään."
            : "Ota pöytätilaus ja lähetä se keittiöön."
        }
      />
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => setServiceCallsOpen(true)}
        >
          Palvelukutsut
        </Button>
        {trackingPage && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => void refreshQueues()}
          >
            Päivitä tilaukset
          </Button>
        )}
      </div>
      {(error || queueError) && (
        <p
          role="alert"
          className="rounded-md border border-destructive p-3 text-sm text-destructive"
        >
          {error || queueError}
        </p>
      )}
      {/* EN: A saved attempt enables recovery; it does not mean the outcome is uncertain while sending.
          FI: Tallennettu yritys mahdollistaa palautuksen; tulos ei ole epävarma lähetyksen ollessa käynnissä. */}
      {saving && !success && (
        <p
          role="status"
          className="rounded-md border border-border p-3 text-sm"
        >
          Tilausta lähetetään. Odota vahvistusta.
        </p>
      )}
      {!saving && (pending || invalidPending) && (
        <p role="alert" className="rounded-md border border-border p-3 text-sm">
          {invalidPending
            ? "Tallennettu tilaus on virheellinen. Tarkista tilanne ennen uuden tilauksen lähettämistä."
            : `Pöydän ${pending!.tableNo} lähetyksen tulos on epävarma. Tarkista sama tilaus ilman muutoksia.`}
          {trackingPage && (
            <Link
              href="/backoffice/waiter"
              className="mt-2 flex min-h-11 w-fit items-center underline"
            >
              Avaa tilauksen palautus
            </Link>
          )}
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
      {draftCart.storageError && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-destructive p-3 text-sm"
        >
          <p>{draftCart.storageError}</p>
          {trackingPage && (
            <Link
              href="/backoffice/waiter"
              className="flex min-h-11 w-fit items-center underline"
            >
              Avaa tilausluonnos
            </Link>
          )}
          {!trackingPage && !pending && !invalidPending && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  if (draftCart.blocked) {
                    loadDraft(null);
                    selectInitialTable(tables[0]?.id ?? null);
                  } else draftCart.retrySave();
                }}
              >
                {draftCart.blocked
                  ? "Lue luonnos uudelleen"
                  : "Yritä tallentaa uudelleen"}
              </Button>
              {draftCart.blocked && (
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                    setDiscardError("");
                    setDiscardTarget("recovery");
                  }}
                >
                  Poista tallennettu luonnos
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {!trackingPage && unavailableItems && !pending && (
        <p role="alert" className="rounded-md border border-border p-3 text-sm">
          Luonnoksessa on tuotteita tai vaihtoehtoja, joita ei enää ole
          ruokalistalla. Poista kyseinen rivi ja lisää saatavilla oleva tuote
          ennen lähettämistä.
        </p>
      )}
      {!trackingPage && !selectedTable && tableId !== null && !pending && (
        <p role="alert" className="rounded-md border border-border p-3 text-sm">
          Luonnoksen pöytä ei ole enää käytettävissä. Valitse toinen pöytä
          aloittaaksesi uuden tilauksen.
        </p>
      )}
      <WaiterViews.Provider
        value={{
          composer: (
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
              draftBlocked={draftCart.blocked}
              unavailableItems={unavailableItems}
              selectedCategory={selectedCategory}
              selectedFood={selectedFood}
              selectedTable={selectedTable}
              total={total}
              addItem={addItem}
              submit={submit}
              removeItem={(index) => {
                if (inFlight.current || pending || invalidPending) return;
                draftCart.change((current) => ({
                  ...current,
                  items: current.items.filter((_, at) => at !== index),
                }));
                pendingKey.current = null;
              }}
              setTableId={requestTableChange}
              setFoodId={(foodId) =>
                changeForm({ foodId, sizeId: null, tasteId: null })
              }
              setSizeId={(sizeId) => changeForm({ sizeId })}
              setTasteId={(tasteId) => changeForm({ tasteId })}
              setQuantity={(quantity) => changeForm({ quantity })}
              setNote={(note) => changeForm({ note })}
            />
          ),
          tracking: (
            <OrderTracking
              orders={orders}
              workingId={workingId}
              onServe={(order) => void serve(order)}
              onCancel={requestCancel}
            />
          ),
        }}
      >
        {children}
      </WaiterViews.Provider>
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
      <DraftDiscardDialog
        open={discardTarget !== null}
        tableNo={
          discardTarget && discardTarget !== "recovery"
            ? discardTarget.tableNo
            : null
        }
        error={discardError}
        onCancel={() => setDiscardTarget(null)}
        onConfirm={confirmDiscard}
      />
    </div>
  );
}
