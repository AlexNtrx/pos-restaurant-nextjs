"use client";

import { isAxiosError } from "axios";
import { useCallback, useEffect, useRef, useState } from "react";

import { OrderSummary } from "./_components/order-summary";
import { OrderDetailDialog } from "./_components/order-detail-dialog";
import { Button } from "@/components/ui/button";

import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import { usePolling } from "@/lib/use-polling";
import {
  changeOrderStatus,
  fetchOrderDetail,
  fetchOrderPages,
} from "@/lib/orders/client";
import { mergeActiveOrders } from "./_lib/staff-orders";
import { type StaffOrder, type StaffOrderDetail } from "@/lib/orders/contracts";

import { type ActionStatus } from "./_lib/presentation";
export default function StaffOrderInboxPage() {
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [handled, setHandled] = useState<StaffOrder[]>([]);
  const [tab, setTab] = useState<"active" | "handled">("active");
  const [state, setState] = useState<
    "loading" | "ready" | "error" | "forbidden"
  >("loading");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StaffOrderDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [action, setAction] = useState<ActionStatus | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(0);
  const watermark = useRef<string | null>(null);
  const polls = useRef(0);
  const mounted = useRef(false);
  const detailRequest = useRef(0);
  const selectedOrder = useRef<number | null>(null);
  const accessRevoked = useRef(false);

  const revokeView = useCallback(() => {
    accessRevoked.current = true;
    detailRequest.current += 1;
    selectedOrder.current = null;
    // EN: A revoked session must not keep previously fetched Order snapshots visible.
    // FI: Perutun istunnon aiemmin haetut tilaustiedot eivät saa jäädä näkyviin.
    setOrders([]);
    setHandled([]);
    setSelectedId(null);
    setDetail(null);
    setAction(null);
    setError("");
    setState("forbidden");
    watermark.current = null;
    polls.current = 0;
  }, []);

  const pollQueue = useCallback(
    async (signal: AbortSignal, forceFull: boolean) => {
      try {
        // EN: Overlap incremental polling and periodically reconcile the full queue to tolerate delayed transactions.
        // FI: Limittäinen päivityshaku ja määräajoin tehtävä täysi täsmäytys huomioivat viivästyneet transaktiot.
        const full = forceFull || !watermark.current || polls.current >= 12;
        const page = await fetchOrderPages(
          full ? { status: "SUBMITTED" } : { updatedAfter: watermark.current! },
          signal,
        );
        if (signal.aborted || accessRevoked.current) return;
        setOrders((current) =>
          full
            ? mergeActiveOrders([], page.results)
            : mergeActiveOrders(current, page.results),
        );
        watermark.current = new Date(
          Date.parse(page.serverTime) - 5_000,
        ).toISOString();
        polls.current = full ? 0 : polls.current + 1;
        setError("");
        setState("ready");
      } catch (cause: unknown) {
        if (signal.aborted || accessRevoked.current) return;
        if (
          isPermissionDeniedError(cause) ||
          (isAxiosError(cause) && cause.response?.status === 401)
        ) {
          revokeView();
          throw cause;
        }
        setError(getApiErrorMessage(cause, "Tilauksia ei voitu päivittää."));
        setState((previous) => (previous === "ready" ? "ready" : "error"));
        throw cause;
      }
    },
    [revokeView],
  );

  const sync = usePolling(pollQueue, { enabled: state !== "forbidden" });

  const loadHandled = useCallback(async () => {
    try {
      const [rejected, cancelled] = await Promise.all([
        fetchOrderPages({ status: "REJECTED" }),
        fetchOrderPages({ status: "CANCELLED" }),
      ]);
      if (!mounted.current || accessRevoked.current) return;
      setHandled(
        [...rejected.results, ...cancelled.results].sort(
          (left, right) =>
            Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
            right.id - left.id,
        ),
      );
      setError("");
    } catch (cause: unknown) {
      if (!mounted.current || accessRevoked.current) return;
      if (
        isPermissionDeniedError(cause) ||
        (isAxiosError(cause) && cause.response?.status === 401)
      ) {
        revokeView();
      } else {
        setError(
          getApiErrorMessage(cause, "Käsiteltyjä tilauksia ei voitu ladata."),
        );
      }
    }
  }, [revokeView]);

  useEffect(() => {
    mounted.current = true;
    const clock = window.setTimeout(() => setNow(Date.now()), 0);
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 5_000);
    return () => {
      mounted.current = false;
      detailRequest.current += 1;
      selectedOrder.current = null;
      window.clearTimeout(clock);
      window.clearInterval(interval);
    };
  }, []);

  async function openDetail(id: number) {
    if (accessRevoked.current) return;
    // EN: Only the current dialog request may populate its Order snapshot.
    // FI: Vain nykyinen dialogipyyntö saa täyttää sen tilaustiedot.
    const request = ++detailRequest.current;
    selectedOrder.current = id;
    setSelectedId(id);
    setDetail(null);
    setDetailError("");
    setAction(null);
    setReason("");
    try {
      const latest = await fetchOrderDetail(id);
      if (isCurrentDetail(request, id)) setDetail(latest);
    } catch (cause: unknown) {
      if (!isCurrentDetail(request, id)) return;
      if (
        isPermissionDeniedError(cause) ||
        (isAxiosError(cause) && cause.response?.status === 401)
      ) {
        revokeView();
      } else {
        setDetailError(getApiErrorMessage(cause, "Tilausta ei voitu avata."));
      }
    }
  }

  function isCurrentDetail(request: number, id: number) {
    return (
      mounted.current &&
      !accessRevoked.current &&
      detailRequest.current === request &&
      selectedOrder.current === id
    );
  }

  async function submitAction() {
    if (
      !detail ||
      !action ||
      saving ||
      detail.id !== selectedId ||
      !isCurrentDetail(detailRequest.current, detail.id)
    )
      return;
    const request = detailRequest.current;
    const trimmed = reason.trim();
    if (
      action !== "CONFIRMED" &&
      (trimmed.length < 3 || trimmed.length > 500)
    ) {
      setDetailError("Syyn pituuden on oltava 3–500 merkkiä.");
      return;
    }
    setSaving(true);
    setDetailError("");
    try {
      const updated = await changeOrderStatus(
        detail.id,
        detail.version,
        action,
        action === "CONFIRMED" ? undefined : trimmed,
      );
      if (!isCurrentDetail(request, detail.id)) return;
      setDetail(updated);
      setAction(null);
      setReason("");
      setOrders((current) => mergeActiveOrders(current, [updated]));
      if (tab === "handled") void loadHandled();
      void sync();
    } catch (cause: unknown) {
      if (!isCurrentDetail(request, detail.id)) return;
      if (
        isPermissionDeniedError(cause) ||
        (isAxiosError(cause) && cause.response?.status === 401)
      ) {
        revokeView();
      } else if (isAxiosError(cause) && cause.response?.status === 409) {
        setDetailError(
          "Tilaus muuttui toisessa istunnossa. Tiedot päivitettiin.",
        );
        try {
          const latest = await fetchOrderDetail(detail.id);
          if (!isCurrentDetail(request, detail.id)) return;
          setDetail(latest);
        } catch (refreshError: unknown) {
          if (!isCurrentDetail(request, detail.id)) return;
          if (
            isPermissionDeniedError(refreshError) ||
            (isAxiosError(refreshError) &&
              refreshError.response?.status === 401)
          ) {
            revokeView();
            return;
          }
          setDetail(null);
        }
        setAction(null);
        void sync();
      } else {
        setDetailError(
          getApiErrorMessage(cause, "Tilausta ei voitu päivittää."),
        );
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  const visible = tab === "active" ? orders : handled;
  return (
    <div className="tw04-layout space-y-6 font-sans">
      <PageHeader
        title="Saapuvat tilaukset"
        description="Uudet QR- ja kassatilaukset. Lista päivittyy automaattisesti."
        actions={
          <Button
            size="sm"
            onClick={() => void (tab === "active" ? sync() : loadHandled())}
          >
            Päivitä
          </Button>
        }
      />
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Tilauslista"
      >
        <Button
          role="tab"
          aria-selected={tab === "active"}
          variant={tab === "active" ? "default" : "outline"}
          onClick={() => setTab("active")}
        >
          Odottavat ({orders.length})
        </Button>
        <Button
          role="tab"
          aria-selected={tab === "handled"}
          variant={tab === "handled" ? "default" : "outline"}
          onClick={() => {
            setTab("handled");
            void loadHandled();
          }}
        >
          Hylätyt ja perutut
        </Button>
      </div>
      {error && state === "ready" && (
        <p
          role="alert"
          className="rounded-md border border-destructive/35 p-3 text-sm text-destructive"
        >
          Päivitys epäonnistui. Näytetään viimeksi ladatut tiedot. {error}
        </p>
      )}
      {state === "loading" ? (
        <LoadingState title="Tilauksia ladataan" />
      ) : state === "forbidden" ? (
        <ErrorState
          title="Ei käyttöoikeutta"
          description="Vain henkilöstö voi nähdä tilaukset."
        />
      ) : state === "error" ? (
        <ErrorState
          title="Tilauksia ei voitu ladata"
          description={error}
          action={<Button onClick={() => void sync()}>Yritä uudelleen</Button>}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title={
            tab === "active"
              ? "Ei odottavia tilauksia"
              : "Ei hylättyjä tai peruttuja tilauksia"
          }
          description={
            tab === "active"
              ? "Uudet tilaukset ilmestyvät tähän automaattisesti."
              : "Käsitellyt tilaukset säilyvät täällä."
          }
        />
      ) : (
        <section
          aria-label={
            tab === "active" ? "Odottavat tilaukset" : "Käsitellyt tilaukset"
          }
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          {visible.map((order) => (
            <OrderSummary
              key={order.id}
              order={order}
              onOpen={(id) => void openDetail(id)}
              now={now}
            />
          ))}
        </section>
      )}

      <OrderDetailDialog
        selectedId={selectedId}
        detail={detail}
        saving={saving}
        detailError={detailError}
        action={action}
        reason={reason}
        setAction={setAction}
        setReason={setReason}
        submitAction={submitAction}
        openDetail={openDetail}
        onOpenChange={(open) => {
          if (!open && !saving) {
            detailRequest.current += 1;
            selectedOrder.current = null;
            setSelectedId(null);
            setDetail(null);
            setAction(null);
          }
        }}
      />
    </div>
  );
}
