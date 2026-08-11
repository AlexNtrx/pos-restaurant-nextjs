import * as React from "react";

import { cn } from "@/lib/utils";

function PageHeader({
  className,
  eyebrow,
  title,
  description,
  actions,
  ...props
}: React.ComponentProps<"header"> & {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex min-h-[52px] flex-col gap-4 font-sans sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow && (
          <div className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[28px] leading-[34px] font-semibold text-foreground">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm leading-5 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}

export { PageHeader };
