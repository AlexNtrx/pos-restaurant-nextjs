"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ListPagination } from "@/components/ui/list-pagination";
import {
  qrMoney,
  readQrPending,
  writeQrCart,
  type QrCartItem,
  type QrFood,
  type QrMenu,
} from "@/lib/qr-customer";
import { QrMenuItemCard } from "./qr-menu-item-card";
import { QrMenuItemDetails } from "./qr-menu-item-details";
import { pathFor } from "./qr-navigation";

export function QrMenuView({
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
  const [page, setPage] = useState(1);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [cartItems, setCartItems] = useState<QrCartItem[]>(cart);
  const [selectedSizes, setSelectedSizes] = useState<
    Record<number, number | null>
  >(() =>
    Object.fromEntries(cart.map((item) => [item.foodId, item.foodSizeId])),
  );
  const [selectedTastes, setSelectedTastes] = useState<
    Record<number, number | null>
  >(() => Object.fromEntries(cart.map((item) => [item.foodId, item.tasteId])));
  // EN: Returning to the menu restores the latest cart selection for each product so its note can be edited there.
  // FI: Ruokalistalle palaaminen palauttaa kunkin tuotteen viimeisimmän ostoskorivalinnan, jotta sen huomautusta voi muokata siellä.
  const [selectedNotes, setSelectedNotes] = useState<Record<number, string>>(
    () => Object.fromEntries(cart.map((item) => [item.foodId, item.note])),
  );
  const [detailsFood, setDetailsFood] = useState<QrFood | null>(null);
  const pending = readQrPending(token) !== null;
  const foods = useMemo(
    () => menu.categories.flatMap((category) => category.food),
    [menu.categories],
  );
  const categoriesById = useMemo(
    () => new Map(menu.categories.map((category) => [category.id, category])),
    [menu.categories],
  );
  const foodsById = useMemo(
    () => new Map(foods.map((food) => [food.id, food])),
    [foods],
  );
  const searchText = query.toLocaleLowerCase("fi-FI");
  const shown = useMemo(
    () =>
      foods.filter(
        (food) =>
          (categoryId === null || food.foodTypeId === categoryId) &&
          food.name.toLocaleLowerCase("fi-FI").includes(searchText),
      ),
    [foods, categoryId, searchText],
  );
  const pageSize = 12;
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(shown.length / pageSize)),
  );
  const visibleFoods = shown.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  // EN: Paging limits mounted cards only; selections and totals use the complete menu and cart.
  // FI: Sivutus rajaa vain näkyvät kortit; valinnat ja summat käyttävät koko ruokalistaa ja ostoskoria.
  const count = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const total = cartItems.reduce((sum, item) => {
    const food = foodsById.get(item.foodId);
    const category = food ? categoriesById.get(food.foodTypeId) : undefined;
    const size = category?.foodSizes.find((row) => row.id === item.foodSizeId);
    return (
      sum +
      (food?.price || 0) * item.quantity +
      (size?.moneyAdded || 0) * item.quantity
    );
  }, 0);

  // EN: The menu card and detail dialog share the same selected options, note and cart quantity.
  // FI: Ruokalistakortti ja tietodialogi käyttävät samoja valittuja vaihtoehtoja, huomautusta ja ostoskorimäärää.
  const getSelection = (food: QrFood) => {
    const category = categoriesById.get(food.foodTypeId);
    const sizeId = selectedSizes[food.id] ?? null;
    const tasteId = selectedTastes[food.id] ?? null;
    const note = (selectedNotes[food.id] ?? "").trim();
    const selectedSize = category?.foodSizes.find((size) => size.id === sizeId);
    const selectedCount = cartItems.reduce(
      (sum, item) =>
        item.foodId === food.id &&
        item.tasteId === tasteId &&
        item.foodSizeId === sizeId &&
        item.note === note
          ? sum + item.quantity
          : sum,
      0,
    );
    const tasteName =
      category?.tastes.find((taste) => taste.id === tasteId)?.name ??
      "Ei valintaa";
    return {
      category,
      sizeId,
      tasteId,
      note,
      selectedSize,
      selectedCount,
      selectionName: `${food.name}, ${selectedSize?.name ?? "Tavallinen"}, ${tasteName}`,
    };
  };
  const detailsSelection = detailsFood ? getSelection(detailsFood) : null;

  // EN: Notes typed after adding a portion update that selection too; other customized portions stay unchanged.
  // FI: Annoksen lisäämisen jälkeen kirjoitetut huomautukset päivittävät myös kyseisen valinnan; muut mukautetut annokset säilyvät ennallaan.
  const changeSelectedNote = (food: QrFood, value: string) => {
    if (pending) return;
    const selection = getSelection(food);
    const next = cartItems.map((item) =>
      item.foodId === food.id &&
      item.foodSizeId === selection.sizeId &&
      item.tasteId === selection.tasteId &&
      item.note === selection.note
        ? { ...item, note: value.trim() }
        : item,
    );
    setSelectedNotes((current) => ({ ...current, [food.id]: value }));
    setCartItems(next);
    writeQrCart(token, next);
  };

  // EN: Quantity controls apply only to the selected size, taste and note, preserving differently customized portions.
  // FI: Määräpainikkeet koskevat vain valittua kokoa, makua ja huomautusta, jotta eri tavoin mukautetut annokset säilyvät erillisinä.
  const changeQuantity = (
    foodId: number,
    sizeId: number | null,
    tasteId: number | null,
    note: string,
    delta: number,
  ) => {
    if (pending) return;
    const next = [...cartItems];
    const index = next.findIndex(
      (item) =>
        item.foodId === foodId &&
        item.tasteId === tasteId &&
        item.foodSizeId === sizeId &&
        item.note === note,
    );
    if (delta > 0 && count >= 200) return;
    if (index < 0) {
      if (delta < 0) return;
      next.push({ foodId, foodSizeId: sizeId, tasteId, quantity: 1, note });
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
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
      </label>
      <div className="catalog-navigation mt-5 flex gap-2 overflow-x-auto pb-2">
        {[{ id: null, name: "Kaikki" }, ...menu.categories].map((category) => (
          <button
            key={category.id ?? "all"}
            type="button"
            aria-pressed={categoryId === category.id}
            onClick={() => {
              setCategoryId(category.id);
              setPage(1);
            }}
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
        {visibleFoods.map((food) => {
          const selection = getSelection(food);
          const { sizeId, tasteId, note } = selection;
          return (
            <QrMenuItemCard
              key={food.id}
              food={food}
              selection={selection}
              noteValue={selectedNotes[food.id] ?? ""}
              ordering={menu.state === "ORDERING"}
              pending={pending}
              limitReached={count >= 200}
              onOpenDetails={() => setDetailsFood(food)}
              onSizeChange={(event) =>
                setSelectedSizes((current) => ({
                  ...current,
                  [food.id]: event.target.value
                    ? Number(event.target.value)
                    : null,
                }))
              }
              onTasteChange={(event) =>
                setSelectedTastes((current) => ({
                  ...current,
                  [food.id]: event.target.value
                    ? Number(event.target.value)
                    : null,
                }))
              }
              onNoteChange={(value) => changeSelectedNote(food, value)}
              onQuantityChange={(delta) =>
                changeQuantity(food.id, sizeId, tasteId, note, delta)
              }
            />
          );
        })}
      </div>
      <ListPagination
        label="QR-ruokalistan sivut"
        total={shown.length}
        page={currentPage}
        pageSize={pageSize}
        onPageChange={setPage}
      />
      <QrMenuItemDetails
        food={detailsFood}
        selection={detailsSelection}
        ordering={menu.state === "ORDERING"}
        pending={pending}
        limitReached={count >= 200}
        onOpenChange={(open) => {
          if (!open) setDetailsFood(null);
        }}
        onQuantityChange={(delta) => {
          if (detailsFood && detailsSelection)
            changeQuantity(
              detailsFood.id,
              detailsSelection.sizeId,
              detailsSelection.tasteId,
              detailsSelection.note,
              delta,
            );
        }}
      />
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
