"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { readStaffCatalog, invalidateCatalogCache } from "@/lib/catalog-reads";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import {
  isFoodCategory,
  isFoodSize,
  isTaste,
  parseResults,
  type FoodCategory,
  type FoodSize,
  type Taste,
} from "@/lib/catalog-contracts";

import { CatalogNavigation, type CatalogSection } from "./catalog-navigation";

type ManagementKind = Exclude<CatalogSection, "menu-items">;
type ManagementRow = FoodCategory | FoodSize | Taste;
type LoadStatus = "loading" | "ready" | "error" | "forbidden";

const currencyFormatter = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});

const configs = {
  categories: {
    title: "Kategoriat",
    description: "Hallitse ruokalistan kategorioita.",
    singular: "kategoria",
    endpoint: "/foodType/list",
    createEndpoint: "/foodtype/create",
    updateEndpoint: "/foodtype/update",
    removeEndpoint: "/foodtype/remove",
    validator: isFoodCategory,
  },
  "size-options": {
    title: "Kokovaihtoehdot",
    description: "Hallitse kategorioihin liitettyjä kokoja ja hinnanlisiä.",
    singular: "kokovaihtoehto",
    endpoint: "/foodSize/list",
    createEndpoint: "/foodSize/create",
    updateEndpoint: "/foodSize/update",
    removeEndpoint: "/foodSize/remove",
    validator: isFoodSize,
  },
  modifiers: {
    title: "Lisävalinnat",
    description: "Hallitse kategorioihin liitettyjä maku- ja lisävalintoja.",
    singular: "lisävalinta",
    endpoint: "/taste/list",
    createEndpoint: "/taste/create",
    updateEndpoint: "/taste/update",
    removeEndpoint: "/taste/remove",
    validator: isTaste,
  },
} satisfies Record<ManagementKind, object>;

function hasCategory(row: ManagementRow): row is FoodSize | Taste {
  return "FoodType" in row;
}

export function CatalogManagementPage({ kind }: { kind: ManagementKind }) {
  const config = configs[kind];
  const [rows, setRows] = useState<ManagementRow[]>([]);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ManagementRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ManagementRow | null>(
    null,
  );
  const [name, setName] = useState("");
  const [remark, setRemark] = useState("");
  const [foodTypeId, setFoodTypeId] = useState<number | null>(null);
  const [moneyAdded, setMoneyAdded] = useState("0");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // EN: A previous load must not overwrite a reload after a catalog mutation.
  // FI: Aiempi haku ei saa korvata luettelomuutoksen jälkeistä uudelleenlatausta.
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadSequence.current;
    setStatus("loading");
    setError("");
    try {
      const [parsedRows, parsedCategories] = await Promise.all([
        readStaffCatalog(config.endpoint, (data) =>
          parseResults(data, config.validator),
        ),
        kind === "categories"
          ? Promise.resolve(null)
          : readStaffCatalog("/foodType/list", (data) =>
              parseResults(data, isFoodCategory),
            ),
      ]);
      if (requestId !== loadSequence.current) return;
      if (!parsedRows)
        throw new Error("Palvelin palautti virheellisiä luettelotietoja.");
      setRows(parsedRows);

      if (parsedCategories) {
        setCategories(parsedCategories);
        setFoodTypeId((current) => current ?? parsedCategories[0]?.id ?? null);
      }
      setStatus("ready");
    } catch (reason: unknown) {
      if (requestId !== loadSequence.current) return;
      setError(getApiErrorMessage(reason, "Luetteloa ei voitu ladata."));
      setStatus(isPermissionDeniedError(reason) ? "forbidden" : "error");
    }
  }, [config.endpoint, config.validator, kind]);

  useEffect(() => {
    const requestId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(requestId);
  }, [load]);

  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fi-FI");
    if (!normalized) return rows;
    return rows.filter(
      (row) =>
        row.name.toLocaleLowerCase("fi-FI").includes(normalized) ||
        row.remark.toLocaleLowerCase("fi-FI").includes(normalized) ||
        (hasCategory(row) &&
          row.FoodType.name.toLocaleLowerCase("fi-FI").includes(normalized)),
    );
  }, [query, rows]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setRemark("");
    setMoneyAdded("0");
    setFoodTypeId(categories[0]?.id ?? null);
    setFormError("");
    setEditorOpen(true);
  };

  const openEdit = (row: ManagementRow) => {
    setEditing(row);
    setName(row.name);
    setRemark(row.remark);
    setMoneyAdded("moneyAdded" in row ? String(row.moneyAdded) : "0");
    setFoodTypeId(hasCategory(row) ? row.foodTypeId : null);
    setFormError("");
    setEditorOpen(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedRemark = remark.trim();
    const amount = Number(moneyAdded);
    if (!normalizedName) {
      setFormError("Nimi on pakollinen.");
      return;
    }
    if (kind !== "categories" && !foodTypeId) {
      setFormError("Kategoria on pakollinen.");
      return;
    }
    if (kind === "size-options" && (!Number.isInteger(amount) || amount < 0)) {
      setFormError("Hinnanlisän on oltava kokonainen, vähintään 0.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      const payload = {
        name: normalizedName,
        remark: normalizedRemark,
        ...(kind !== "categories" ? { foodTypeId } : {}),
        ...(kind === "size-options" ? { moneyAdded: amount } : {}),
      };
      if (editing)
        await api.put(config.updateEndpoint, { ...payload, id: editing.id });
      else await api.post(config.createEndpoint, payload);
      invalidateCatalogCache();
      await load();
      setEditorOpen(false);
      toast.success(`${config.title}: tallennus onnistui.`);
    } catch (reason: unknown) {
      setFormError(getApiErrorMessage(reason, "Tallennus epäonnistui."));
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await api.delete(`${config.removeEndpoint}/${pendingDelete.id}`);
      invalidateCatalogCache();
      await load();
      setPendingDelete(null);
      toast.success(`${config.title}: poisto onnistui.`);
    } catch (reason: unknown) {
      toast.error(getApiErrorMessage(reason, "Poisto epäonnistui."));
    } finally {
      setIsDeleting(false);
    }
  };

  const requiresCategory = kind !== "categories";
  const createDisabled = requiresCategory && categories.length === 0;

  return (
    <div className="tw04-layout space-y-6 font-sans xl:-mt-5 xl:pl-[26px]">
      <CatalogNavigation active={kind} />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-9 font-semibold text-foreground">
            {config.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {config.description}
          </p>
        </div>
        <Button onClick={openCreate} disabled={createDisabled}>
          <Plus aria-hidden="true" /> Lisää {config.singular}
        </Button>
      </header>

      <Input
        aria-label={`Hae: ${config.title}`}
        className="max-w-md"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Hae nimellä tai huomautuksella"
      />

      {createDisabled && status === "ready" && (
        <p role="note" className="text-sm text-destructive">
          Luo aktiivinen kategoria ennen tämän tiedon lisäämistä.
        </p>
      )}

      {status === "loading" ? (
        <LoadingState title="Luetteloa ladataan" />
      ) : status === "forbidden" ? (
        <ErrorState
          title="Ei käyttöoikeutta"
          description="Sinulla ei ole oikeutta hallita tätä luetteloa."
        />
      ) : status === "error" ? (
        <ErrorState
          title="Luetteloa ei voitu ladata"
          description={error}
          action={<Button onClick={() => void load()}>Yritä uudelleen</Button>}
        />
      ) : visibleRows.length === 0 ? (
        <EmptyState
          title={query ? "Ei hakutuloksia" : `${config.title} on tyhjä`}
          description={
            query
              ? "Muuta hakua ja yritä uudelleen."
              : "Lisää ensimmäinen tieto yllä olevasta painikkeesta."
          }
        />
      ) : (
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              {requiresCategory && <TableHead>Kategoria</TableHead>}
              <TableHead>Nimi</TableHead>
              {kind === "size-options" && (
                <TableHead className="text-right">Hinnanlisä</TableHead>
              )}
              <TableHead>Huomautus</TableHead>
              <TableHead className="text-right">Toiminnot</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={row.id}>
                {requiresCategory && (
                  <TableCell>
                    {hasCategory(row) ? row.FoodType.name : "—"}
                  </TableCell>
                )}
                <TableCell className="font-medium">{row.name}</TableCell>
                {kind === "size-options" && (
                  <TableCell className="text-right">
                    {currencyFormatter.format(
                      "moneyAdded" in row ? row.moneyAdded : 0,
                    )}
                  </TableCell>
                )}
                <TableCell className="max-w-80 truncate text-muted-foreground">
                  {row.remark || "—"}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(row)}
                      aria-label={`Muokkaa ${row.name}`}
                    >
                      <Pencil aria-hidden="true" /> Muokkaa
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setPendingDelete(row)}
                      aria-label={`Poista ${row.name}`}
                    >
                      <Trash2 aria-hidden="true" className="text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => !isSaving && setEditorOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Muokkaa" : "Lisää"} {config.singular}
            </DialogTitle>
            <DialogDescription>
              Täytä tiedot ja tallenna muutokset.
            </DialogDescription>
          </DialogHeader>
          <form id={`${kind}-form`} className="grid gap-4" onSubmit={save}>
            {requiresCategory && (
              <FormField id={`${kind}-category`} label="Kategoria" required>
                <select
                  className="h-10 w-full rounded-md border border-border bg-surface px-3"
                  value={foodTypeId ?? ""}
                  onChange={(event) =>
                    setFoodTypeId(Number(event.target.value))
                  }
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            <FormField
              id={`${kind}-name`}
              label="Nimi"
              required
              error={formError && !name.trim() ? formError : undefined}
            >
              <Input
                value={name}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
              />
            </FormField>
            {kind === "size-options" && (
              <FormField id="size-money-added" label="Hinnanlisä" required>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={moneyAdded}
                  onChange={(event) => setMoneyAdded(event.target.value)}
                />
              </FormField>
            )}
            <FormField id={`${kind}-remark`} label="Huomautus">
              <Input
                value={remark}
                maxLength={500}
                onChange={(event) => setRemark(event.target.value)}
              />
            </FormField>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
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
            <Button type="submit" form={`${kind}-form`} disabled={isSaving}>
              {isSaving ? "Tallennetaan…" : "Tallenna"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && !isDeleting && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Poistetaanko {config.singular}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${pendingDelete.name} poistetaan. Toimintoa ei voi perua.`
                : "Tieto poistetaan."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Peruuta</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void remove();
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
