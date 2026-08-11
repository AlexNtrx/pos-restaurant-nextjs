import * as React from "react";
import { CircleAlert, Inbox, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

function StateMessage({
  className,
  icon,
  title,
  description,
  action,
  role = "status",
  live = "polite",
}: {
  className?: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  role?: "status" | "alert";
  live?: "polite" | "assertive";
}) {
  return (
    <div
      data-slot="state-message"
      role={role}
      aria-live={live}
      className={cn(
        "flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface p-6 text-center font-sans",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5"
      >
        {icon}
      </span>
      <div className="space-y-1">
        <h2 className="font-heading text-xl leading-tight font-semibold text-foreground">
          {title}
        </h2>
        {description && (
          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function EmptyState({
  icon = <Inbox />,
  title,
  ...props
}: Omit<React.ComponentProps<typeof StateMessage>, "icon"> & {
  icon?: React.ReactNode;
}) {
  return <StateMessage icon={icon} title={title} {...props} />;
}

function LoadingState({
  title = "Ladataan",
  description,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <StateMessage
      className={className}
      icon={<LoaderCircle className="animate-spin" />}
      title={title}
      description={description}
    />
  );
}

function ErrorState({
  title = "Jotain meni pieleen",
  className,
  ...props
}: Omit<
  React.ComponentProps<typeof StateMessage>,
  "icon" | "role" | "live" | "title"
> & { title?: React.ReactNode }) {
  return (
    <StateMessage
      icon={<CircleAlert />}
      title={title}
      role="alert"
      live="assertive"
      className={cn("border-destructive/35", className)}
      {...props}
    />
  );
}

export { EmptyState, ErrorState, LoadingState };
