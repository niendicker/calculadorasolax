'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Next.js wires this up automatically as a React error boundary around the
 * whole locale segment (which is effectively the entire app) — without it,
 * any uncaught render error blanks the page instead of showing this. Copy is
 * hardcoded in Portuguese rather than pulled from next-intl: the boundary
 * exists specifically to stay usable even when something upstream (like a
 * translation provider) is what broke. */
export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold text-foreground">Algo deu errado</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Ocorreu um erro inesperado. Você pode tentar novamente ou recarregar a página — nenhum dado salvo foi
          perdido.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => reset()}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Tentar novamente
        </Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Recarregar página
        </Button>
      </div>
    </div>
  );
}
