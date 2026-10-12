"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { fetchMenuItemPage, type MenuItemPage } from "./menu-item-page";

function getPageSize() {
  if (typeof window === "undefined") return 24;
  if (window.matchMedia("(min-width: 1280px)").matches) return 24;
  if (window.matchMedia("(min-width: 768px)").matches) return 18;
  return 12;
}

function useResponsivePageSize(onChange: (size: number) => void) {
  const [pageSize, setPageSize] = useState(24);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const desktop = window.matchMedia("(min-width: 1280px)");
    const tablet = window.matchMedia("(min-width: 768px)");
    const update = () => {
      const size = getPageSize();
      setPageSize(size);
      onChange(size);
    };

    update();
    desktop.addEventListener("change", update);
    tablet.addEventListener("change", update);

    return () => {
      desktop.removeEventListener("change", update);
      tablet.removeEventListener("change", update);
    };
  }, [onChange]);

  return pageSize;
}

export default function MenuItemsPage() {
  const [data, setData] = useState<MenuItemPage | null>(null);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [paginationRequest, setPaginationRequest] = useState({
    page: 1,
    size: 24,
  });
  const [reloadVersion, setReloadVersion] = useState(0);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Food | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const resetForPageSize = useCallback((size: number) => {
    setPaginationRequest({ page: 1, size });
  }, []);
  const pageSize = useResponsivePageSize(resetForPageSize);
  const page = paginationRequest.size === pageSize ? paginationRequest.page : 1;
  // EN: A previous load must not overwrite a reload after a catalog mutation.
  // FI: Aiempi haku ei saa korvata luettelomuutoksen jälkeistä uudelleenlatausta.
  const loadSequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const previousQuery = useRef(query);

  const reload = useCallback(async () => {
    activeRequest.current?.abort();
    ++loadSequence.current;
    setStatus("loading");
    setReloadVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    activeRequest.current = controller;
    const requestId = ++loadSequence.current;
    const delay = previousQuery.current === query ? 0 : 300;
    previousQuery.current = query;

    const load = async () => {
      setStatus("loading");
      setError("");
      try {
        const [parsedPage, parsedCategories] = await Promise.all([
          fetchMenuItemPage(
            { query, category, page, pageSize },
            controller.signal,
          ),
          readStaffCatalog(
            "/foodType/list",
            (data) => parseResults(data, isFoodCategory),
            controller.signal,
          ),
        ]);
        if (controller.signal.aborted || requestId !== loadSequence.current)
          return;
        if (!parsedCategories)
          throw new Error("Palvelin palautti virheellisiä ruokalistatietoja.");
        setData(parsedPage);
        setCategories(parsedCategories);
        setStatus("ready");
      } catch (reason: unknown) {
        if (controller.signal.aborted || requestId !== loadSequence.current)
          return;
        setError(getApiErrorMessage(reason, "Ruokalistaa ei voitu ladata."));
        setStatus(isPermissionDeniedError(reason) ? "forbidden" : "error");
      }
    };

    const timer = window.setTimeout(() => void load(), delay);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [category, page, pageSize, query, reloadVersion]);

  const currentPage = data?.page ?? 1;
  const pageCount = data?.pageCount ?? 1;
  const filteredCount = data?.filteredCount ?? 0;
  const firstResult = filteredCount ? (currentPage - 1) * pageSize + 1 : 0;
  const lastResult = Math.min(currentPage * pageSize, filteredCount);

  // EN: Invalidate immediately, including while search is debouncing; an old response must not restore stale edit actions.
  // FI: Mitätöi heti myös haun viiveen aikana; vanha vastaus ei saa palauttaa vanhentuneita muokkaustoimintoja.
  const startNavigation = (nextPage = 1) => {
    activeRequest.current?.abort();
    ++loadSequence.current;
    setStatus("loading");
    setPaginationRequest({ page: nextPage, size: pageSize });
  };

  const clearFilters = () => {
    startNavigation();
    setQuery("");
    setCategory("all");
  };

  const {
    editingFood,
    editorOpen,
    foodTypeId,
    name,
    remark,
    price,
    foodKind,
    taxCategory,
    setTaxCategory,
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
  } = useMenuItemEditor(categories, reload);
  const removeFood = async () => {
    if (!pendingDelete) return;

    setIsDeleting(true);
    try {
      await api.delete(`/food/remove/${pendingDelete.id}`);
      invalidateCatalogCache();
      await reload();
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
          startNavigation();
          setQuery(value);
        }}
        onCategoryChange={(value) => {
          startNavigation();
          setCategory(value);
        }}
      />

      <MenuItemsList
        status={status}
        error={error}
        totalCount={data?.totalCount ?? 0}
        filteredCount={filteredCount}
        visibleFoods={data?.results ?? []}
        canCreate={categories.length > 0}
        pagination={{ page: currentPage, pageCount, firstResult, lastResult }}
        onPageChange={(nextPage) => {
          if (nextPage !== currentPage) startNavigation(nextPage);
        }}
        onCreate={openCreate}
        onRetry={() => void reload()}
        onClearFilters={clearFilters}
        onEdit={openEdit}
        onDelete={setPendingDelete}
      />

      <MenuItemEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editingFood !== null}
        saving={isSaving}
        draft={{ foodTypeId, name, price, foodKind, taxCategory, remark }}
        onDraftChange={{
          foodTypeId: setFoodTypeId,
          name: setName,
          price: setPrice,
          foodKind: setFoodKind,
          taxCategory: setTaxCategory,
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
