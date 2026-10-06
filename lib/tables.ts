import api from "@/lib/api";

export type StaffTable = {
  id: number;
  tableNo: number;
  name: string | null;
  openSession: { id: number } | null;
};

export async function loadStaffTables(signal?: AbortSignal) {
  const { data } = await api.get<{ results: StaffTable[] }>("/tables", {
    signal,
  });
  if (!Array.isArray(data?.results))
    throw new Error("Palvelin palautti virheelliset pöytätiedot.");
  return data.results;
}
