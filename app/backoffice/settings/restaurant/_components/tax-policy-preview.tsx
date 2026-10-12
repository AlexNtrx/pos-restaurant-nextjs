import { type SellerSnapshot } from "../_lib/tax-policy";
import { type TaxDraft } from "../_lib/tax-draft";
const statuses = {
  UNCONFIRMED: "Ei vahvistettu",
  REGISTERED: "ALV-rekisteröity (ehdotus)",
  NOT_REGISTERED: "Ei ALV-rekisterissä (ehdotus)",
};
export function TaxPolicyPreview({
  configuration: d,
  seller,
}: {
  configuration: TaxDraft;
  seller: SellerSnapshot | null;
}) {
  const rate = (bps: number | null) =>
    bps === null ? "Ei asetettu" : `${bps / 100} %`;
  const fields = [
    ["Maa", d.countryCode === "FI" ? "Suomi" : "Ei valittu"],
    ["ALV-rekisteröinti", statuses[d.vatStatus]],
    ["Hinnoittelu", "Lopulliset hinnat"],
    ["Ruoka ja alkoholittomat juomat", rate(d.rates.FOOD_NON_ALCOHOLIC)],
    ["Alkoholi", rate(d.rates.ALCOHOL)],
    ["Toivottu päivämäärä (ei käyttöönotto)", d.requestedEffectiveDate],
    ["Tarkistajan nimi (ehdotus)", d.reviewerName],
    ["Rekisteröimättömyyden peruste", d.nonRegistrationReason],
    ...(seller
      ? [
          ["Myyjä", seller.name],
          ["Osoite", seller.address],
          ["Puhelin", seller.phone],
          ["Sähköposti", seller.email],
          ["Verkkosivu", seller.website],
          ["Pankkitili", seller.bankNo],
          ["Y-tunnus", seller.taxCode],
        ]
      : []),
  ];
  return (
    <dl className="grid min-w-0 grid-cols-1 gap-3 text-sm md:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-words [overflow-wrap:anywhere]">
            {value || "Ei asetettu"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
