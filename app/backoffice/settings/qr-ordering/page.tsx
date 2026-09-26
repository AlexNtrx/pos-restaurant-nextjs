import { redirect } from "next/navigation";

// EN: Keep Plan 0's approved URL while QR-01 manages the mode beside its table sessions.
// FI: Säilytä Plan 0:n hyväksytty osoite, vaikka QR-01 hallitsee tilaa pöytäistuntojen rinnalla.
export default function QrOrderingSettingsPage() {
  redirect("/backoffice/settings/tables#qr-mode");
}
