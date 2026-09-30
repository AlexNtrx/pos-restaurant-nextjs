import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Circle } from "lucide-react";

import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex min-h-6 w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-sans text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border bg-secondary text-secondary-foreground",
        info: "border-olive/25 bg-olive/10 text-olive",
        success: "border-primary/30 bg-primary/15 text-foreground",
        warning: "border-action/35 bg-action/15 text-foreground",
        danger: "border-destructive/35 bg-destructive/12 text-destructive",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

function StatusBadge({
  className,
  tone = "neutral",
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof statusBadgeVariants>) {
  return (
    <span
      data-slot="status-badge"
      data-tone={tone}
      className={cn(statusBadgeVariants({ tone }), className)}
      {...props}
    >
      <Circle aria-hidden="true" className="size-2 fill-current" />
      {children}
    </span>
  );
}

export { StatusBadge };
