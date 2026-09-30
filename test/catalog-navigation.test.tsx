import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import {
  CatalogNavigation,
  type CatalogSection,
} from "@/app/backoffice/catalog/_components/catalog-navigation";

afterEach(cleanup);

const sections = [
  ["menu-items", "Ruokalista"],
  ["categories", "Kategoriat"],
  ["size-options", "Kokovaihtoehdot"],
  ["modifiers", "Lisävalinnat"],
] as const satisfies ReadonlyArray<readonly [CatalogSection, string]>;

describe("catalog navigation", () => {
  it.each(sections)("marks %s as the active section", (active, label) => {
    render(<CatalogNavigation active={active} />);

    const navigation = screen.getByRole("navigation", {
      name: "Ruokalistan luettelot",
    });
    const activeHeading = screen.getByRole("heading", {
      level: 1,
      name: label,
    });

    expect(navigation.contains(activeHeading)).toBe(true);
    expect(activeHeading.getAttribute("aria-current")).toBe("page");
    expect(activeHeading.querySelector("span")?.className).toContain(
      "border-b-2",
    );
    expect(activeHeading.querySelector("span")?.className).toContain(
      "border-[#455c2b]",
    );
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});
