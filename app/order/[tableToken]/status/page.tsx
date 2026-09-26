import { Suspense } from "react";
import QrCustomer from "../_components/qr-customer";

export default function QrStatusPage() {
  return (
    <Suspense fallback={<p>Ladataan tilausta…</p>}>
      <QrCustomer view="status" />
    </Suspense>
  );
}
