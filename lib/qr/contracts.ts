export type QrMode = "CLOSED" | "MENU_ONLY" | "ORDERING";
export type QrContext = {
  state: QrMode;
  tableNo: number;
  restaurantName: string;
};
export type QrFood = {
  id: number;
  name: string;
  remark: string;
  price: number;
  img: string;
  detailImg?: string;
  foodTypeId: number;
};
export type QrCategory = {
  id: number;
  name: string;
  food: QrFood[];
  foodSizes: { id: number; name: string; moneyAdded: number }[];
  tastes: { id: number; name: string }[];
};
export type QrMenu = {
  state: "MENU_ONLY" | "ORDERING";
  tableNo: number;
  categories: QrCategory[];
};
export type QrCartItem = {
  foodId: number;
  foodSizeId: number | null;
  tasteId: number | null;
  quantity: number;
  note: string;
};
export type QrOrder = {
  id: number;
  status: string;
  tableNo: number;
  total: number;
  submittedAt: string;
  items: {
    name: string;
    quantity: number;
    note: string | null;
    lineTotal: number;
    modifiers: { type: string; name: string }[];
  }[];
  history: { status: string; at: string }[];
};
export type QrPending = {
  idempotencyKey: string;
  expectedTotal: number;
  items: QrCartItem[];
};
