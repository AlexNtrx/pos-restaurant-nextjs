"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { QrMode } from "./types";

const modes: { value: QrMode; label: string; description: string }[] = [
  {
    value: "DISABLED",
    label: "Pois käytöstä",
    description: "QR-palvelu suljettu",
  },
  {
    value: "MENU_ONLY",
    label: "Vain ruokalista",
    description: "Sallii asiakkaan selata ruokalistaa",
  },
  {
    value: "ORDERING",
    label: "Tilaaminen",
    description: "Sallii asiakkaan lähettää tilauksen",
  },
];

const modeLabel = (mode: QrMode) =>
  modes.find((option) => option.value === mode)?.label ?? "Tuntematon";

type Props = {
  mode: QrMode;
  isAdmin: boolean;
  busy: boolean;
  onModeChange: (mode: QrMode) => void;
};

export function QrModePanel({ mode, isAdmin, busy, onModeChange }: Props) {
  return (
    <Card id="qr-mode" className="gap-0 py-0">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold">QR-tilaaminen</h2>
          <p className="text-sm text-muted-foreground">
            Nykyinen tila: {modeLabel(mode)}. Muutokset koskevat kaikkia avoimia
            istuntoja.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Jaa QR-koodi vasta, kun asiakasnäkymä, API ja QR-avain on otettu
            käyttöön.
          </p>
        </div>
        <StatusBadge tone={mode === "DISABLED" ? "neutral" : "success"}>
          {modeLabel(mode)}
        </StatusBadge>
      </CardContent>
      {isAdmin && (
        <CardContent
          className="grid gap-2 border-t border-border p-5 sm:grid-cols-3"
          role="group"
          aria-label="Valitse QR-tila"
        >
          {modes.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={mode === option.value ? "default" : "outline"}
              disabled={busy}
              aria-pressed={mode === option.value}
              onClick={() => onModeChange(option.value)}
              className="h-auto min-h-12 flex-col items-start gap-0.5 py-2 text-left"
            >
              <span>{option.label}</span>
              <span className="text-xs font-normal opacity-75">
                {option.description}
              </span>
            </Button>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
