"use client";

import { useCallback, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useTableEditor } from "./_hooks/use-table-editor";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, LoadingState } from "@/components/ui/states";
import api from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import { isUserLevel, type UserLevel } from "@/lib/access-control";
import StaffPage from "@/app/backoffice/staff/page";
import RestaurantSettingsPage from "@/app/backoffice/settings/restaurant/page";
import { QrCodePreviewDialog } from "./_components/qr-code-preview-dialog";
import { QrModePanel } from "./_components/qr-mode-panel";
import { SettingsTabs } from "./_components/settings-tabs";
import { TableConfirmationDialog } from "./_components/table-confirmation-dialog";
import { TableEditorDialog } from "./_components/table-editor-dialog";
import TableSessionCheckout from "@/components/payments/table-session-checkout";
import { listPendingTablePayments } from "@/lib/payments/table-payment-attempt";
import { TablesList } from "./_components/tables-list";
import type {
  Confirmation,
  QrMode,
  QrPreview,
  RestaurantTable,
  SettingsTab,
} from "./_components/types";

const tableErrorMessages: Record<string, string> = {
  INVALID_ID: "Virheellinen tunniste.",
  INVALID_TOKEN_VERSION: "Virheellinen istunnon versio.",
  INVALID_TABLE_NUMBER: "Pöydän numeron on oltava väliltä 1–10000.",
  INVALID_TABLE_NAME: "Pöydän nimi on virheellinen.",
  INVALID_INPUT: "Pöydän muutostiedot puuttuvat.",
  INVALID_QR_MODE: "Virheellinen QR-tila.",
  TABLE_NOT_FOUND: "Pöytää ei löytynyt. Päivitä tiedot.",
  TABLE_OPEN: "Sulje istunto ennen pöydän numeron muuttamista.",
  TABLE_IN_USE: "Sulje istunto ja käsittele avoimet tilaukset ensin.",
  TABLE_CONFLICT:
    "Pöytä tai istunto muuttui. Päivitä tiedot ja yritä uudelleen.",
  SESSION_NOT_FOUND: "Istuntoa ei löytynyt. Päivitä tiedot.",
  SESSION_CLOSED: "Istunto on jo suljettu. Päivitä tiedot.",
  STALE_TOKEN_VERSION: "Istunto muuttui. Päivitä tiedot ja yritä uudelleen.",
  UNSETTLED_ORDERS:
    "Maksa tai peruuta kaikki istunnon tilaukset ennen sulkemista.",
  QR_EXPIRED: "QR-koodi on vanhentunut. Luo uusi koodi.",
  QR_KEY_UNAVAILABLE: "QR-avainta ei ole määritetty palvelimelle.",
  QR_KEY_MISMATCH: "QR-koodia ei voitu palauttaa. Luo uusi koodi.",
};

// EN: Localize stable API codes instead of showing English backend prose; unknown HTTP failures use the Finnish action fallback.
// FI: Käännä vakaat API-koodit englanninkielisen palvelintekstin sijaan; tuntemattomat HTTP-virheet käyttävät suomenkielistä toimintokohtaista varatekstiä.
function tableErrorMessage(reason: unknown, fallback: string): string {
  if (isAxiosError<{ code?: unknown }>(reason)) {
    const code = reason.response?.data?.code;
    return typeof code === "string" && Object.hasOwn(tableErrorMessages, code)
      ? tableErrorMessages[code]
      : fallback;
  }
  return getApiErrorMessage(reason, fallback);
}

function isTable(value: unknown): value is RestaurantTable {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (!Number.isSafeInteger(row.id) || !Number.isSafeInteger(row.tableNo))
    return false;
  if (row.name !== null && typeof row.name !== "string") return false;
  if (row.openSession === null) return true;
  if (!row.openSession || typeof row.openSession !== "object") return false;
  const session = row.openSession as Record<string, unknown>;
  return (
    Number.isSafeInteger(session.id) &&
    Number.isSafeInteger(session.tokenVersion) &&
    typeof session.openedAt === "string" &&
    Number.isFinite(Date.parse(session.openedAt)) &&
    (session.qrTokenExpiresAt === null ||
      (typeof session.qrTokenExpiresAt === "string" &&
        Number.isFinite(Date.parse(session.qrTokenExpiresAt))))
  );
}

function isQrMode(value: unknown): value is QrMode {
  return value === "DISABLED" || value === "MENU_ONLY" || value === "ORDERING";
}

export default function TablesSettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("tables");
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [mode, setMode] = useState<QrMode>("DISABLED");
  const [level, setLevel] = useState<UserLevel>("kassa");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [preview, setPreview] = useState<QrPreview | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<{
    id: number;
    tableNo: number;
  } | null>(null);
  const [pendingPayments, setPendingPayments] = useState<
    { sessionId: number; tableNo: number }[]
  >([]);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    // EN: Refresh expiry presentation while the staff screen remains open; the backend still enforces the exact expiry.
    // FI: Päivitä vanhenemisen näyttö sivun ollessa auki; palvelin valvoo edelleen tarkkaa vanhenemisaikaa.
    const tick = () => setCurrentTime(Date.now());
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    try {
      const [tableResponse, modeResponse, levelResponse] = await Promise.all([
        api.get("/tables"),
        api.get("/qr-mode"),
        api.get("/user/getLevelByToken"),
      ]);
      const rows: unknown = tableResponse.data?.results;
      const currentMode: unknown = modeResponse.data?.result?.mode;
      const currentLevel: unknown = levelResponse.data?.level;
      if (
        !Array.isArray(rows) ||
        !rows.every(isTable) ||
        !isQrMode(currentMode) ||
        !isUserLevel(currentLevel)
      ) {
        throw new Error("Palvelin palautti virheelliset pöytätiedot.");
      }
      setTables(rows);
      setPendingPayments(listPendingTablePayments());
      setMode(currentMode);
      setLevel(currentLevel);
      setLoadState("ready");
      setError("");
    } catch (reason: unknown) {
      setError(tableErrorMessage(reason, "Pöytiä ei voitu ladata."));
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  useEffect(() => {
    // EN: The approved QR settings URL still lands on this screen; select its panel after hydration.
    // FI: Hyväksytty QR-asetusten osoite avaa edelleen tämän näkymän; valitse sen paneeli hydraation jälkeen.
    if (window.location.hash !== "#qr-mode") return;
    const id = window.setTimeout(() => setActiveTab("qr"), 0);
    return () => window.clearTimeout(id);
  }, []);

  const refresh = async () => {
    await load();
  };

  const {
    editor,
    tableNo,
    tableName,
    setEditor,
    setTableNo,
    setTableName,
    startEditor,
    saveTable,
  } = useTableEditor(refresh, setBusy, setError, tableErrorMessage);
  // EN: QR material stays in component memory only and is fetched on demand through the staff API.
  // FI: QR-tiedot säilyvät vain komponentin muistissa ja haetaan tarvittaessa henkilökunnan rajapinnasta.
  const showQr = async (table: RestaurantTable) => {
    if (
      !table.openSession?.qrTokenExpiresAt ||
      Date.parse(table.openSession.qrTokenExpiresAt) <= currentTime
    )
      return;
    setBusy(true);
    try {
      const result = (
        await api.get(`/table-sessions/${table.openSession.id}/qr`)
      ).data?.result;
      if (
        typeof result?.path !== "string" ||
        !/^\/order\/[A-Za-z0-9_-]{43}$/.test(result.path)
      ) {
        throw new Error("Palvelin palautti virheellisen QR-osoitteen.");
      }
      const url = new URL(result.path, window.location.origin).toString();
      const QRCode = await import("qrcode");
      const image = await QRCode.toDataURL(url, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 288,
      });
      setPreview({
        tableNo: table.tableNo,
        url,
        image,
        expiresAt: table.openSession.qrTokenExpiresAt,
      });
    } catch (reason: unknown) {
      setError(tableErrorMessage(reason, "QR-koodia ei voitu näyttää."));
    } finally {
      setBusy(false);
    }
  };

  const openSession = async (table: RestaurantTable) => {
    setBusy(true);
    try {
      await api.post(`/tables/${table.id}/sessions`, {});
      toast.success(`Pöydän ${table.tableNo} istunto avattiin.`);
      await refresh();
    } catch (reason: unknown) {
      const message = tableErrorMessage(reason, "Istuntoa ei voitu avata.");
      await refresh();
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const confirmAction = async () => {
    if (!confirmation) return;
    const { kind, table } = confirmation;
    setBusy(true);
    try {
      if (kind === "delete") {
        await api.delete(`/tables/${table.id}`);
        toast.success("Pöytä poistettiin.");
      } else if (table.openSession) {
        const path = `/table-sessions/${table.openSession.id}`;
        if (kind === "rotate") {
          await api.post(`${path}/rotate-token`, {
            expectedVersion: table.openSession.tokenVersion,
          });
          setPreview(null);
          toast.success("Uusi QR-koodi luotiin. Vanha koodi ei enää toimi.");
        } else {
          await api.post(`${path}/close`, {
            expectedVersion: table.openSession.tokenVersion,
          });
          setPreview(null);
          toast.success("Pöydän istunto suljettiin.");
        }
      }
      setConfirmation(null);
      await refresh();
    } catch (reason: unknown) {
      const message = tableErrorMessage(
        reason,
        "Toiminto epäonnistui. Päivitä tiedot ja yritä uudelleen.",
      );
      setConfirmation(null);
      await refresh();
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const changeMode = async (nextMode: QrMode) => {
    setBusy(true);
    try {
      await api.put("/qr-mode", { mode: nextMode });
      setMode(nextMode);
      window.dispatchEvent(
        new CustomEvent("qr-mode-changed", { detail: nextMode }),
      );
      toast.success("QR-tila päivitettiin.");
    } catch (reason: unknown) {
      setError(tableErrorMessage(reason, "QR-tilaa ei voitu muuttaa."));
    } finally {
      setBusy(false);
    }
  };

  const printQr = () => {
    if (!preview) return;
    const page = window.open("", "_blank", "width=480,height=620");
    if (!page) {
      toast.error("Salli ponnahdusikkunat QR-koodin tulostamista varten.");
      return;
    }
    // EN: Only validated numeric table data and a locally generated image enter the print document.
    // FI: Tulostusasiakirjaan päätyvät vain tarkistettu pöytänumero ja paikallisesti luotu kuva.
    page.document.write(
      `<!doctype html><html lang="fi"><head><meta charset="utf-8"><title>Pöytä ${preview.tableNo} QR</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:40px}img{width:288px;height:288px}</style></head><body><h1>Pöytä ${preview.tableNo}</h1><img src="${preview.image}" alt="Pöydän QR-koodi"><p>Jaa koodi vasta, kun asiakasnäkymä, API ja QR-avain on otettu käyttöön.</p></body></html>`,
    );
    page.document.close();
    page.focus();
    page.print();
  };

  if (loadState === "loading") return <LoadingState title="Pöytiä ladataan" />;
  if (loadState === "error" && tables.length === 0)
    return (
      <ErrorState
        title="Pöytiä ei voitu ladata"
        description={error}
        action={<Button onClick={() => void refresh()}>Yritä uudelleen</Button>}
      />
    );

  const isAdmin = level === "admin";

  if (isAdmin && activeTab !== "tables") {
    return (
      <div className="mx-auto max-w-[1100px] space-y-6 font-sans">
        <SettingsTabs
          activeTab={activeTab}
          isAdmin={isAdmin}
          onTabChange={setActiveTab}
        />
        {activeTab === "restaurant" ? (
          <RestaurantSettingsPage />
        ) : activeTab === "staff" ? (
          <StaffPage />
        ) : (
          <>
            <PageHeader
              title="QR-tilaaminen"
              description="Hallinnoi asiakkaiden QR-tilaamisen tilaa."
            />
            <QrModePanel
              mode={mode}
              isAdmin={isAdmin}
              busy={busy}
              onModeChange={changeMode}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 font-sans">
      <SettingsTabs
        activeTab={activeTab}
        isAdmin={isAdmin}
        onTabChange={setActiveTab}
      />
      <PageHeader
        title="Pöydät ja QR-istunnot"
        description="Hallinnoi ravintolan pöytiä, istuntoja ja QR-koodeja."
        actions={
          isAdmin ? (
            <Button onClick={() => startEditor("new")}>
              <Plus aria-hidden="true" /> Lisää pöytä
            </Button>
          ) : undefined
        }
      />

      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-md border border-destructive/35 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError("")}>
            Sulje
          </Button>
        </div>
      )}

      {pendingPayments.length > 0 && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-amber-500 bg-amber-50 p-4 text-sm"
        >
          <p>
            Maksun tulos on tarkistettava. Jatka tallennettua maksuyritystä; älä
            aloita uutta maksua.
          </p>
          <div className="flex flex-wrap gap-2">
            {pendingPayments.map((pending) => (
              <Button
                key={pending.sessionId}
                variant="outline"
                onClick={() =>
                  setCheckoutSession({
                    id: pending.sessionId,
                    tableNo: pending.tableNo,
                  })
                }
              >
                Tarkista maksu ·{" "}
                {pending.tableNo
                  ? `pöytä ${pending.tableNo}`
                  : `istunto #${pending.sessionId}`}
              </Button>
            ))}
          </div>
        </div>
      )}

      <TablesList
        tables={tables}
        isAdmin={isAdmin}
        busy={busy}
        currentTime={currentTime}
        onRefresh={() => void refresh()}
        onShowQr={(table) => void showQr(table)}
        onRotate={(table) => setConfirmation({ kind: "rotate", table })}
        onCloseSession={(table) => setConfirmation({ kind: "close", table })}
        onOpenSession={(table) => void openSession(table)}
        onEdit={startEditor}
        onDelete={(table) => setConfirmation({ kind: "delete", table })}
      />

      <TableEditorDialog
        editor={editor}
        tableNo={tableNo}
        tableName={tableName}
        busy={busy}
        onClose={() => setEditor(null)}
        onTableNoChange={setTableNo}
        onTableNameChange={setTableName}
        onSubmit={saveTable}
      />
      <TableConfirmationDialog
        confirmation={confirmation}
        busy={busy}
        onClose={() => setConfirmation(null)}
        onConfirm={() => void confirmAction()}
      />
      <QrCodePreviewDialog
        preview={preview}
        onClose={() => setPreview(null)}
        onPrint={printQr}
      />
      {checkoutSession && (
        <TableSessionCheckout
          sessionId={checkoutSession.id}
          tableNo={checkoutSession.tableNo}
          onClose={() => setCheckoutSession(null)}
          onSettled={refresh}
        />
      )}
    </div>
  );
}
