import * as React from "react";

import { cn } from "@/lib/utils";

function FormField({
  id,
  label,
  description,
  error,
  required = false,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactElement<Record<string, unknown>>;
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy =
    [error ? undefined : descriptionId, errorId].filter(Boolean).join(" ") ||
    undefined;

  // EN: Keep the control, label, help text, and validation state connected for assistive technology.
  // FI: Pidä ohjain, nimike, ohjeteksti ja validointitila yhdistettyinä avustavaa teknologiaa varten.
  const control = React.cloneElement(children, {
    id,
    required,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  });

  return (
    <div
      data-slot="form-field"
      className={cn("space-y-1.5 font-sans", className)}
    >
      <label
        htmlFor={id}
        className="block text-sm font-semibold text-foreground"
      >
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-destructive">
            *
          </span>
        )}
      </label>
      {control}
      {description && !error && (
        <p
          id={descriptionId}
          className="text-xs leading-5 text-muted-foreground"
        >
          {description}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-xs leading-5 text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export { FormField };
