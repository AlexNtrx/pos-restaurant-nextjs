"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  lastQrOrder,
  loadQrContext,
  loadQrMenu,
  qrErrorText,
  readQrCart,
  readQrPending,
  type QrContext,
  type QrMenu,
} from "@/lib/qr-customer";
import { orderIdFrom } from "./qr-navigation";
import { QrFrame, QrProblem } from "./qr-view-shell";
import { QrMenuView } from "./qr-menu-view";
import { QrCartView } from "./qr-cart-view";
import { QrPendingRecovery } from "./qr-pending-recovery";
import { QrStatusView } from "./qr-status-view";

type View = "menu" | "cart" | "confirmation" | "status";

export default function QrCustomer({ view }: { view: View }) {
  const params = useParams<{ tableToken: string }>();
  const search = useSearchParams();
  const token = params.tableToken;
  const router = useRouter();
  const [context, setContext] = useState<QrContext | null>(null);
  const [menu, setMenu] = useState<QrMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    Promise.resolve().then(async () => {
      setLoading(true);
      setError("");
      try {
        if (["menu", "cart"].includes(view)) readQrPending(token);
        const nextContext = await loadQrContext(token);
        if (!live) return;
        setContext(nextContext);
        if (nextContext.state !== "CLOSED" && ["menu", "cart"].includes(view)) {
          const nextMenu = await loadQrMenu(token);
          if (live) setMenu(nextMenu);
        }
      } catch (failure) {
        if (live) setError(qrErrorText(failure));
      } finally {
        if (live) setLoading(false);
      }
    });
    return () => {
      live = false;
    };
  }, [token, view, retry]);
  const selectedOrderId =
    orderIdFrom(search.get("orderId")) || lastQrOrder(token);
  return (
    <QrFrame context={context} token={token}>
      {loading ? (
        <p role="status">Ladataan ruokalistaa…</p>
      ) : error ? (
        <QrProblem
          title="QR-koodi ei kelpaa"
          detail={error}
          onRetry={() => setRetry((value) => value + 1)}
        />
      ) : context?.state === "CLOSED" && ["menu", "cart"].includes(view) ? (
        <>
          <QrProblem
            title="QR-tilaaminen on suljettu"
            detail="Ravintola ei ota juuri nyt vastaan QR-tilauksia. Jo lähetetty tilaus etenee normaalisti sulkemisen jälkeen."
          />
          {view === "cart" && <QrPendingRecovery token={token} />}
        </>
      ) : view === "menu" && menu ? (
        <QrMenuView token={token} menu={menu} cart={readQrCart(token)} />
      ) : view === "cart" && menu ? (
        <QrCartView token={token} menu={menu} />
      ) : view === "confirmation" || view === "status" ? (
        <QrStatusView
          token={token}
          orderId={selectedOrderId}
          confirmation={view === "confirmation"}
          canOrderAgain={context?.state === "ORDERING"}
        />
      ) : (
        <QrProblem
          title="Näkymä ei avaudu"
          detail="Yritä uudelleen."
          onRetry={() => router.refresh()}
        />
      )}
    </QrFrame>
  );
}
