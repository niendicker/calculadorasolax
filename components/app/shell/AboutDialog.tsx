'use client';

import { Bug, ExternalLink, Info, Lightbulb, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

function feedbackHref(email: string, subject: string, version: string) {
  const body = `Versão: ${version}\n\nDescreva aqui o contexto, o que aconteceu e como reproduzir:`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function AboutDialog({
  open,
  onClose,
  version,
  feedbackEmail,
}: {
  open: boolean;
  onClose: () => void;
  version: string;
  feedbackEmail: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="about-dialog-title">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Fechar" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Calculadora SolaX</p>
            <h2 id="about-dialog-title" className="mt-1 text-lg font-semibold">Sobre e contribuir</h2>
          </div>
          <Button type="button" variant="ghost" size="icon-lg" aria-label="Fechar" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <section className="rounded-lg border bg-muted/20 p-4">
            <Info className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 className="mt-3 font-medium">Versão da aplicação</h3>
            <p className="mt-1 text-sm text-muted-foreground">Versão oficial instalada: <span className="font-medium text-foreground">v{version}</span></p>
            <p className="mt-2 text-xs text-muted-foreground">Consulte as novidades desta versão com a equipe responsável pelo produto.</p>
          </section>

          <section className="rounded-lg border bg-muted/20 p-4">
            <Lightbulb className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 className="mt-3 font-medium">Contribuir</h3>
            <p className="mt-1 text-sm text-muted-foreground">Ajude a melhorar a calculadora compartilhando problemas e ideias.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={feedbackHref(feedbackEmail, 'Bug na Calculadora SolaX', version)}
                className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted"
              >
                <Bug className="h-4 w-4" aria-hidden="true" />
                Reportar bug
              </a>
              <a
                href={feedbackHref(feedbackEmail, 'Sugestão para a Calculadora SolaX', version)}
                className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted"
              >
                <Lightbulb className="h-4 w-4" aria-hidden="true" />
                Sugerir melhoria
              </a>
            </div>
            {!feedbackEmail && <p className="mt-2 text-xs text-muted-foreground">O email de destino será configurado pelo administrador.</p>}
          </section>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
          Ao contribuir, inclua a versão e os passos para reproduzir o problema. Isso acelera a análise.
        </div>
      </div>
    </div>
  );
}
