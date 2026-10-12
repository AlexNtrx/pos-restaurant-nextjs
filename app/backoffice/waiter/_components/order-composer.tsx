import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import type { StaffTable } from "@/lib/tables";
import type { WaiterCategory, WaiterItem } from "@/lib/waiter-orders";
import type { WaiterPending } from "@/lib/waiter-pending";
import { waiterItemAvailable } from "@/lib/waiter-draft";
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
  draftBlocked,
  unavailableItems,
  selectedCategory,
  selectedFood,
  selectedTable,
  total,
  addItem,
  submit,
  removeItem,
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
  draftBlocked: boolean;
  unavailableItems: boolean;
  selectedCategory: WaiterCategory | undefined;
  selectedFood: WaiterCategory["food"][number] | undefined;
  selectedTable: StaffTable | undefined;
  total: number;
  addItem: () => void;
  submit: () => Promise<void>;
  removeItem: (index: number) => void;
  setTableId: (value: number | null) => void;
  setFoodId: (value: number | null) => void;
  setSizeId: (value: number | null) => void;
  setTasteId: (value: number | null) => void;
  setQuantity: (value: number) => void;
  setNote: (value: string) => void;
}) {
  const locked = saving || !!pending || invalidPending || draftBlocked;
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
          className="h-11 w-full min-w-0 rounded-md border border-border bg-background px-3"
          value={tableId ?? ""}
          disabled={locked}
          onChange={(event) => {
            setTableId(Number(event.target.value));
          }}
        >
          {tableId !== null && !selectedTable && (
            <option value={tableId}>Pöytä ei saatavilla</option>
          )}
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
          className="h-11 w-full min-w-0 rounded-md border border-border bg-background px-3"
          value={foodId ?? ""}
          disabled={locked}
          onChange={(event) => {
            setFoodId(event.target.value ? Number(event.target.value) : null);
          }}
        >
          <option value="">Valitse tuote</option>
          {foodId !== null && !selectedFood && (
            <option value={foodId}>Tuote #{foodId} ei saatavilla</option>
          )}
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
              className="h-11 w-full min-w-0 rounded-md border border-border bg-background px-3"
              value={sizeId ?? ""}
              disabled={locked}
              onChange={(event) =>
                setSizeId(
                  event.target.value ? Number(event.target.value) : null,
                )
              }
            >
              <option value="">Ei kokoa</option>
              {sizeId !== null &&
                !selectedCategory.foodSizes.some(
                  (size) => size.id === sizeId,
                ) && (
                  <option value={sizeId}>Koko #{sizeId} ei saatavilla</option>
                )}
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
              className="h-11 w-full min-w-0 rounded-md border border-border bg-background px-3"
              value={tasteId ?? ""}
              disabled={locked}
              onChange={(event) =>
                setTasteId(
                  event.target.value ? Number(event.target.value) : null,
                )
              }
            >
              <option value="">Ei valintaa</option>
              {tasteId !== null &&
                !selectedCategory.tastes.some(
                  (taste) => taste.id === tasteId,
                ) && (
                  <option value={tasteId}>
                    Valinta #{tasteId} ei saatavilla
                  </option>
                )}
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
            className="h-11 w-full min-w-0 rounded-md border border-border bg-background px-3"
            value={quantity}
            disabled={locked}
            onChange={(event) => setQuantity(Number(event.target.value))}
          />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Huomautus
          <input
            maxLength={500}
            className="h-11 w-full min-w-0 rounded-md border border-border bg-background px-3"
            value={note}
            disabled={locked}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={!selectedFood || locked}
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
          <ul aria-label="Tilausluonnoksen tuotteet" className="space-y-2">
            {items.map((item, index) => {
              const category = categories.find((candidate) =>
                candidate.food.some((food) => food.id === item.foodId),
              );
              const food = category?.food.find(
                (candidate) => candidate.id === item.foodId,
              );
              const size = category?.foodSizes.find(
                (size) => size.id === item.foodSizeId,
              );
              const taste = category?.tastes.find(
                (taste) => taste.id === item.tasteId,
              );
              return (
                <li
                  key={index}
                  className="flex items-start justify-between gap-3 rounded-md border border-border p-3 text-sm"
                >
                  <span className="min-w-0 break-words">
                    {item.quantity} × {food?.name ?? `Tuote #${item.foodId}`}
                    {item.foodSizeId !== null && (
                      <span className="block text-muted-foreground">
                        Koko:{" "}
                        {size?.name ?? `#${item.foodSizeId} · ei saatavilla`}
                      </span>
                    )}
                    {item.tasteId !== null && (
                      <span className="block text-muted-foreground">
                        Valinta:{" "}
                        {taste?.name ?? `#${item.tasteId} · ei saatavilla`}
                      </span>
                    )}
                    {!waiterItemAvailable(item, categories) && (
                      <span className="block text-destructive">
                        Tuote tai vaihtoehto ei saatavilla
                      </span>
                    )}
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
                    className="min-h-11 shrink-0"
                    disabled={locked}
                    onClick={() => removeItem(index)}
                  >
                    Poista
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-semibold">
            {unavailableItems && !pending
              ? "Arvio ei saatavilla"
              : `Arvio ${money.format(pending?.expectedTotal ?? total)}`}
          </span>
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            disabled={
              saving ||
              invalidPending ||
              (!pending &&
                (draftBlocked ||
                  unavailableItems ||
                  !selectedTable ||
                  !items.length))
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
