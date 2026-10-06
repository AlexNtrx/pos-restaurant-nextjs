export type QrMode = "DISABLED" | "MENU_ONLY" | "ORDERING";

export type OpenSession = {
  id: number;
  openedAt: string;
  qrTokenExpiresAt: string | null;
  tokenVersion: number;
};

export type RestaurantTable = {
  id: number;
  tableNo: number;
  name: string | null;
  openSession: OpenSession | null;
};

export type QrPreview = {
  tableNo: number;
  url: string;
  image: string;
  expiresAt: string;
};

export type Confirmation = {
  kind: "rotate" | "close" | "delete";
  table: RestaurantTable;
};

export type SettingsTab = "restaurant" | "tables" | "qr" | "staff";
