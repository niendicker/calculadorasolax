'use client';

import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DemoSimulationDefinition } from '@/lib/demo/types';

export function DemoPickerDialog({
  examples,
  unavailable,
  onSelect,
  onClose,
}: {
  examples: DemoSimulationDefinition[];
  unavailable: Set<string>;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="demo-picker-title">
      <div className="w-full max-w-lg rounded-xl border bg-background p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="demo-picker-title" className="text-lg font-semibold">Escolha um exemplo</h2>
            <p className="mt-1 text-sm text-muted-foreground">Veja diferentes formas de usar a calculadora.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {examples.map((example) => {
            const disabled = unavailable.has(example.id);
            return (
              <button
                key={example.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(example.id)}
                className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-medium text-foreground">{example.name}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{example.description}</span>
                  {disabled && <span className="mt-1 block text-xs text-destructive">Indisponível com os catálogos atuais.</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
