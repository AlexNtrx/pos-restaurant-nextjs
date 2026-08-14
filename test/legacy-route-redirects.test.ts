import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect }));

import LegacyFoodPaginatePage from "@/app/backoffice/food-paginate/page";
import LegacyMonthlySalesPage from "@/app/backoffice/monthlysales/page";
import LegacySalesReportPage from "@/app/backoffice/salereport/page";

describe("legacy backoffice route compatibility", () => {
  beforeEach(() => redirect.mockClear());

  it.each([
    [LegacyFoodPaginatePage, "/backoffice/catalog/menu-items"],
    [LegacyMonthlySalesPage, "/backoffice/reports/monthly-sales"],
    [LegacySalesReportPage, "/backoffice/orders/history"],
  ])("redirects to the migrated route", (LegacyPage, target) => {
    LegacyPage();
    expect(redirect).toHaveBeenCalledWith(target);
  });
});
