import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

function NavItem({
  className,
  active = false,
  disabled = false,
  href,
  icon,
  children,
  onClick,
  tabIndex,
  ...props
}: React.ComponentProps<"a"> & {
  active?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  const content = (
    <>
      {icon && (
        <span
          data-slot="nav-item-icon"
          aria-hidden="true"
          className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4"
        >
          {icon}
        </span>
      )}
      <span className="truncate">{children}</span>
    </>
  );
  const linkProps = {
    "data-slot": "nav-item",
    "data-active": active,
    "data-disabled": disabled,
    "aria-current": active ? ("page" as const) : undefined,
    "aria-disabled": disabled || undefined,
    tabIndex: disabled ? -1 : tabIndex,
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (disabled) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
    },
    className: cn(
      "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 font-sans text-sm font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[disabled=true]:cursor-default data-[disabled=true]:hover:bg-transparent data-[disabled=true]:hover:text-current",
      className,
    ),
    ...props,
  };

  if (disabled || !href) {
    return (
      <a {...linkProps} href={undefined}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} {...linkProps}>
      {content}
    </Link>
  );
}

export { NavItem };
