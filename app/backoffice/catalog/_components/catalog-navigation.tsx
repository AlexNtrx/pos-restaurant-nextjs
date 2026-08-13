"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export type CatalogSection =
  "menu-items" | "categories" | "size-options" | "modifiers";

const catalogSections = [
  ["menu-items", "Ruokalista"],
  ["categories", "Kategoriat"],
  ["size-options", "Kokovaihtoehdot"],
  ["modifiers", "Lisävalinnat"],
] as const;

export function CatalogNavigation({ active }: { active: CatalogSection }) {
  const navigationRef = useRef<HTMLElement>(null);
  const activeItemRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const navigation = navigationRef.current;
    const activeItem = activeItemRef.current;

    if (!navigation || !activeItem) return;

    const left =
      activeItem.offsetLeft -
      Math.max(0, (navigation.clientWidth - activeItem.offsetWidth) / 2);

    navigation.scrollTo?.({ left: Math.max(0, left) });
  }, [active]);

  return (
    <nav
      ref={navigationRef}
      aria-label="Ruokalistan luettelot"
      className="catalog-navigation flex gap-[18px] overflow-x-auto overflow-y-hidden border-b border-transparent md:gap-[34px] md:pr-1 xl:gap-7"
    >
      {catalogSections.map(([id, label]) => {
        const isActive = id === active;
        const content = (
          <span
            className={
              isActive
                ? "block border-b-2 border-[#455c2b] pb-[9px] text-foreground xl:pb-2"
                : "block pb-[11px] text-[#636657] xl:pb-2.5"
            }
          >
            {label}
          </span>
        );

        return isActive ? (
          <h1
            key={id}
            ref={activeItemRef}
            aria-current="page"
            className="m-0! shrink-0 text-[13px]! leading-5! font-semibold! md:text-sm! xl:text-[20px]! xl:leading-[26px]! xl:tracking-[-0.1px]"
          >
            {content}
          </h1>
        ) : (
          <Link
            key={id}
            href={`/backoffice/catalog/${id}`}
            className="shrink-0 text-[13px]! leading-5! font-medium text-[#636657]! no-underline! hover:text-[#455c2b]! focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:text-sm! xl:text-[20px]! xl:leading-[26px]! xl:font-semibold xl:tracking-[-0.1px]"
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
