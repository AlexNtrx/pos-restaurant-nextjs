import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import type { StaffTable } from "@/lib/tables";
import type { WaiterCategory, WaiterItem } from "@/lib/waiter-orders";
import type { WaiterPending } from "@/lib/waiter-pending";
const money = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});

export function OrderComposer({
  tables,
  categories,
  tableId,
  foodId,
  sizeId,
  tasteId,
  quantity,
  note,
  items,
  saving,
  pending,
  invalidPending,
  selectedCategory,
  selectedFood,
  selectedTable,
  total,
  addItem,
  submit,
  onDraftChange,
  setItems,
  setTableId,
  setFoodId,
  setSizeId,
  setTasteId,
  setQuantity,
  setNote,
}: {
  tables: StaffTable[];
  categories: WaiterCategory[];
  tableId: number | null;
  foodId: number | null;
  sizeId: number | null;
  tasteId: number | null;
  quantity: number;
  note: string;
  items: WaiterItem[];
  saving: boolean;
  pending: WaiterPending | null;
  invalidPending: boolean;
  selectedCategory: WaiterCategory | undefined;
  selectedFood: WaiterCategory["food"][number] | undefined;
  selectedTable: StaffTable | undefined;
  total: number;
  addItem: () => void;
  submit: () => Promise<void>;
  onDraftChange: () => void;
  setItems: Dispatch<SetStateAction<WaiterItem[]>>;
  setTableId: Dispatch<SetStateAction<number | null>>;
  setFoodId: Dispatch<SetStateAction<number | null>>;
  setSizeId: Dispatch<SetStateAction<number | null>>;
  setTasteId: Dispatch<SetStateAction<number | null>>;
  setQuantity: Dispatch<SetStateAction<number>>;
  setNote: Dispatch<SetStateAction<string>>;
}) {
  return (
    <section className="space-y-5 rounded-xl border border-border bg-surface p-5">
      <div>
        <h2 className="font-heading text-xl font-semibold">Ota pöytätilaus</h2>
        <p className="text-sm text-muted-foreground">
          Tilaus lähetetään keittiöön. Maksu käsitellään kassalla myöhemmin.
        </p>
      </div>
      <label className="block space-y-1 text-sm font-medium">
        Pöytä
        <select
          className="h-10 w-full rounded-md border border-border bg-background px-3"
          value={tableId ?? ""}
          disabled={saving || !!pending || invalidPending}
          onChange={(event) => {
            setTableId(Number(event.target.value));
            setItems([]);
            onDraftChange();
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
        disabled={!selectedFood || saving || !!pending || invalidPending}
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
                    disabled={saving || !!pending || invalidPending}
                    onClick={() => {
                      setItems((current) =>
                        current.filter((_, at) => at !== index),
                      );
                      onDraftChange();
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
          <span className="font-semibold">
            Arvio {money.format(pending?.expectedTotal ?? total)}
          </span>
          <Button
            type="button"
            disabled={
              saving ||
              invalidPending ||
              (!pending && (!selectedTable || !items.length))
            }
            onClick={() => void submit()}
          >
            {saving
              ? "Lähetetään…"
              : pending
                ? "Tarkista aiempi lähetys"
                : "Lähetä keittiöön"}
          </Button>
        </div>
      </div>
    </section>
  );
}
