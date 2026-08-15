import { redirect } from "next/navigation";

// EN: Preserves the legacy URL while the shared session boundary enforces access.
// FI: Säilyttää vanhan URL-osoitteen ja yhteinen istuntoraja valvoo käyttöoikeuden.
export default function LegacySalesReportPage() {
  redirect("/backoffice/orders/history");
}
