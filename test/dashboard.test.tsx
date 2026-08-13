import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import Dashboard from "@/app/backoffice/dashboard/page";

afterEach(cleanup);

describe("TW-04 Yhteenveto information model", () => {
  it("shows only supported operational labels without inventing values", () => {
    render(<Dashboard />);

    const metrics = screen.getByRole("region", {
      name: "Operatiiviset tunnusluvut",
    });

    for (const label of [
      "Avoimet tilaukset",
      "Keittiöjonossa",
      "Valmiina",
      "Avoimet pöydät",
    ]) {
      expect(within(metrics).getByText(label)).toBeTruthy();
    }

    expect(within(metrics).getAllByLabelText("Ei saatavilla")).toHaveLength(4);
    expect(screen.queryByText("Kuukauden myynti")).toBeNull();
    expect(screen.queryByText("Vuoden myynti")).toBeNull();
  });

  it("keeps channel, table, total, and lifecycle status as separate columns", () => {
    render(<Dashboard />);

    const table = screen.getByRole("table");
    expect(within(table).getByText("Tilaus")).toBeTruthy();
    expect(within(table).getByText("Tilauskanava")).toBeTruthy();
    expect(within(table).getByText("Pöytä")).toBeTruthy();
    expect(within(table).getByText("Yhteensä")).toBeTruthy();
    expect(within(table).getByText("Tila")).toBeTruthy();
    expect(
      within(table).getByText("Tilaustietoja ei ole saatavilla"),
    ).toBeTruthy();
    expect(screen.queryByText("Maksettu")).toBeNull();
    expect(screen.queryByText(/QR •/)).toBeNull();
  });
});
