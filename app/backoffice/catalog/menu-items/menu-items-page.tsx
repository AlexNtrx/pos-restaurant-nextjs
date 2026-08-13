"use client";

import {
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import config from "@/app/config";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import {
  isFood,
  isFoodCategory,
  parseResults,
  type Food,
  type FoodCategory,
  type FoodKind,
} from "@/lib/catalog-contracts";
import { cn } from "@/lib/utils";

import { CatalogNavigation } from "../_components/catalog-navigation";
import { filterMenuItems } from "./menu-item-filter";

const currencyFormatter = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});

type LoadStatus = "loading" | "ready" | "error" | "forbidden";
type CategoryFilter = "all" | number;

function imageUrl(fileName: string) {
  return `${config.apiServer}/uploads/${fileName}`;
}

function getPageSize() {
  if (typeof window === "undefined") return 24;
  if (window.matchMedia("(min-width: 1280px)").matches) return 24;
  if (window.matchMedia("(min-width: 768px)").matches) return 18;
  return 12;
}

function useResponsivePageSize() {
  const [pageSize, setPageSize] = useState(24);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const desktop = window.matchMedia("(min-width: 1280px)");
    const tablet = window.matchMedia("(min-width: 768px)");
    const update = () => setPageSize(getPageSize());

    update();
    desktop.addEventListener("change", update);
    tablet.addEventListener("change", update);

    return () => {
      desktop.removeEventListener("change", update);
      tablet.removeEventListener("change", update);
    };
  }, []);

  return pageSize;
}

function MenuItemCard({
  food,
  onEdit,
  onDelete,
}: {
  food: Food;
  onEdit: (food: Food) => void;
  onDelete: (food: Food) => void;
}) {
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-[#d6d6cf] bg-white">
      {food.img ? (
        <div
          role="img"
          aria-label={food.name}
          className="aspect-4/3 w-full shrink-0 rounded-t-[11px] bg-[#f0f0e8] bg-cover bg-center"
          style={{
            backgroundImage: `url(${JSON.stringify(imageUrl(food.img))})`,
          }}
        />
      ) : (
        <div className="flex aspect-4/3 w-full shrink-0 flex-col items-center justify-center gap-2 rounded-t-[11px] bg-[#f0f0e8] text-muted-foreground">
          <ImageIcon aria-hidden="true" className="size-7" />
          <span className="text-xs font-medium">Ei kuvaa</span>
        </div>
      )}

      <div className="flex flex-col gap-2 p-[16px]!">
        <div className="flex h-[30px] min-w-0 items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-[17px]! leading-[22px]! font-semibold! text-[#1f1f1c]!">
            {food.name}
          </h2>
          <details className="group relative shrink-0">
            <summary className="flex h-8 w-9 cursor-pointer list-none items-center justify-center rounded-lg bg-[#f5f5f0] text-[#3b3b33] outline-none hover:bg-[#ecece5] focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <MoreHorizontal aria-hidden="true" className="size-5" />
              <span className="sr-only">Lisää toimintoja: {food.name}</span>
            </summary>
            <div className="absolute top-10 right-0 z-20 w-40 rounded-lg border border-border bg-popover p-1 shadow-lg">
              <button
                type="button"
                onClick={(event) => {
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                  onEdit(food);
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-popover-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Pencil aria-hidden="true" className="size-4" />
                Muokkaa
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                  onDelete(food);
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-md border-t border-border px-3 text-left text-sm font-medium text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Poista
              </button>
            </div>
          </details>
        </div>

        <p className="text-xl! leading-6! font-semibold! text-[#2b401f]!">
          {currencyFormatter.format(food.price)}
        </p>
        <Badge className="min-h-[26px] rounded-full border-0 bg-[#edf0e3] px-[9px] py-[5px] text-xs leading-4 font-medium text-[#384a29]">
          {food.FoodType.name}
        </Badge>
      </div>
    </article>
  );
}

function CatalogSkeleton() {
  return (
    <div
      role="status"
      aria-label="Ruokalistaa ladataan"
      className="grid grid-cols-1 gap-[18px] md:grid-cols-2 md:gap-x-9 lg:grid-cols-[repeat(3,252px)] xl:grid-cols-[repeat(4,252px)] xl:gap-x-[18px]"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-xl border border-border bg-white"
        >
          <div className="aspect-4/3 animate-pulse bg-[#ecece6]" />
          <div className="space-y-3 p-4">
            <div className="h-5 w-3/4 animate-pulse rounded bg-[#ecece6]" />
            <div className="h-6 w-24 animate-pulse rounded bg-[#ecece6]" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-[#ecece6]" />
          </div>
        </div>
      ))}
      <span className="sr-only">Ruokalistaa ladataan…</span>
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  const visiblePages = Array.from(
    { length: Math.min(4, pageCount) },
    (_, index) => index + 1,
  );

  return (
    <nav aria-label="Ruokalistan sivutus" className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-10 w-11 rounded-[9px] p-0"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Edellinen sivu"
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      {visiblePages.map((pageNumber) => (
        <Button
          type="button"
          key={pageNumber}
          variant={page === pageNumber ? "default" : "outline"}
          className={cn(
            "h-10 w-9 rounded-[9px] p-0",
            page === pageNumber && "bg-[#455c2b] hover:bg-[#3d5226]",
          )}
          onClick={() => onPageChange(pageNumber)}
          aria-current={page === pageNumber ? "page" : undefined}
          aria-label={`Sivu ${pageNumber}`}
        >
          {pageNumber}
        </Button>
      ))}
      {pageCount > 4 && (
        <span aria-hidden="true" className="px-1 text-muted-foreground">
          …
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        className="h-10 w-11 rounded-[9px] p-0"
        disabled={page === pageCount}
        onClick={() => onPageChange(page + 1)}
        aria-label="Seuraava sivu"
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
}

export default function MenuItemsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Food | null>(null);
  const [editingFood, setEditingFood] = useState<Food | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [foodTypeId, setFoodTypeId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [remark, setRemark] = useState("");
  const [price, setPrice] = useState("0");
  const [foodKind, setFoodKind] = useState<FoodKind>("food");
  const [currentImage, setCurrentImage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageSize = useResponsivePageSize();

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");

    try {
      const [foodResponse, categoryResponse] = await Promise.all([
        api.get("/food/list"),
        api.get("/foodType/list"),
      ]);
      const parsedFoods = parseResults(foodResponse.data, isFood);
      const parsedCategories = parseResults(
        categoryResponse.data,
        isFoodCategory,
      );

      if (!parsedFoods || !parsedCategories) {
        throw new Error("Palvelin palautti virheellisiä ruokalistatietoja.");
      }

      setFoods(parsedFoods);
      setCategories(parsedCategories);
      setStatus("ready");
    } catch (reason: unknown) {
      setError(getApiErrorMessage(reason, "Ruokalistaa ei voitu ladata."));
      setStatus(isPermissionDeniedError(reason) ? "forbidden" : "error");
    }
  }, []);

  useEffect(() => {
    const requestId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(requestId);
  }, [load]);

  const filteredFoods = useMemo(() => {
    return filterMenuItems(foods, category, query);
  }, [category, foods, query]);

  const pageCount = Math.max(1, Math.ceil(filteredFoods.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleFoods = filteredFoods.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const firstResult = filteredFoods.length
    ? (currentPage - 1) * pageSize + 1
    : 0;
  const lastResult = Math.min(currentPage * pageSize, filteredFoods.length);

  const clearFilters = () => {
    setQuery("");
    setCategory("all");
    setPage(1);
  };

  const resetFileInput = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openCreate = () => {
    setEditingFood(null);
    setFoodTypeId(categories[0]?.id ?? null);
    setName("");
    setRemark("");
    setPrice("0");
    setFoodKind("food");
    setCurrentImage("");
    setFormError("");
    resetFileInput();
    setEditorOpen(true);
  };

  const openEdit = (food: Food) => {
    setEditingFood(food);
    setFoodTypeId(food.foodTypeId);
    setName(food.name);
    setRemark(food.remark);
    setPrice(String(food.price));
    setFoodKind(food.foodType);
    setCurrentImage(food.img);
    setFormError("");
    resetFileInput();
    setEditorOpen(true);
  };

  const uploadImage = async () => {
    if (!selectedFile) return currentImage;
    const formData = new FormData();
    formData.append("file", selectedFile);
    const response = await api.post("/food/upload", formData);
    if (
      typeof response.data?.fileName !== "string" ||
      !response.data.fileName
    ) {
      throw new Error("Palvelin palautti virheellisen kuvatiedoston.");
    }
    return response.data.fileName;
  };

  const saveFood = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const numericPrice = Number(price);
    if (
      !foodTypeId ||
      !normalizedName ||
      !Number.isInteger(numericPrice) ||
      numericPrice < 0
    ) {
      setFormError(
        "Kategoria, nimi ja kokonainen vähintään 0 oleva hinta ovat pakollisia.",
      );
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      const img = await uploadImage();
      const payload = {
        foodTypeId,
        name: normalizedName,
        remark: remark.trim(),
        price: numericPrice,
        img,
        foodType: foodKind,
      };
      if (editingFood)
        await api.put("/food/update", { ...payload, id: editingFood.id });
      else await api.post("/food/create", payload);
      await load();
      setEditorOpen(false);
      toast.success("Ruokalaji tallennettiin.");
    } catch (reason: unknown) {
      setFormError(
        getApiErrorMessage(reason, "Ruokalajia ei voitu tallentaa."),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const removeFood = async () => {
    if (!pendingDelete) return;

    setIsDeleting(true);
    try {
      await api.delete(`/food/remove/${pendingDelete.id}`);
      setFoods((current) =>
        current.filter((food) => food.id !== pendingDelete.id),
      );
      toast.success("Ruokalaji poistettiin.");
      setPendingDelete(null);
    } catch (reason: unknown) {
      toast.error(getApiErrorMessage(reason, "Ruokalajia ei voitu poistaa."));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="ruokalista-catalog tw04-layout font-sans xl:-mt-5 xl:pl-[26px]">
      <CatalogNavigation active="menu-items" />

      <header className="mt-6 md:mt-10 xl:mt-[31px]">
        <div className="flex flex-col gap-[19px]! sm:flex-row sm:items-start sm:justify-between sm:gap-[16px]!">
          <div>
            <h1 className="m-0! text-[26px]! leading-8! font-semibold! text-[#1b1c17]! md:text-[28px]! md:leading-[34px]! xl:text-[30px]! xl:leading-9!">
              Ruokalista
            </h1>
            <p className="mt-1! text-sm! leading-5! text-[#636657]!">
              <span className="md:hidden">Hallitse ruokia ja juomia.</span>
              <span className="hidden md:inline">
                Hallitse ravintolan ruokia ja juomia.
              </span>
            </p>
          </div>
          <Button
            className="h-[46px] w-full rounded-[9px] bg-[#455c2b]! px-5 text-sm font-semibold text-white! no-underline! hover:bg-[#3d5226]! hover:text-white! sm:h-11 sm:w-[178px] xl:mt-1"
            onClick={openCreate}
            disabled={categories.length === 0}
          >
            Lisää ruokalaji
          </Button>
        </div>

        <div className="mt-4! grid grid-cols-2 gap-[16px]! md:mt-[30px]! md:grid-cols-[minmax(0,1fr)_210px_230px] lg:grid-cols-[376px_210px_230px] xl:mt-[15px]! xl:grid-cols-[410px_214px_210px] xl:gap-[18px]!">
          <label className="relative col-span-2 mb-0! block md:col-span-1">
            <span className="sr-only">Hae ruokalistaa</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#636657]"
            />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Hae ruokalistaa"
              className="h-11 rounded-[9px] border-[#d4d4c7] bg-white pl-10! text-sm font-normal! placeholder:font-normal!"
            />
          </label>

          <Select
            value={String(category)}
            onValueChange={(value) => {
              setCategory(value === "all" ? "all" : Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger
              aria-label="Suodata kategorian mukaan"
              className="h-11! w-full rounded-[9px] border-[#d4d4c7] bg-white"
            >
              <SelectValue placeholder="Kaikki kategoriat" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Kaikki kategoriat</SelectItem>
              {categories.map((foodCategory) => (
                <SelectItem
                  key={foodCategory.id}
                  value={String(foodCategory.id)}
                >
                  {foodCategory.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative">
            <Select disabled value="availability-api-pending">
              <SelectTrigger
                aria-label="Saatavuussuodatin ei ole käytössä"
                className="h-11! w-full rounded-[9px] border-[#d4d4c7] bg-[#f0f0e8] opacity-100"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="availability-api-pending">
                  Saatavuus · API
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="absolute top-[52px] -left-[calc(100%+16px)] mt-0! w-[calc(200%+16px)] text-[11px]! leading-4! font-medium! text-[#636657]! md:top-[49px] md:left-0 md:w-max">
              Saatavuussuodatin vaatii API-varmistuksen
            </p>
          </div>
        </div>
      </header>

      <section
        aria-label="Ruokalajit"
        className="mt-[43px]! md:mt-[21px]! xl:mt-[5px]!"
      >
        {status === "ready" && (
          <p className="mb-[14px]! text-sm! leading-5! font-medium! text-[#636657]! md:mb-[13px]! xl:mb-2!">
            {filteredFoods.length} tuotetta
          </p>
        )}

        {status === "loading" ? (
          <CatalogSkeleton />
        ) : status === "forbidden" ? (
          <div
            role="alert"
            className="rounded-xl border border-border bg-white p-8"
          >
            <h2 className="text-xl font-semibold">Ei käyttöoikeutta</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sinulla ei ole oikeutta tarkastella ruokalistaa.
            </p>
          </div>
        ) : status === "error" ? (
          <div
            role="alert"
            className="rounded-xl border border-border bg-white p-8"
          >
            <h2 className="text-xl font-semibold">
              Ruokalistaa ei voitu ladata
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => void load()}
            >
              Yritä uudelleen
            </Button>
          </div>
        ) : foods.length === 0 ? (
          <div className="rounded-xl border border-border bg-white p-8">
            <h2 className="text-xl font-semibold">Ruokalista on tyhjä</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Lisää ensimmäinen ruokalaji katalogiin.
            </p>
            <Button
              className="mt-6"
              onClick={openCreate}
              disabled={categories.length === 0}
            >
              Lisää ruokalaji
            </Button>
          </div>
        ) : filteredFoods.length === 0 ? (
          <div className="rounded-xl border border-border bg-white p-8">
            <h2 className="text-xl font-semibold">Ei hakutuloksia</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Muuta hakua tai tyhjennä suodattimet.
            </p>
            <Button variant="outline" className="mt-6" onClick={clearFilters}>
              Tyhjennä suodattimet
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 md:gap-x-9 lg:grid-cols-[repeat(3,252px)] xl:grid-cols-[repeat(4,252px)] xl:gap-x-[18px]">
              {visibleFoods.map((food) => (
                <MenuItemCard
                  key={food.id}
                  food={food}
                  onEdit={openEdit}
                  onDelete={setPendingDelete}
                />
              ))}
            </div>

            <footer className="mt-8 flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between md:mt-10">
              <p className="text-[13px] leading-[18px] font-medium text-[#636657]">
                {firstResult}–{lastResult} / {filteredFoods.length}
              </p>
              <Pagination
                page={currentPage}
                pageCount={pageCount}
                onPageChange={setPage}
              />
            </footer>
          </>
        )}
      </section>

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => !isSaving && setEditorOpen(open)}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingFood ? "Muokkaa ruokalajia" : "Lisää ruokalaji"}
            </DialogTitle>
            <DialogDescription>
              Ruokalajin tiedot, kuva ja myyntityyppi.
            </DialogDescription>
          </DialogHeader>
          <form
            id="menu-item-form"
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={saveFood}
          >
            <FormField
              id="menu-item-category"
              label="Kategoria"
              required
              className="sm:col-span-2"
            >
              <select
                className="h-10 w-full rounded-md border border-border bg-surface px-3"
                value={foodTypeId ?? ""}
                onChange={(event) => setFoodTypeId(Number(event.target.value))}
              >
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="menu-item-name" label="Nimi" required>
              <Input
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
              />
            </FormField>
            <FormField id="menu-item-price" label="Hinta" required>
              <Input
                type="number"
                min="0"
                step="1"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </FormField>
            <FormField id="menu-item-kind" label="Tyyppi" required>
              <select
                className="h-10 w-full rounded-md border border-border bg-surface px-3"
                value={foodKind}
                onChange={(event) =>
                  setFoodKind(event.target.value as FoodKind)
                }
              >
                <option value="food">Ruoka</option>
                <option value="drink">Juoma</option>
              </select>
            </FormField>
            <FormField
              id="menu-item-image"
              label="Kuva"
              description="JPEG, PNG, WEBP tai GIF, enintään 5 MB."
            >
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) =>
                  setSelectedFile(event.target.files?.[0] ?? null)
                }
              />
            </FormField>
            <FormField
              id="menu-item-remark"
              label="Huomautus"
              className="sm:col-span-2"
            >
              <Input
                value={remark}
                maxLength={500}
                onChange={(event) => setRemark(event.target.value)}
              />
            </FormField>
            {currentImage && !selectedFile && (
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                Nykyinen kuva säilytetään, jos uutta tiedostoa ei valita.
              </p>
            )}
            {formError && (
              <p
                role="alert"
                className="sm:col-span-2 text-sm text-destructive"
              >
                {formError}
              </p>
            )}
          </form>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              disabled={isSaving}
              onClick={() => setEditorOpen(false)}
            >
              Peruuta
            </Button>
            <Button
              type="submit"
              form="menu-item-form"
              disabled={isSaving || !foodTypeId}
            >
              {isSaving ? "Tallennetaan…" : "Tallenna"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Poistetaanko ruokalaji?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${pendingDelete.name} poistetaan ruokalistasta. Toimintoa ei voi perua.`
                : "Ruokalaji poistetaan ruokalistasta."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Peruuta</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void removeFood();
              }}
            >
              {isDeleting ? "Poistetaan…" : "Poista"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
