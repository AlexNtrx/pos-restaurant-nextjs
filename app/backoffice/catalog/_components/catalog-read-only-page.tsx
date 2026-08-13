"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { getApiErrorMessage, isPermissionDeniedError } from "@/lib/api-error";
import {
  isFood,
  isFoodCategory,
  isFoodSize,
  isTaste,
  parseResults,
  type Food,
  type FoodCategory,
  type FoodSize,
  type Taste,
} from "@/lib/catalog-contracts";

import { CatalogNavigation, type CatalogSection } from "./catalog-navigation";

type CatalogKind = CatalogSection;
type CatalogRow = Food | FoodCategory | FoodSize | Taste;

const currencyFormatter = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});

const copy = {
  "menu-items": {
    title: "Valikko",
    description: "Ruokalajit, kategoriat ja hinnat.",
    empty: "Ruokalajeja ei löytynyt",
    endpoint: "/food/list",
    validator: isFood,
  },
  categories: {
    title: "Kategoriat",
    description: "Ruokalistan aktiiviset kategoriat.",
    empty: "Kategorioita ei löytynyt",
    endpoint: "/foodType/list",
    validator: isFoodCategory,
  },
  "size-options": {
    title: "Kokovaihtoehdot",
    description: "Koot ja niihin liittyvät hinnanlisät.",
    empty: "Kokovaihtoehtoja ei löytynyt",
    endpoint: "/foodSize/list",
    validator: isFoodSize,
  },
  modifiers: {
    title: "Lisävalinnat",
    description: "Kategorioihin liitetyt maku- ja lisävalinnat.",
    empty: "Lisävalintoja ei löytynyt",
    endpoint: "/taste/list",
    validator: isTaste,
  },
} satisfies Record<CatalogKind, object>;

function rowCategory(row: CatalogRow) {
  return "FoodType" in row ? row.FoodType.name : "—";
}

function CatalogTable({
  kind,
  rows,
}: {
  kind: CatalogKind;
  rows: CatalogRow[];
}) {
  return (
    <Table className="min-w-[720px] text-[13px]">
      <TableHeader className="bg-[#efece6] text-muted-foreground">
        <TableRow className="h-12 hover:bg-transparent">
          <TableHead>{kind === "menu-items" ? "Tuote" : "Nimi"}</TableHead>
          {kind !== "categories" && <TableHead>Kategoria</TableHead>}
          {kind === "menu-items" && <TableHead>Tyyppi</TableHead>}
          {kind === "menu-items" && <TableHead>Hinta</TableHead>}
          {kind === "size-options" && <TableHead>Hinnanlisä</TableHead>}
          <TableHead>Huomautus</TableHead>
          <TableHead>Tila</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} className="h-14 bg-surface">
            <TableCell className="font-medium text-foreground">
              {row.name}
            </TableCell>
            {kind !== "categories" && (
              <TableCell className="text-muted-foreground">
                {rowCategory(row)}
              </TableCell>
            )}
            {kind === "menu-items" && (
              <TableCell className="text-muted-foreground">
                {(row as Food).foodType === "food" ? "Ruoka" : "Juoma"}
              </TableCell>
            )}
            {kind === "menu-items" && (
              <TableCell className="font-medium">
                {currencyFormatter.format((row as Food).price)}
              </TableCell>
            )}
            {kind === "size-options" && (
              <TableCell className="font-medium">
                {currencyFormatter.format((row as FoodSize).moneyAdded)}
              </TableCell>
            )}
            <TableCell className="max-w-64 truncate text-muted-foreground">
              {row.remark || "—"}
            </TableCell>
            <TableCell>
              <StatusBadge
                tone="success"
                className="h-10 border-0 bg-[#e8efe6] px-3 font-medium text-[#5f765b]"
              >
                Myynnissä
              </StatusBadge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function CatalogReadOnlyPage({ kind }: { kind: CatalogKind }) {
  const config = copy[kind];
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [foodKind, setFoodKind] = useState("all");
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "forbidden"
  >("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const requests = [api.get(config.endpoint)];
      if (kind === "menu-items") requests.push(api.get("/foodType/list"));
      const [response, categoryResponse] = await Promise.all(requests);
      const parsed = parseResults(response.data, config.validator);
      if (!parsed)
        throw new Error("Palvelin palautti virheellisiä luettelotietoja.");
      setRows(parsed);
      if (categoryResponse) {
        const parsedCategories = parseResults(
          categoryResponse.data,
          isFoodCategory,
        );
        if (!parsedCategories)
          throw new Error("Palvelin palautti virheellisiä kategoriatietoja.");
        setCategories(parsedCategories);
      }
      setStatus("ready");
    } catch (reason: unknown) {
      setError(getApiErrorMessage(reason, "Luetteloa ei voitu ladata."));
      setStatus(isPermissionDeniedError(reason) ? "forbidden" : "error");
    }
  }, [config.endpoint, config.validator, kind]);

  useEffect(() => {
    const requestId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(requestId);
  }, [load]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fi-FI");
    return rows.filter((row) => {
      const matchesQuery =
        !normalizedQuery ||
        row.name.toLocaleLowerCase("fi-FI").includes(normalizedQuery) ||
        row.remark.toLocaleLowerCase("fi-FI").includes(normalizedQuery);
      if (kind !== "menu-items") return matchesQuery;
      const food = row as Food;
      return (
        matchesQuery &&
        (category === "all" || String(food.foodTypeId) === category) &&
        (foodKind === "all" || food.foodType === foodKind)
      );
    });
  }, [category, foodKind, kind, query, rows]);

  return (
    <div className="tw04-layout space-y-6 font-sans xl:-mt-5 xl:pl-[26px]">
      <CatalogNavigation active={kind} />

      <p className="m-0 text-sm leading-5 text-muted-foreground">
        {config.description}
      </p>

      <section
        aria-label="Luettelon suodattimet"
        className="grid gap-3 bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)]"
      >
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Hae luetteloa
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Haku"
          />
        </label>
        {kind === "menu-items" && (
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Kategoria
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Kaikki</SelectItem>
                {categories.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
        {kind === "menu-items" && (
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Tyyppi
            <Select value={foodKind} onValueChange={setFoodKind}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Kaikki</SelectItem>
                <SelectItem value="food">Ruoka</SelectItem>
                <SelectItem value="drink">Juoma</SelectItem>
              </SelectContent>
            </Select>
          </label>
        )}
      </section>

      {status === "loading" ? (
        <LoadingState title="Luetteloa ladataan" />
      ) : status === "forbidden" ? (
        <ErrorState
          title="Ei käyttöoikeutta"
          description="Sinulla ei ole oikeutta tarkastella tätä luetteloa."
        />
      ) : status === "error" ? (
        <ErrorState
          title="Luetteloa ei voitu ladata"
          description={error}
          action={<Button onClick={() => void load()}>Yritä uudelleen</Button>}
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          title={config.empty}
          description="Muuta hakua tai suodatusta ja yritä uudelleen."
        />
      ) : (
        <CatalogTable kind={kind} rows={filteredRows} />
      )}
    </div>
  );
}
