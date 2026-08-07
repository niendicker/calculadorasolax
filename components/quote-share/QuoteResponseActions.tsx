'use client';

import { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Aceitar/Recusar buttons for the public quote-share page — posts to the
 *  no-auth respond route (app/api/quote-shares/[token]/respond) and shows an
 *  inline confirmation instead of the buttons once a decision lands, so a
 *  page refresh isn't needed and a second click can't double-submit. */
export function QuoteResponseActions({ token }: { token: string }) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'accepted' | 'rejected' | 'error'>('idle');

  async function respond(decision: 'accepted' | 'rejected') {
    setStatus('submitting');
    try {
      const res = await fetch(`/api/quote-shares/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        setStatus('error');
        return;
      }
      setStatus(decision);
    } catch {
      setStatus('error');
    }
  }

  if (status === 'accepted' || status === 'rejected') {
    return (
      <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-center text-sm font-medium text-primary">
        {status === 'accepted' ? 'Orçamento aceito. Obrigado pela resposta!' : 'Orçamento recusado. Obrigado pela resposta!'}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {status === 'error' && (
        <p role="alert" className="text-center text-xs text-destructive">
          Não foi possível registrar sua resposta. Tente novamente.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button
          size="lg"
          className="w-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-50"
          disabled={status === 'submitting'}
          onClick={() => void respond('accepted')}
        >
          {status === 'submitting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Aceitar
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="w-full border-destructive/40 text-destructive hover:bg-destructive/5 disabled:pointer-events-none disabled:opacity-50"
          disabled={status === 'submitting'}
          onClick={() => void respond('rejected')}
        >
          {status === 'submitting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          Recusar
        </Button>
      </div>
    </div>
  );
}
