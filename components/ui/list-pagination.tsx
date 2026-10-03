"use client";

import { Button } from "@/components/ui/button";

export function ListPagination({
  label,
  total,
  page,
  pageSize,
  onPageChange,
}: {
  label: string;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  return (
    <nav
      aria-label={label}
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      <p
        aria-live="polite"
        aria-atomic="true"
        className="text-sm text-muted-foreground"
      >
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Edellinen
          </Button>
          <span className="text-sm">
            Sivu {page} / {pages}
          </span>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
          >
            Seuraava
          </Button>
        </div>
      )}
    </nav>
  );
}
