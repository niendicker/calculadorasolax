'use client';

import { useEffect } from 'react';

/** Catches errors thrown by the root layout itself (app/layout.tsx) — a
 * narrower error.tsx one level down can't catch these since it renders
 * inside that same layout. Must render its own <html>/<body> since it
 * replaces the root layout entirely, so no Tailwind/theme classes from
 * globals.css are guaranteed to apply; kept intentionally plain. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pt">
      <body style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '1.5rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h1 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Algo deu errado</h1>
        <p style={{ maxWidth: '24rem', fontSize: '0.875rem', color: '#666' }}>
          Ocorreu um erro inesperado ao carregar a aplicação. Você pode tentar novamente ou recarregar a página.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: '#FF9D00', color: 'white', border: 'none', cursor: 'pointer' }}
          >
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: 'transparent', color: '#333', border: '1px solid #ccc', cursor: 'pointer' }}
          >
            Recarregar página
          </button>
        </div>
      </body>
    </html>
  );
}
