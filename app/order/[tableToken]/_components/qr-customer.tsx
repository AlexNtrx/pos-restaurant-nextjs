"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ImageIcon } from "lucide-react";
import config from "@/app/config";
import ServiceCallCard from "./service-call-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  lastQrOrder,
  loadQrContext,
  loadQrMenu,
  loadQrOrder,
  qrErrorText,
  qrMoney,
  readQrCart,
  readQrPending,
  submitQrOrder,
  writeLastQrOrder,
  writeQrCart,
  writeQrPending,
  type QrCartItem,
  type QrContext,
  type QrFood,
  type QrMenu,
  type QrOrder,
  type QrPending,
} from "@/lib/qr-customer";

type View = "menu" | "item" | "cart" | "confirmation" | "status";

const pathFor = (token: string, suffix = "") =>
  `/order/${encodeURIComponent(token)}${suffix}`;

const orderIdFrom = (value: string | null) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

// EN: Public menu images use only safe uploaded filenames from the API origin.
// FI: Julkisen ruokalistan kuvat käyttävät vain turvallisia ladattuja tiedostonimiä API-osoitteesta.
function foodImageUrl(filename: string) {
  if (
    typeof filename !== "string" ||
    filename.length === 0 ||
    filename.length > 160 ||
    !/^[\w.-]+\.(?:jpe?g|png|webp|gif)$/i.test(filename)
  )
    return null;
  return `${config.apiServer}/uploads/${encodeURIComponent(filename)}`;
}

function QrFoodPhoto({
  filename,
  alt,
  className,
  sizes,
  fit = "cover",
}: {
  filename: string;
  alt: string;
  className: string;
  sizes: string;
  fit?: "cover" | "contain";
}) {
  const [failed, setFailed] = useState(false);
  const src = foodImageUrl(filename);
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-[#efece6] ${className}`}
    >
      {src && !failed ? (
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized
          sizes={sizes}
          className={fit === "contain" ? "object-contain" : "object-cover"}
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageIcon aria-hidden="true" className="size-7 text-olive/40" />
      )}
    </div>
  );
}

function QrFrame({
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

function QrProblem({
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

function QrMenuView({
  token,
  menu,
  cart,
}: {
  token: string;
  menu: QrMenu;
  cart: QrCartItem[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [cartItems, setCartItems] = useState<QrCartItem[]>(cart);
  const [selectedSizes, setSelectedSizes] = useState<
    Record<number, number | null>
  >({});
  const [selectedTastes, setSelectedTastes] = useState<
    Record<number, number | null>
  >({});
  const [detailsFood, setDetailsFood] = useState<QrFood | null>(null);
  const pending = readQrPending(token) !== null;
  const foods = menu.categories.flatMap((category) => category.food);
  const shown = foods.filter(
    (food) =>
      (categoryId === null || food.foodTypeId === categoryId) &&
      food.name
        .toLocaleLowerCase("fi-FI")
        .includes(query.toLocaleLowerCase("fi-FI")),
  );
  const count = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const total = cartItems.reduce((sum, item) => {
    const category = menu.categories.find((row) =>
      row.food.some((food) => food.id === item.foodId),
    );
    const food = category?.food.find((row) => row.id === item.foodId);
    const size = category?.foodSizes.find((row) => row.id === item.foodSizeId);
    return (
      sum +
      (food?.price || 0) * item.quantity +
      (size?.moneyAdded || 0) * item.quantity
    );
  }, 0);

  // EN: Inline controls change the selected size and taste with no customer note; noted cart lines remain separate.
  // FI: Rivin painikkeet muuttavat valittua kokoa ja makua ilman asiakkaan huomautusta; huomautukselliset ostoskoririvit pysyvät erillisinä.
  const changeQuantity = (
    foodId: number,
    sizeId: number | null,
    tasteId: number | null,
    delta: number,
  ) => {
    if (pending) return;
    const next = [...cartItems];
    const index = next.findIndex(
      (item) =>
        item.foodId === foodId &&
        item.tasteId === tasteId &&
        item.foodSizeId === sizeId &&
        item.note === "",
    );
    if (delta > 0 && count >= 200) return;
    if (index < 0) {
      if (delta < 0) return;
      next.push({ foodId, foodSizeId: sizeId, tasteId, quantity: 1, note: "" });
    } else {
      const quantity = next[index].quantity + delta;
      if (quantity <= 0) next.splice(index, 1);
      else next[index] = { ...next[index], quantity };
    }
    writeQrCart(token, next);
    setCartItems(next);
  };
  return (
    <>
      <h1 className="font-heading text-3xl font-semibold">Tilaa pöytään</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {menu.state === "ORDERING"
          ? "Valitse tuotteet ja lähetä tilaus henkilökunnalle."
          : "Voit selata ruokalistaa. QR-tilaaminen ei ole juuri nyt käytettävissä."}
      </p>
      <label className="mt-5 block">
        <span className="sr-only">Hae ruokalistasta</span>
        <input
          className="h-11 w-full rounded-lg border border-border bg-surface px-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Hae ruokalistasta"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="catalog-navigation mt-5 flex gap-2 overflow-x-auto pb-2">
        {[{ id: null, name: "Kaikki" }, ...menu.categories].map((category) => (
          <button
            key={category.id ?? "all"}
            type="button"
            aria-pressed={categoryId === category.id}
            onClick={() => setCategoryId(category.id)}
            className={`min-h-12 shrink-0 border-b-[3px] px-3 text-sm ${categoryId === category.id ? "border-olive font-semibold text-olive" : "border-transparent text-muted-foreground"}`}
          >
            {category.name}
          </button>
        ))}
      </div>
      <div className="mt-5 space-y-4">
        {shown.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Tuotteita ei löytynyt.
          </p>
        )}
        {shown.map((food) => {
          const category = menu.categories.find(
            (row) => row.id === food.foodTypeId,
          );
          const sizeId = selectedSizes[food.id] ?? null;
          const tasteId = selectedTastes[food.id] ?? null;
          const selectedSize = category?.foodSizes.find(
            (size) => size.id === sizeId,
          );
          const selectedCount = cartItems.reduce(
            (sum, item) =>
              item.foodId === food.id &&
              item.tasteId === tasteId &&
              item.foodSizeId === sizeId &&
              item.note === ""
                ? sum + item.quantity
                : sum,
            0,
          );
          const tasteName =
            category?.tastes.find((taste) => taste.id === tasteId)?.name ??
            "Ei valintaa";
          const selectionName = `${food.name}, ${selectedSize?.name ?? "Tavallinen"}, ${tasteName}`;
          return (
            <article
              key={food.id}
              className="overflow-hidden rounded-lg border border-border bg-surface"
            >
              <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 p-3">
                <QrFoodPhoto
                  key={`${food.id}:${food.img}`}
                  filename={food.img}
                  alt=""
                  className="size-24 rounded-md"
                  sizes="96px"
                />
                <div className="flex min-w-0 flex-col justify-between gap-2 py-0.5">
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 text-base font-semibold leading-5">
                      {food.name}
                    </h2>
                    {food.remark && (
                      <p className="mt-1 line-clamp-2 text-xs text-olive">
                        <span className="font-medium">Huomautus: </span>
                        {food.remark}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-sm font-semibold">
                      {qrMoney(food.price + (selectedSize?.moneyAdded ?? 0))}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 px-2 text-xs"
                      aria-label={`Lisätiedot: ${food.name}`}
                      onClick={() => setDetailsFood(food)}
                    >
                      Lisätiedot
                    </Button>
                  </div>
                </div>
              </div>
              {menu.state === "ORDERING" && (
                <div className="space-y-2 border-t border-border px-3 py-3">
                  <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
                    <label
                      className={`block text-xs text-muted-foreground ${category?.tastes.length ? "" : "min-[390px]:col-span-2"}`}
                    >
                      Koko
                      <select
                        className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-2 text-sm text-foreground"
                        aria-label={`Koko: ${food.name}`}
                        value={sizeId ?? ""}
                        disabled={pending}
                        onChange={(event) =>
                          setSelectedSizes((current) => ({
                            ...current,
                            [food.id]: event.target.value
                              ? Number(event.target.value)
                              : null,
                          }))
                        }
                      >
                        <option value="">Tavallinen</option>
                        {category?.foodSizes.map((size) => (
                          <option key={size.id} value={size.id}>
                            {size.name} · +{qrMoney(size.moneyAdded)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {category && category.tastes.length > 0 && (
                      <label className="block text-xs text-muted-foreground">
                        Maku
                        <select
                          className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-2 text-sm text-foreground"
                          aria-label={`Maku: ${food.name}`}
                          value={tasteId ?? ""}
                          disabled={pending}
                          onChange={(event) =>
                            setSelectedTastes((current) => ({
                              ...current,
                              [food.id]: event.target.value
                                ? Number(event.target.value)
                                : null,
                            }))
                          }
                        >
                          <option value="">Ei valintaa</option>
                          {category.tastes.map((taste) => (
                            <option key={taste.id} value={taste.id}>
                              {taste.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-11"
                        aria-label={`Vähennä ${selectionName}`}
                        disabled={pending || selectedCount === 0}
                        onClick={() =>
                          changeQuantity(food.id, sizeId, tasteId, -1)
                        }
                      >
                        −
                      </Button>
                      <span
                        className="min-w-5 text-center text-sm"
                        aria-live="polite"
                      >
                        {selectedCount}
                      </span>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="size-11"
                        aria-label={`Lisää ${selectionName}`}
                        disabled={pending || count >= 200}
                        onClick={() =>
                          changeQuantity(food.id, sizeId, tasteId, 1)
                        }
                      >
                        +
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <Dialog
        open={detailsFood !== null}
        onOpenChange={(open) => {
          if (!open) setDetailsFood(null);
        }}
      >
        {detailsFood && (
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader className="pr-10">
              <DialogTitle>{detailsFood.name}</DialogTitle>
              <DialogDescription>
                {detailsFood.remark || "Tuotteen kuva ja hinta."}
              </DialogDescription>
            </DialogHeader>
            {detailsFood.detailImg ? (
              <QrFoodPhoto
                key={`${detailsFood.id}:${detailsFood.detailImg}`}
                filename={detailsFood.detailImg}
                alt={detailsFood.name}
                className="h-[65dvh] max-h-[600px] w-full rounded-lg"
                sizes="(min-width: 640px) 536px, calc(100vw - 72px)"
                fit="contain"
              />
            ) : (
              <p className="rounded-lg bg-[#efece6] px-4 py-8 text-center text-sm text-muted-foreground">
                Tälle tuotteelle ei ole vielä lisätietokuvaa.
              </p>
            )}
            <p className="font-semibold">{qrMoney(detailsFood.price)}</p>
          </DialogContent>
        )}
      </Dialog>
      {pending && menu.state === "ORDERING" && (
        <p className="mt-5 text-sm text-olive">
          Edellisen lähetyksen tulos on epäselvä. Tarkista ostoskori ennen
          muutoksia.
        </p>
      )}
      {menu.state === "ORDERING" && (
        <div className="fixed inset-x-5 bottom-5 z-10 mx-auto max-w-[536px]">
          <Button
            className="h-[60px] w-full justify-between bg-foreground px-5 text-surface hover:bg-foreground/90"
            aria-label={`Ostoskori, ${count} tuotetta`}
            onClick={() => router.push(pathFor(token, "/cart"))}
          >
            <span>Ostoskori · {count} tuotetta</span>
            <span className="text-action">{qrMoney(total)} →</span>
          </Button>
        </div>
      )}
      <p className="mt-7 text-xs text-muted-foreground">
        Ruokalista voi muuttua saatavuuden ja ajankohdan mukaan.
      </p>
    </>
  );
}

function QrItemView({
  token,
  menu,
  itemId,
}: {
  token: string;
  menu: QrMenu;
  itemId: number | null;
}) {
  const router = useRouter();
  const category = menu.categories.find((row) =>
    row.food.some((food) => food.id === itemId),
  );
  const food = category?.food.find((row) => row.id === itemId);
  const [sizeId, setSizeId] = useState<number | null>(null);
  const [tasteId, setTasteId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const pending = readQrPending(token) !== null;
  if (!food || !category) {
    return (
      <QrProblem
        title="Tuotetta ei löytynyt"
        detail="Tuote ei ole enää saatavilla."
        onRetry={() => router.push(pathFor(token))}
      />
    );
  }
  const size = category.foodSizes.find((row) => row.id === sizeId);
  const total = (food.price + (size?.moneyAdded || 0)) * quantity;
  const add = () => {
    if (pending) return;
    const cart = readQrCart(token);
    if (cart.reduce((sum, item) => sum + item.quantity, 0) + quantity > 200)
      return;
    cart.push({
      foodId: food.id,
      foodSizeId: sizeId,
      tasteId,
      quantity,
      note: note.trim(),
    });
    writeQrCart(token, cart);
    router.push(pathFor(token));
  };
  return (
    <>
      <Button
        variant="ghost"
        className="mb-5 px-0"
        onClick={() => router.push(pathFor(token))}
      >
        ← Ruokalista
      </Button>
      <QrFoodPhoto
        key={`${food.id}:${food.img}`}
        filename={food.img}
        alt={food.name}
        className="h-40 w-full rounded-lg"
        sizes="(min-width: 640px) 536px, calc(100vw - 40px)"
      />
      <h1 className="mt-5 font-heading text-3xl font-semibold">{food.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{food.remark}</p>
      <p className="mt-3 font-semibold">{qrMoney(food.price)}</p>
      <section className="mt-6 space-y-5 rounded-lg border border-border bg-surface p-5">
        <div>
          <label htmlFor="qr-size" className="mb-2 block text-sm font-medium">
            Koko
          </label>
          <select
            id="qr-size"
            className="h-12 w-full rounded-md border border-border bg-surface px-3"
            value={sizeId ?? ""}
            onChange={(event) =>
              setSizeId(event.target.value ? Number(event.target.value) : null)
            }
          >
            <option value="">Tavallinen</option>
            {category.foodSizes.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · +{qrMoney(row.moneyAdded)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="qr-taste" className="mb-2 block text-sm font-medium">
            Maku
          </label>
          <select
            id="qr-taste"
            className="h-12 w-full rounded-md border border-border bg-surface px-3"
            value={tasteId ?? ""}
            onChange={(event) =>
              setTasteId(event.target.value ? Number(event.target.value) : null)
            }
          >
            <option value="">Ei valintaa</option>
            {category.tastes.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="qr-note" className="mb-2 block text-sm font-medium">
            Huomautus keittiölle
          </label>
          <textarea
            id="qr-note"
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="min-h-24 w-full rounded-md border border-border bg-surface p-3"
            placeholder="Esim. ei chiliä"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Määrä</span>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              aria-label="Vähennä määrää"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
            >
              −
            </Button>
            <span aria-live="polite">{quantity}</span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Lisää määrää"
              onClick={() => setQuantity(Math.min(200, quantity + 1))}
            >
              +
            </Button>
          </div>
        </div>
      </section>
      {menu.state === "ORDERING" ? (
        <>
          <Button className="mt-6 h-12 w-full" disabled={pending} onClick={add}>
            Lisää ostoskoriin · {qrMoney(total)}
          </Button>
          {pending && (
            <p className="mt-3 text-sm text-olive">
              Tarkista keskeneräinen lähetys ostoskorissa ennen muutoksia.
            </p>
          )}
        </>
      ) : (
        <p className="mt-6 text-sm text-olive">
          QR-tilaaminen on suljettu. Voit vain selata ruokalistaa.
        </p>
      )}
    </>
  );
}

function QrCartView({ token, menu }: { token: string; menu: QrMenu }) {
  const router = useRouter();
  const [cart, setCart] = useState<QrCartItem[]>(() => readQrCart(token));
  const [pending, setPending] = useState<QrPending | null>(() =>
    readQrPending(token),
  );
  const [busy, setBusy] = useState(false);
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
      total:
        (food?.price || 0) * item.quantity +
        (size?.moneyAdded || 0) * item.quantity,
    };
  });
  const missing = rows.some(
    (row) =>
      !row.food ||
      (row.item.foodSizeId && !row.size) ||
      (row.item.tasteId && !row.taste),
  );
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const change = (index: number, quantity: number) => {
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
    if (busy || (!pending && (missing || menu.state !== "ORDERING"))) return;
    const attempt = pending || {
      idempotencyKey: crypto.randomUUID(),
      expectedTotal: total,
      items: cart,
    };
    if (!pending) {
      setPending(attempt);
      writeQrPending(token, attempt);
    }
    setBusy(true);
    setError("");
    try {
      const result = await submitQrOrder(token, attempt);
      writeQrPending(token, null);
      writeQrCart(token, []);
      writeLastQrOrder(token, result.orderId);
      router.replace(pathFor(token, `/confirmation?orderId=${result.orderId}`));
    } catch (failure) {
      setError(qrErrorText(failure));
      // EN: A definitive HTTP rejection can be corrected; an unknown network outcome must retry unchanged.
      // FI: Varma HTTP-hylkäys voidaan korjata; epäselvä verkkotulos on yritettävä uudelleen muuttumattomana.
      if (
        typeof failure === "object" &&
        failure &&
        "response" in failure &&
        failure.response
      ) {
        setPending(null);
        writeQrPending(token, null);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        variant="ghost"
        className="mb-5 px-0"
        onClick={() => router.push(pathFor(token))}
      >
        ← Ruokalista
      </Button>
      <h1 className="font-heading text-3xl font-semibold">Ostoskori</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tarkista tilaus ennen lähettämistä pöytään P{menu.tableNo}.
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
              <h2 className="font-medium">
                {row.food?.name || "Tuote ei ole enää saatavilla"}
              </h2>
              <span>{qrMoney(row.total)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {[row.size?.name, row.taste?.name].filter(Boolean).join(" · ")}
            </p>
            {row.item.note && (
              <p className="mt-1 text-xs text-olive">{row.item.note}</p>
            )}
            {!pending && (
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
      {missing && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Jokin tuote tai valinta ei ole enää saatavilla. Poista se
          ostoskorista.
        </p>
      )}
      {pending && (
        <p className="mt-4 text-sm text-olive">
          Edellisen lähetyksen tulos on epäselvä. Yritä samaa tilausta
          uudelleen; älä muuta ostoskoria.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-between border-t border-border pt-4 font-semibold">
        <span>Yhteensä</span>
        <span>{qrMoney(total)}</span>
      </div>
      <Button
        className="mt-6 h-12 w-full"
        disabled={
          busy ||
          (!pending && (!cart.length || missing || menu.state !== "ORDERING"))
        }
        onClick={submit}
      >
        {busy
          ? "Lähetetään…"
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

function QrPendingRecovery({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(() => readQrPending(token));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!pending)
    return error ? (
      <p role="alert" className="mt-4 text-sm text-destructive">
        {error}
      </p>
    ) : null;
  const retry = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await submitQrOrder(token, pending);
      writeQrPending(token, null);
      writeQrCart(token, []);
      writeLastQrOrder(token, result.orderId);
      router.replace(pathFor(token, `/confirmation?orderId=${result.orderId}`));
    } catch (failure) {
      setError(qrErrorText(failure));
      if (
        typeof failure === "object" &&
        failure &&
        "response" in failure &&
        failure.response
      ) {
        setPending(null);
        writeQrPending(token, null);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-6 rounded-lg border border-border bg-surface p-5">
      <p className="text-sm">
        Edellisen lähetyksen tulos on epäselvä. Tarkista sama tilaus ilman
        muutoksia.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button className="mt-4 h-12 w-full" disabled={busy} onClick={retry}>
        {busy ? "Tarkistetaan…" : "Tarkista edellinen tilaus"}
      </Button>
    </div>
  );
}

function QrStatusView({
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
  const refresh = useCallback(async () => {
    if (!orderId) return;
    try {
      setOrder(await loadQrOrder(token, orderId));
      setError("");
    } catch (failure) {
      setError(qrErrorText(failure));
    }
  }, [token, orderId]);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);
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

export default function QrCustomer({ view }: { view: View }) {
  const params = useParams<{ tableToken: string; menuItemId?: string }>();
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
        const nextContext = await loadQrContext(token);
        if (!live) return;
        setContext(nextContext);
        if (
          nextContext.state !== "CLOSED" &&
          ["menu", "item", "cart"].includes(view)
        ) {
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
  const itemId = useMemo(
    () => orderIdFrom(params.menuItemId || null),
    [params.menuItemId],
  );
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
      ) : context?.state === "CLOSED" &&
        ["menu", "item", "cart"].includes(view) ? (
        <>
          <QrProblem
            title="QR-tilaaminen on suljettu"
            detail="Ravintola ei ota juuri nyt vastaan QR-tilauksia. Jo lähetetty tilaus etenee normaalisti sulkemisen jälkeen."
          />
          {view === "cart" && <QrPendingRecovery token={token} />}
        </>
      ) : view === "menu" && menu ? (
        <QrMenuView token={token} menu={menu} cart={readQrCart(token)} />
      ) : view === "item" && menu ? (
        <QrItemView token={token} menu={menu} itemId={itemId} />
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
