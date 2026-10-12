import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CustomizationModal from "@/app/backoffice/sale/_components/customization-modal";

afterEach(cleanup);

describe("Counter immediate customization", () => {
  const onSelectTaste = vi.fn();
  const onSelectSize = vi.fn();
  const onCreateDetail = vi.fn();
  const onRemoveDetail = vi.fn();
  const onUnselectTaste = vi.fn();

  function Editor({ busy = false }: { busy?: boolean }) {
    const [open, setOpen] = useState(true);
    return (
      <CustomizationModal
        open={open}
        onOpenChange={setOpen}
        saleTempId={7}
        saleTempDetails={[
          {
            id: 11,
            saleTempId: 7,
            tasteId: null,
            foodSizeId: null,
            Food: { id: 1, name: "Test meal", img: "", price: 25 },
          },
        ]}
        tastes={[{ id: 3, name: "Spicy" }]}
        sizes={[{ id: 4, name: "Large", moneyAdded: 5 }]}
        customizationBusy={busy}
        checkoutBusy={false}
        onSelectTaste={onSelectTaste}
        onUnselectTaste={onUnselectTaste}
        onSelectSize={onSelectSize}
        onCreateDetail={onCreateDetail}
        onRemoveDetail={onRemoveDetail}
      />
    );
  }

  it("applies choices before Done and closes without a second mutation", async () => {
    vi.clearAllMocks();
    const user = userEvent.setup();
    render(<Editor />);
    expect(screen.getByText(/Sulkeminen ei peru niitä/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /^(Peruuta|Tallenna)$/ }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Spicy" }));
    await user.click(screen.getByRole("button", { name: "+5 Large" }));
    expect(onSelectTaste).toHaveBeenCalledWith(3, 11, 7);
    expect(onSelectSize).toHaveBeenCalledWith(4, 11, 7);
    await user.click(screen.getByRole("button", { name: "Valmis" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onSelectTaste).toHaveBeenCalledTimes(1);
    expect(onSelectSize).toHaveBeenCalledTimes(1);
    expect(onCreateDetail).not.toHaveBeenCalled();
    expect(onRemoveDetail).not.toHaveBeenCalled();
    expect(onUnselectTaste).not.toHaveBeenCalled();
  });

  it("supports Escape without a separate save step", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("blocks Done, Escape and option edits until the request settles", async () => {
    const user = userEvent.setup();
    const view = render(<Editor busy />);
    expect(
      (screen.getByRole("button", { name: "Valmis" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Spicy" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Valmis" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    view.rerender(<Editor />);
    await user.click(screen.getByRole("button", { name: "Valmis" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
