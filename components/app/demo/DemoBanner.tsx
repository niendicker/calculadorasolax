'use client';

import { FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DemoBanner({ onExit, onConvert }: { onExit: () => void; onConvert: () => void }) {
  return (
    <div className="mt-4 mb-4 flex flex-col gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2 text-sm">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="font-semibold text-foreground">Exemplo demonstrativo</p>
          <p className="text-muted-foreground">Você está visualizando uma simulação preenchida com dados fictícios.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button variant="outline" size="sm" onClick={onExit}>Sair do exemplo</Button>
        <Button size="sm" onClick={onConvert}>Usar como nova simulação</Button>
      </div>
    </div>
  );
}
