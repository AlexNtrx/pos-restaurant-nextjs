import Link from "next/link";
import { ClipboardList, Plus, ReceiptText } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const operationalMetrics = [
  "Avoimet tilaukset",
  "Keittiöjonossa",
  "Valmiina",
  "Avoimet pöydät",
] as const;

const quickActions = [
  {
    href: "/backoffice/orders/new",
    label: "Uusi tilaus",
    description: "Aloita tilaus kassalla",
    icon: Plus,
  },
  {
    href: "/backoffice/orders/history",
    label: "Kuittihistoria",
    description: "Tarkastele valmiita myyntejä",
    icon: ReceiptText,
  },
  {
    href: "/backoffice/catalog/menu-items",
    label: "Ruokalista",
    description: "Tarkastele ruokalistan tuotteita",
    icon: ClipboardList,
  },
] as const;

export default function Dashboard() {
  return (
    <div className="tw04-layout space-y-8 font-sans">
      <PageHeader
        title="Tänään"
        description="Tilausten ajantasainen operatiivinen tilanne"
      />

      <section
        aria-label="Operatiiviset tunnusluvut"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {operationalMetrics.map((title) => (
          <OperationalMetric key={title} title={title} />
        ))}
      </section>

      <section className="grid items-stretch gap-[20px] lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,1fr)]">
        <Card className="min-h-[348px] gap-0 py-0 shadow-none">
          <CardHeader className="flex min-h-[70px] flex-row items-center justify-between px-5 py-4 sm:px-6">
            <CardTitle className="font-sans text-xl">
              Viimeisimmät tilaukset
            </CardTitle>
            <Link
              href="/backoffice/orders/history"
              className="text-[13px] font-medium text-olive underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Näytä kaikki →
            </Link>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table className="min-w-[680px] text-[13px] lg:min-w-0">
              <TableHeader className="bg-transparent">
                <TableRow className="h-11 hover:bg-transparent">
                  <TableHead className="pl-6">Tilaus</TableHead>
                  <TableHead>Tilauskanava</TableHead>
                  <TableHead>Pöytä</TableHead>
                  <TableHead>Yhteensä</TableHead>
                  <TableHead className="pr-6">Tila</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="h-[214px] px-6 text-center">
                    <p className="font-medium text-foreground">
                      Tilaustietoja ei ole saatavilla
                    </p>
                    <p className="mx-auto mt-1 max-w-md whitespace-normal text-xs leading-5 text-muted-foreground">
                      Nykyinen API ei vielä tarjoa tilauskanavaa, pöytää tai
                      tilauksen elinkaaritilaa tähän näkymään.
                    </p>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="min-h-[348px] gap-0 py-0 shadow-none">
          <CardHeader className="min-h-[70px] px-5 py-4 sm:px-6">
            <CardTitle className="font-sans text-xl">Pikatoiminnot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 px-4 pb-5 sm:px-5">
            {quickActions.map(({ href, label, description, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="grid min-h-[76px] grid-cols-[42px_minmax(0,1fr)] items-center gap-4 rounded-lg px-1 py-2 outline-none transition-colors hover:bg-muted/55 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-[42px] items-center justify-center rounded-lg bg-muted text-olive">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium text-foreground">
                    {label}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {description}
                  </span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>

      <p className="text-xs leading-5 text-muted-foreground" role="note">
        Operatiiviset luvut ja viimeisimmät tilaukset tulevat näkyviin, kun
        shared Order-, Kitchen- ja RestaurantTable-rajapinnat ovat käytössä.
      </p>
    </div>
  );
}

function OperationalMetric({ title }: { title: string }) {
  return (
    <Card size="sm" className="h-[126px] gap-2 py-4 shadow-none">
      <CardHeader className="px-4">
        <CardTitle className="font-sans text-[13px] font-normal text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <p
          className="text-[27px] leading-8 font-semibold"
          aria-label="Ei saatavilla"
        >
          —
        </p>
        <p className="mt-2 text-xs text-muted-foreground">Ei saatavilla</p>
      </CardContent>
    </Card>
  );
}
