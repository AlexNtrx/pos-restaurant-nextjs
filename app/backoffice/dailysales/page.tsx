import { DailySalesReportPage } from "../reports/_components/daily-sales-report-page";

// EN: Keep the legacy URL on the same verified report UI while external bookmarks remain in use.
// FI: Säilytä vanha URL samassa varmennetussa raporttinäkymässä niin kauan kuin ulkoisia kirjanmerkkejä käytetään.
export default function DailySalesCompatibilityRoute() {
  return <DailySalesReportPage />;
}
