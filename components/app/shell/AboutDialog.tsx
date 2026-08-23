'use client';

import { useState } from 'react';
import { Bug, CheckCircle2, Info, Lightbulb, Send, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type FeedbackKind = 'bug' | 'suggestion';

export function AboutDialog({ open, onClose, version }: { open: boolean; onClose: () => void; version: string }) {
  const [kind, setKind] = useState<FeedbackKind>('suggestion');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!open) return null;

  async function submitFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setFeedbackStatus(null);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, message }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar sua contribuição.');
      setMessage('');
      setFeedbackStatus({ type: 'success', message: 'Obrigado! Sua contribuição foi enviada para nossa equipe.' });
    } catch (error) {
      setFeedbackStatus({ type: 'error', message: error instanceof Error ? error.message : 'Não foi possível enviar sua contribuição.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="about-dialog-title">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar" onClick={onClose} />
      <div className="relative z-10 my-auto w-full max-w-3xl overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="bg-gradient-to-br from-primary to-primary/80 px-6 py-7 text-primary-foreground sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15"><Info className="h-6 w-6" aria-hidden="true" /></div>
              <div>
                <p className="text-sm text-primary-foreground/75">Calculadora SolaX</p>
                <h2 id="about-dialog-title" className="mt-1 text-2xl font-semibold tracking-tight">Sobre a aplicação</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-primary-foreground/80">Uma ferramenta para ajudar integradores a transformar as necessidades do projeto em uma solução híbrida clara e bem dimensionada.</p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon-lg" className="text-primary-foreground hover:bg-white/15 hover:text-white" aria-label="Fechar" onClick={onClose}><X className="h-5 w-5" /></Button>
          </div>
          <div className="mt-6 inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-medium">Versão {version}</div>
        </div>

        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr]">
          <section>
            <h3 className="text-base font-semibold">O que você encontra aqui</h3>
            <div className="mt-4 space-y-4">
              <div className="flex gap-3"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-lg bg-primary/10 text-primary"><ShieldCheck className="h-4 w-4" aria-hidden="true" /></div><div><p className="text-sm font-medium">Dimensionamento guiado</p><p className="mt-1 text-sm leading-5 text-muted-foreground">Escolhas organizadas para chegar a uma solução compatível com o projeto.</p></div></div>
              <div className="flex gap-3"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-lg bg-primary/10 text-primary"><Info className="h-4 w-4" aria-hidden="true" /></div><div><p className="text-sm font-medium">Informação técnica</p><p className="mt-1 text-sm leading-5 text-muted-foreground">Detalhes sobre produtos, funcionalidades, margens e premissas do cálculo.</p></div></div>
              <div className="flex gap-3"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-lg bg-primary/10 text-primary"><Lightbulb className="h-4 w-4" aria-hidden="true" /></div><div><p className="text-sm font-medium">Produto em evolução</p><p className="mt-1 text-sm leading-5 text-muted-foreground">Suas observações ajudam a priorizar melhorias que tornam o trabalho mais simples.</p></div></div>
            </div>
          </section>

          <section className="rounded-xl border bg-muted/20 p-5">
            <div className="flex items-start gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Lightbulb className="h-5 w-5" aria-hidden="true" /></div><div><h3 className="font-semibold">Contribuir</h3><p className="mt-1 text-sm leading-5 text-muted-foreground">Conte para a equipe o que aconteceu ou o que poderia ser melhor.</p></div></div>
            <form className="mt-5 space-y-4" onSubmit={submitFeedback}>
              <fieldset className="grid grid-cols-2 gap-2"><legend className="sr-only">Tipo de contribuição</legend>
                <button type="button" onClick={() => setKind('bug')} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${kind === 'bug' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'hover:bg-muted'}`} aria-pressed={kind === 'bug'}><Bug className="h-4 w-4" aria-hidden="true" /> Bug</button>
                <button type="button" onClick={() => setKind('suggestion')} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${kind === 'suggestion' ? 'border-primary/40 bg-primary/10 text-primary' : 'hover:bg-muted'}`} aria-pressed={kind === 'suggestion'}><Lightbulb className="h-4 w-4" aria-hidden="true" /> Sugestão</button>
              </fieldset>
              <div><label htmlFor="feedback-message" className="text-sm font-medium">Como podemos melhorar?</label><textarea id="feedback-message" value={message} onChange={(event) => setMessage(event.target.value)} minLength={10} maxLength={5000} required rows={5} placeholder={kind === 'bug' ? 'O que aconteceu? Inclua os passos para reproduzir.' : 'Que melhoria tornaria seu trabalho mais fácil?'} className="mt-2 flex w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" /><p className="mt-1 text-right text-xs text-muted-foreground">{message.length}/5.000</p></div>
              {feedbackStatus && <p className={feedbackStatus.type === 'success' ? 'flex items-center gap-2 text-sm text-emerald-700' : 'text-sm text-destructive'} role="status">{feedbackStatus.type === 'success' && <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}{feedbackStatus.message}</p>}
              <Button type="submit" className="w-full" disabled={sending || message.trim().length < 10}><Send className="h-4 w-4" aria-hidden="true" />{sending ? 'Enviando...' : 'Enviar contribuição'}</Button>
              <p className="text-center text-xs text-muted-foreground">A mensagem será enviada diretamente para a equipe responsável.</p>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
