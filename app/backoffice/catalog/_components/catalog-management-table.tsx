import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  hasCategory,
  type ManagementRow,
  type ManagementKind,
} from "./catalog-management-types";
const currencyFormatter = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});
export function CatalogManagementTable({
  kind,
  visibleRows,
  openEdit,
  setPendingDelete,
}: {
  kind: ManagementKind;
  visibleRows: ManagementRow[];
  openEdit: (row: ManagementRow) => void;
  setPendingDelete: (row: ManagementRow) => void;
}) {
  const requiresCategory = kind !== "categories";
  return (
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
  );
}
