"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

// EN: Section — Item note and quantity controls.
// FI: Osio — Tuotteen huomautus- ja määräsäätimet.
// EN: Leave room for the fixed cart action when scrolling a focused note into view.
// FI: Jätä tilaa kiinteälle ostoskoripainikkeelle, kun kohdistettu huomautus vieritetään näkyviin.

export function QrItemNote({
  id,
  foodName,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  foodName: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  // EN: Collapsing changes visibility only; the note draft stays in the parent state.
  // FI: Sulkeminen muuttaa vain näkyvyyttä; huomautusluonnos säilyy ylemmän komponentin tilassa.
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 w-full justify-between whitespace-normal px-0 text-left"
        aria-label={`Huomautus keittiölle: ${foodName}`}
        aria-expanded={expanded}
        aria-controls={`${id}-content`}
        disabled={disabled}
        onClick={() => setExpanded((current) => !current)}
      >
        <span>
          Huomautus keittiölle{" "}
          <span className="font-normal">(valinnainen)</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={expanded ? "rotate-180" : ""}
        />
      </Button>
      {!expanded && value.trim() && (
        <p className="line-clamp-2 whitespace-pre-wrap break-words text-xs text-olive">
          {value}
        </p>
      )}
      <div id={`${id}-content`} hidden={!expanded}>
        <label htmlFor={id} className="sr-only">
          Huomautus keittiölle
        </label>
        <p id={`${id}-help`} className="mt-1 text-xs text-muted-foreground">
          Kerro, mitä ainesosia et halua annokseen.
        </p>
        <textarea
          id={id}
          aria-label={`Huomautus keittiölle: ${foodName}`}
          aria-describedby={`${id}-help`}
          maxLength={500}
          rows={2}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onFocus={(event) =>
            event.currentTarget.scrollIntoView?.({ block: "nearest" })
          }
          className="mt-2 block min-h-20 w-full scroll-mb-28 resize-y rounded-md border border-border bg-surface p-3 text-sm disabled:opacity-50"
          placeholder="Esim. ilman sipulia tai chiliä"
        />
      </div>
    </div>
  );
}

export function QrQuantityControl({
  quantity,
  selectionName,
  disabled,
  limitReached,
  onChange,
}: {
  quantity: number;
  selectionName: string;
  disabled: boolean;
  limitReached: boolean;
  onChange: (delta: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className="size-11"
        aria-label={`Vähennä ${selectionName}`}
        disabled={disabled || quantity === 0}
        onClick={() => onChange(-1)}
      >
        −
      </Button>
      <span className="min-w-5 text-center text-sm" aria-live="polite">
        {quantity}
      </span>
      <Button
        variant="secondary"
        size="icon"
        className="size-11"
        aria-label={`Lisää ${selectionName}`}
        disabled={disabled || limitReached}
        onClick={() => onChange(1)}
      >
        +
      </Button>
    </div>
  );
}
