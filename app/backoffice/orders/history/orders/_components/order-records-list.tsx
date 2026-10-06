import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StaffOrder } from "@/lib/orders/contracts";
import {
  currency,
  formatTime,
  statusLabels,
  orderStatusTone,
} from "../_lib/presentation";

export function OrderRecordsList({
  visibleOrders,
  openDetail,
}: {
  visibleOrders: StaffOrder[];
  openDetail: (id: number) => Promise<void>;
}) {
  return (
    <Table className="min-w-[760px] text-[13px]">
      <TableHeader className="bg-[#efece6]">
        <TableRow>
          <TableHead>Tilaus</TableHead>
          <TableHead>Kanava</TableHead>
          <TableHead>Pöytä / istunto</TableHead>
          <TableHead>Summa</TableHead>
          <TableHead>Tila</TableHead>
          <TableHead className="text-right">Toiminto</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visibleOrders.map((order) => (
          <TableRow key={order.id}>
            <TableCell className="font-medium">
              #{order.id} · {formatTime(order.submittedAt)}
            </TableCell>
            <TableCell>
              {order.channel === "QR"
                ? "QR"
                : order.channel === "STAFF"
                  ? "Tarjoilija"
                  : order.serviceType === "TAKEAWAY"
                    ? "Mukaan"
                    : "Kassa"}
            </TableCell>
            <TableCell>
              {order.serviceType === "TAKEAWAY"
                ? `Nouto #${order.id}`
                : `${order.tableNo}${order.tableSessionId ? ` / #${order.tableSessionId}` : ""}`}
            </TableCell>
            <TableCell>{currency.format(order.total)}</TableCell>
            <TableCell>
              <StatusBadge tone={orderStatusTone(order.status)}>
                {statusLabels[order.status]}
              </StatusBadge>
            </TableCell>
            <TableCell className="text-right">
              <Button size="sm" onClick={() => void openDetail(order.id)}>
                Avaa
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
