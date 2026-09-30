import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ReceiptPreview from "@/app/backoffice/sale/_components/receipt-preview";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Finnish receipt preview", () => {
  it("reprints the displayed paid bill through the existing callback", async () => {
    const onReprint = vi.fn();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <ReceiptPreview
        billUrl="blob:paid"
        kind="paid"
        lastCompletedBillId={42}
        onReprint={onReprint}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTitle("Kuitin esikatselu").getAttribute("src")).toBe(
      "blob:paid#toolbar=0&navpanes=0&view=FitH",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tulosta kuitti uudelleen #42" }),
    );
    expect(onReprint).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Uusi tilaus" })).toBeTruthy();
  });

  it.each(["prebill", "paid"] as const)(
    "opens the original %s PDF for printing without changing its URL",
    async (kind) => {
      const open = vi.spyOn(window, "open").mockImplementation(() => null);
      render(
        <ReceiptPreview
          billUrl="blob:original"
          kind={kind}
          historical={kind === "paid"}
          lastCompletedBillId={null}
          onClose={vi.fn()}
        />,
      );
      expect(
        screen.getByTitle(
          kind === "paid" ? "Kuitin esikatselu" : "Esilaskun esikatselu",
        ),
      ).toBeTruthy();
      await userEvent.click(
        screen.getByRole("button", {
          name: kind === "paid" ? "Tulosta kuitti" : "Tulosta esilasku",
        }),
      );
      expect(open).toHaveBeenCalledWith(
        "blob:original",
        "_blank",
        "noopener,noreferrer",
      );
      expect(screen.queryByRole("button", { name: "Uusi tilaus" })).toBeNull();
    },
  );
});
