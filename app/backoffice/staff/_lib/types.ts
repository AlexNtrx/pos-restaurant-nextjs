import type { UserLevel } from "@/lib/access-control";
export const roleLabels: Record<UserLevel, string> = {
  admin: "Ylläpitäjä",
  kassa: "Kassatyöntekijä",
  waiter: "Tarjoilija",
  kitchen: "Keittiöhenkilökunta",
};
export type StaffUser = {
  id: number;
  name: string;
  username: string;
  level: UserLevel;
};
