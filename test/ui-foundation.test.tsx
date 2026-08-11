import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Home } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NavItem } from "@/components/ui/nav-item";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
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

vi.mock("next/link", () => ({
  default: ({ href, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props} />
  ),
}));

afterEach(cleanup);

describe("TW-02 shared UI foundation", () => {
  it("supports keyboard focus and disabled controls", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Button>Jatka</Button>
        <Button disabled>Ei käytössä</Button>
        <Input aria-label="Nimi" disabled />
      </div>,
    );

    await user.tab();

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Jatka" }),
    );
    expect(screen.getByRole("button", { name: "Ei käytössä" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("textbox", { name: "Nimi" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("connects labels, help text, and validation errors", () => {
    render(
      <FormField
        id="table-name"
        label="Pöydän nimi"
        description="Näkyy asiakkaalle"
        error="Nimi vaaditaan"
        required
      >
        <Input />
      </FormField>,
    );

    const input = screen.getByLabelText(/Pöydän nimi/);
    expect(input.getAttribute("id")).toBe("table-name");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(
      "table-name-error",
    );
    expect(screen.getByRole("alert").textContent).toBe("Nimi vaaditaan");
  });

  it("renders the shared control and content primitives", () => {
    render(
      <>
        <Select>
          <SelectTrigger aria-label="Tila">
            <SelectValue placeholder="Valitse" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Avoin</SelectItem>
          </SelectContent>
        </Select>
        <Badge>Uusi</Badge>
        <StatusBadge tone="warning">Odottaa</StatusBadge>
        <Card>
          <CardTitle>Kortti</CardTitle>
          <CardContent>Sisältö</CardContent>
        </Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nimi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Esimerkki</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </>,
    );

    expect(screen.getByRole("combobox", { name: "Tila" })).toBeTruthy();
    expect(screen.getByText("Odottaa").textContent).toBe("Odottaa");
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("renders responsive page and navigation building blocks", () => {
    render(
      <>
        <PageHeader
          eyebrow="Ravintola"
          title="Tilaukset"
          description="Seuraa salin tilannetta"
          actions={<Button>Uusi tilaus</Button>}
        />
        <NavItem href="/backoffice" active icon={<Home />}>
          Etusivu
        </NavItem>
      </>,
    );

    expect(
      screen.getByRole("heading", { name: "Tilaukset", level: 1 }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Etusivu" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Etusivu" }).getAttribute("href"),
    ).toBe("/backoffice");
  });

  it("exposes accessible dialog, alert dialog, and sheet semantics", () => {
    const onDialogOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onDialogOpenChange}>
        <DialogContent>
          <DialogTitle>Edit table</DialogTitle>
          <DialogDescription>Update table details.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Edit table" });
    expect(dialog).toBeTruthy();
    fireEvent.keyDown(dialog, {
      key: "Escape",
    });
    expect(onDialogOpenChange).toHaveBeenCalledWith(false);

    cleanup();
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Delete table?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    );
    expect(
      screen.getByRole("alertdialog", { name: "Delete table?" }),
    ).toBeTruthy();

    cleanup();
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Choose a view.</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole("dialog", { name: "Navigation" })).toBeTruthy();
  });

  it("announces empty, loading, and error states", () => {
    render(
      <>
        <EmptyState title="Ei tilauksia" />
        <LoadingState />
        <ErrorState description="Yritä uudelleen." />
      </>,
    );

    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.getByRole("alert").textContent).toContain(
      "Jotain meni pieleen",
    );
  });
});
