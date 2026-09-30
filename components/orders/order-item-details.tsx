import type { StaffOrder } from "@/app/backoffice/orders/inbox/_lib/staff-orders";

// EN: Display stored Order snapshots without recalculating prices or looking up catalog names.
// FI: Näytä tallennetut tilauksen tiedot laskematta hintoja uudelleen tai hakematta nimiä luettelosta.
export function OrderItemDetails({
  items,
  currency,
}: {
  items: StaffOrder["items"];
  currency: Intl.NumberFormat;
}) {
  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={index} className="border-b border-border pb-3 text-sm">
          <div className="flex justify-between gap-2 font-medium">
            <span>
              {item.quantity} × {item.name}
            </span>
            <span>{currency.format(item.lineTotal)}</span>
          </div>
          {item.modifiers.map((modifier, modifierIndex) => (
            <p key={modifierIndex} className="text-xs text-muted-foreground">
              {modifier.name} ({currency.format(modifier.priceAdjustment)})
            </p>
          ))}
          {item.note && <p className="text-xs">Huom: {item.note}</p>}
        </li>
      ))}
    </ul>
  );
}
