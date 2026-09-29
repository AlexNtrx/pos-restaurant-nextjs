"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import Image from "next/image";
import { Pencil, Plus, Printer, QrCode, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import api from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import { isUserLevel, type UserLevel } from "@/lib/access-control";
import StaffPage from "@/app/backoffice/staff/page";
import RestaurantSettingsPage from "@/app/backoffice/settings/restaurant/page";
import TableSessionCheckout, {
  listPendingTablePayments,
} from "./_components/table-session-checkout";

type QrMode = "DISABLED" | "MENU_ONLY" | "ORDERING";
type OpenSession = {
  id: number;
  openedAt: string;
  qrTokenExpiresAt: string | null;
  tokenVersion: number;
};
type RestaurantTable = {
  id: number;
  tableNo: number;
  name: string | null;
  openSession: OpenSession | null;
};
type QrPreview = {
  tableNo: number;
  url: string;
  image: string;
  expiresAt: string;
};
type Confirmation = {
  kind: "rotate" | "close" | "delete";
  table: RestaurantTable;
};
type SettingsTab = "restaurant" | "tables" | "qr" | "staff";

const modes: { value: QrMode; label: string; description: string }[] = [
  {
    value: "DISABLED",
    label: "Pois käytöstä",
    description: "QR-palvelu suljettu",
  },
  {
    value: "MENU_ONLY",
    label: "Vain ruokalista",
    description: "Sallii asiakkaan selata ruokalistaa",
  },
  {
    value: "ORDERING",
    label: "Tilaaminen",
    description: "Sallii asiakkaan lähettää tilauksen",
  },
];

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

function modeLabel(mode: QrMode) {
  return modes.find((option) => option.value === mode)?.label ?? "Tuntematon";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fi-FI", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function tabClassName(active: boolean) {
  return active
    ? "border-b-2 border-olive pb-3 font-semibold text-foreground"
    : "pb-3 text-muted-foreground hover:text-foreground";
}

export default function TablesSettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("tables");
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [mode, setMode] = useState<QrMode>("DISABLED");
  const [level, setLevel] = useState<UserLevel>("user");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<RestaurantTable | "new" | null>(null);
  const [tableNo, setTableNo] = useState("");
  const [tableName, setTableName] = useState("");
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

  const startEditor = (table: RestaurantTable | "new") => {
    setEditor(table);
    setTableNo(table === "new" ? "" : String(table.tableNo));
    setTableName(table === "new" ? "" : (table.name ?? ""));
  };

  const saveTable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editor === null) return;
    const number = Number(tableNo);
    if (!Number.isSafeInteger(number) || number < 1 || number > 10000) {
      setError("Pöydän numeron on oltava kokonaisluku väliltä 1–10000.");
      return;
    }
    setBusy(true);
    try {
      const payload = { tableNo: number, name: tableName.trim() || null };
      if (editor === "new") await api.post("/tables", payload);
      else await api.put(`/tables/${editor.id}`, payload);
      setEditor(null);
      toast.success(
        editor === "new" ? "Pöytä lisättiin." : "Pöytä päivitettiin.",
      );
      await refresh();
    } catch (reason: unknown) {
      setError(tableErrorMessage(reason, "Pöytää ei voitu tallentaa."));
    } finally {
      setBusy(false);
    }
  };

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

  const openCount = tables.filter((table) => table.openSession).length;
  const isAdmin = level === "admin";

  const settingsNav = (
    <nav
      aria-label="Asetusten välilehdet"
      className="flex gap-5 overflow-x-auto border-b border-border text-sm"
    >
      {isAdmin && (
        <button
          type="button"
          aria-pressed={activeTab === "restaurant"}
          className={tabClassName(activeTab === "restaurant")}
          onClick={() => setActiveTab("restaurant")}
        >
          Ravintolan tiedot
        </button>
      )}
      <button
        type="button"
        aria-pressed={activeTab === "tables"}
        className={tabClassName(activeTab === "tables")}
        onClick={() => setActiveTab("tables")}
      >
        Pöydät ja QR
      </button>
      {isAdmin && (
        <button
          type="button"
          aria-pressed={activeTab === "qr"}
          className={tabClassName(activeTab === "qr")}
          onClick={() => setActiveTab("qr")}
        >
          QR-tila
        </button>
      )}
      {isAdmin && (
        <button
          type="button"
          aria-pressed={activeTab === "staff"}
          className={tabClassName(activeTab === "staff")}
          onClick={() => setActiveTab("staff")}
        >
          Henkilöstö
        </button>
      )}
    </nav>
  );

  const qrModeCard = (
    <Card id="qr-mode" className="gap-0 py-0">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold">QR-tilaaminen</h2>
          <p className="text-sm text-muted-foreground">
            Nykyinen tila: {modeLabel(mode)}. Muutokset koskevat kaikkia avoimia
            istuntoja.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Jaa QR-koodi vasta, kun asiakasnäkymä, API ja QR-avain on otettu
            käyttöön.
          </p>
        </div>
        <StatusBadge tone={mode === "DISABLED" ? "neutral" : "success"}>
          {modeLabel(mode)}
        </StatusBadge>
      </CardContent>
      {isAdmin && (
        <CardContent
          className="grid gap-2 border-t border-border p-5 sm:grid-cols-3"
          role="group"
          aria-label="Valitse QR-tila"
        >
          {modes.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={mode === option.value ? "default" : "outline"}
              disabled={busy}
              aria-pressed={mode === option.value}
              onClick={() => void changeMode(option.value)}
              className="h-auto min-h-12 flex-col items-start gap-0.5 py-2 text-left"
            >
              <span>{option.label}</span>
              <span className="text-xs font-normal opacity-75">
                {option.description}
              </span>
            </Button>
          ))}
        </CardContent>
      )}
    </Card>
  );

  if (isAdmin && activeTab !== "tables") {
    return (
      <div className="mx-auto max-w-[1100px] space-y-6 font-sans">
        {settingsNav}
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
            {qrModeCard}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 font-sans">
      {settingsNav}
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

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="gap-0 py-0">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Avoimet istunnot</p>
            <p className="font-heading text-3xl font-semibold">{openCount}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Vapaat pöydät</p>
            <p className="font-heading text-3xl font-semibold">
              {tables.length - openCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="tables-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2
              id="tables-heading"
              className="font-heading text-xl font-semibold"
            >
              Pöydät
            </h2>
            <p className="text-sm text-muted-foreground">
              {tables.length} aktiivista pöytää
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw aria-hidden="true" /> Päivitä
          </Button>
        </div>
        {tables.length === 0 ? (
          <EmptyState
            title="Ei pöytiä"
            description={
              isAdmin
                ? "Lisää ensimmäinen pöytä aloittaaksesi."
                : "Ylläpitäjä ei ole vielä lisännyt pöytiä."
            }
          />
        ) : (
          <div className="grid gap-3">
            {tables.map((table) => {
              const session = table.openSession;
              const qrExpired = !!(
                session?.qrTokenExpiresAt &&
                Date.parse(session.qrTokenExpiresAt) <= currentTime
              );
              return (
                <Card key={table.id} className="gap-0 py-0">
                  <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="flex items-center gap-4">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted font-heading text-lg font-semibold">
                        {table.tableNo}
                      </div>
                      <div>
                        <h3 className="font-semibold">
                          Pöytä {table.tableNo}
                          {table.name ? ` · ${table.name}` : ""}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <StatusBadge tone={session ? "success" : "neutral"}>
                            {session ? "Avoin" : "Vapaa"}
                          </StatusBadge>
                          {qrExpired ? (
                            <span className="text-xs text-destructive">
                              QR-koodi on vanhentunut · luo uusi koodi
                            </span>
                          ) : session?.qrTokenExpiresAt ? (
                            <span className="text-xs text-muted-foreground">
                              QR voimassa {formatDate(session.qrTokenExpiresAt)}{" "}
                              asti
                            </span>
                          ) : session ? (
                            <span className="text-xs text-muted-foreground">
                              QR-koodia ei vielä ole
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {session ? (
                        <>
                          {session.qrTokenExpiresAt && !qrExpired && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => void showQr(table)}
                            >
                              <QrCode aria-hidden="true" /> Näytä / tulosta QR
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              setConfirmation({ kind: "rotate", table })
                            }
                          >
                            Uusi koodi
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              setConfirmation({ kind: "close", table })
                            }
                          >
                            Sulje istunto
                          </Button>
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              setCheckoutSession({
                                id: session.id,
                                tableNo: table.tableNo,
                              })
                            }
                          >
                            Maksa istunto
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void openSession(table)}
                        >
                          Avaa istunto
                        </Button>
                      )}
                      {isAdmin && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Muokkaa pöytää ${table.tableNo}`}
                            disabled={busy}
                            onClick={() => startEditor(table)}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Poista pöytä ${table.tableNo}`}
                            disabled={busy || !!session}
                            onClick={() =>
                              setConfirmation({ kind: "delete", table })
                            }
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setEditor(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editor === "new" ? "Lisää pöytä" : "Muokkaa pöytää"}
            </DialogTitle>
            <DialogDescription>
              Anna pöydälle yksilöllinen numero ja halutessasi nimi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveTable} className="space-y-4">
            <label className="block space-y-1 text-sm font-medium">
              Pöydän numero
              <Input
                type="number"
                min={1}
                max={10000}
                required
                value={tableNo}
                onChange={(event) => setTableNo(event.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Nimi (valinnainen)
              <Input
                maxLength={80}
                value={tableName}
                onChange={(event) => setTableName(event.target.value)}
              />
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                Peruuta
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Tallennetaan…" : "Tallenna"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmation?.kind === "rotate"
                ? "Luo uusi QR-koodi?"
                : confirmation?.kind === "close"
                  ? "Sulje istunto?"
                  : "Poista pöytä?"}
            </DialogTitle>
            <DialogDescription>
              {confirmation?.kind === "rotate"
                ? "Vanha QR-koodi lakkaa toimimasta heti. Tulosta ja jaa uusi koodi."
                : confirmation?.kind === "close"
                  ? "QR-koodi lakkaa toimimasta. Istuntoa ei voi sulkea, jos tilauksia on vielä maksamatta."
                  : "Pöytä poistuu aktiivisten pöytien listalta. Historiatiedot säilyvät."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Peruuta
            </Button>
            <Button disabled={busy} onClick={() => void confirmAction()}>
              {busy ? "Odota…" : "Vahvista"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pöytä {preview?.tableNo} · QR-koodi</DialogTitle>
            <DialogDescription>
              Voimassa {preview ? formatDate(preview.expiresAt) : ""} asti. Älä
              jaa linkkiä julkisesti.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="flex flex-col items-center gap-3">
              {/* The data URL is produced locally from the authenticated staff response. */}
              {/* Tietojen URL luodaan paikallisesti tunnistetun henkilökunnan vastauksesta. */}
              <Image
                src={preview.image}
                alt={`Pöydän ${preview.tableNo} QR-koodi`}
                width={288}
                height={288}
                unoptimized
              />
              <p className="break-all text-center text-xs text-muted-foreground">
                {preview.url}
              </p>
              <p className="text-center text-xs text-muted-foreground">
                Jaa QR-koodi vasta käyttöönoton jälkeen.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>
              Sulje
            </Button>
            <Button onClick={printQr}>
              <Printer aria-hidden="true" /> Tulosta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
