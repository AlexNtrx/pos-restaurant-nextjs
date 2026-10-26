import type { ComponentProps } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = Omit<
  ComponentProps<typeof Button>,
  "variant" | "size" | "asChild"
>;

export function RefreshButton({
  children = "Päivitä",
  className,
  ...props
}: Props) {
  return (
    <Button
      type="button"
      {...props}
      variant="outline"
      size="sm"
      className={cn("max-sm:min-h-11 pointer-coarse:min-h-11", className)}
    >
      <RefreshCw aria-hidden="true" />
      {children}
    </Button>
  );
}
