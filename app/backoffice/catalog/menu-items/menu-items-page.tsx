"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

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
import api from "@/lib/api";
import { readStaffCatalog, invalidateCatalogCache } from "@/lib/catalog-reads";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import {
  isFood,
  isFoodCategory,
  parseResults,
  type Food,
  type FoodCategory,
} from "@/lib/catalog-contracts";

import { useMenuItemEditor } from "./_hooks/use-menu-item-editor";
import { CatalogNavigation } from "../_components/catalog-navigation";
import { MenuItemEditor } from "./_components/menu-item-editor";
import { MenuItemsList, type LoadStatus } from "./_components/menu-items-list";
import {
  MenuItemsToolbar,
  type CategoryFilter,
} from "./_components/menu-items-toolbar";
import { filterMenuItems } from "./menu-item-filter";

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

export default function MenuItemsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Food | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const pageSize = useResponsivePageSize();
  // EN: A previous load must not overwrite a reload after a catalog mutation.
  // FI: Aiempi haku ei saa korvata luettelomuutoksen jälkeistä uudelleenlatausta.
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadSequence.current;
    setStatus("loading");
    setError("");

    try {
      const [parsedFoods, parsedCategories] = await Promise.all([
        readStaffCatalog("/food/list", (data) => parseResults(data, isFood)),
        readStaffCatalog("/foodType/list", (data) =>
          parseResults(data, isFoodCategory),
        ),
      ]);
      if (requestId !== loadSequence.current) return;

      if (!parsedFoods || !parsedCategories) {
        throw new Error("Palvelin palautti virheellisiä ruokalistatietoja.");
      }

      setFoods(parsedFoods);
      setCategories(parsedCategories);
      setStatus("ready");
    } catch (reason: unknown) {
      if (requestId !== loadSequence.current) return;
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

  const {
    editingFood,
    editorOpen,
    foodTypeId,
    name,
    remark,
    price,
    foodKind,
    currentImage,
    currentDetailImage,
    selectedFile,
    selectedDetailFile,
    formError,
    isSaving,
    fileInputRef,
    detailFileInputRef,
    openCreate,
    openEdit,
    saveFood,
    setEditorOpen,
    setFoodTypeId,
    setName,
    setRemark,
    setPrice,
    setFoodKind,
    setSelectedFile,
    setCurrentDetailImage,
    setSelectedDetailFile,
  } = useMenuItemEditor(categories, load);
  const removeFood = async () => {
    if (!pendingDelete) return;

    setIsDeleting(true);
    try {
      await api.delete(`/food/remove/${pendingDelete.id}`);
      invalidateCatalogCache();
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

      <MenuItemsToolbar
        query={query}
        category={category}
        categories={categories}
        canCreate={categories.length > 0}
        onCreate={openCreate}
        onQueryChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        onCategoryChange={(value) => {
          setCategory(value);
          setPage(1);
        }}
      />

      <MenuItemsList
        status={status}
        error={error}
        totalCount={foods.length}
        filteredCount={filteredFoods.length}
        visibleFoods={visibleFoods}
        canCreate={categories.length > 0}
        pagination={{ page: currentPage, pageCount, firstResult, lastResult }}
        onPageChange={setPage}
        onCreate={openCreate}
        onRetry={() => void load()}
        onClearFilters={clearFilters}
        onEdit={openEdit}
        onDelete={setPendingDelete}
      />

      <MenuItemEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editingFood !== null}
        saving={isSaving}
        draft={{ foodTypeId, name, price, foodKind, remark }}
        onDraftChange={{
          foodTypeId: setFoodTypeId,
          name: setName,
          price: setPrice,
          foodKind: setFoodKind,
          remark: setRemark,
        }}
        categories={categories}
        listImageInputRef={fileInputRef}
        detailImageInputRef={detailFileInputRef}
        listImage={{
          fileName: currentImage,
          selectedFile,
          onSelect: setSelectedFile,
        }}
        detailImage={{
          fileName: currentDetailImage,
          selectedFile: selectedDetailFile,
          onSelect: setSelectedDetailFile,
          onRemove: () => setCurrentDetailImage(""),
        }}
        error={formError}
        onSubmit={saveFood}
      />

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
