export type OrderStatus =
  | "SUBMITTED"
  | "CONFIRMED"
  | "REJECTED"
  | "PREPARING"
  | "READY"
  | "SERVED"
  | "PAID"
  | "COMPLETED"
  | "CANCELLED";

export type StaffOrder = {
  id: number;
  channel: "COUNTER" | "QR" | "STAFF";
  serviceType: "DINE_IN" | "TAKEAWAY";
  status: OrderStatus;
  version: number;
  tableNo: number | null;
  tableSessionId: number | null;
  total: number;
  submittedAt: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  paidAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  rejectionReason: string | null;
  cancellationReason: string | null;
  items: {
    name: string;
    quantity: number;
    note: string | null;
    lineTotal: number;
    modifiers: { type: string; name: string; priceAdjustment: number }[];
  }[];
};

export type StaffOrderDetail = StaffOrder & {
  history: {
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    version: number;
    reason: string | null;
    actorType: string;
    at: string;
  }[];
};
