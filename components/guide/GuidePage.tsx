'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Lightbulb, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { GuideContent } from '@/content/guide';

interface GuidePageProps {
  locale: string;
  content: GuideContent;
  embedded?: boolean;
  onClose?: () => void;
}

export function GuidePage({ locale, content, embedded = false, onClose }: GuidePageProps) {
  return (
    <main className={embedded ? 'bg-background' : 'min-h-screen bg-background'}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        {embedded ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Fechar guia
          </button>
        ) : (
          <Link
            href={`/${locale}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar para a calculadora
          </Link>
        )}

        <header className="mt-8 max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            {content.eyebrow}
          </div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {content.title}
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">{content.intro}</p>

          {!embedded && (
            <>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`/${locale}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
                >
                  {content.cta}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href={`/${locale}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
                >
                  {content.demoCta}
                </Link>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{content.demoNote}</p>
            </>
          )}
        </header>

        <section className="mt-12" aria-labelledby="guide-steps-title">
          <h2 id="guide-steps-title" className="font-heading text-xl font-semibold">
            {content.stepsTitle}
          </h2>
          <div className="mt-4 space-y-3">
            {content.steps.map((step, index) => (
              <Card key={step.id}>
                <details open={index === 0} className="group">
                  <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden sm:px-5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">{step.title}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">{step.summary}</span>
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
                  </summary>
                  <CardContent className="border-t pt-4">
                    <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
                      {step.details.map((detail) => (
                        <li key={detail} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                    {step.tips && (
                      <div className="mt-4 rounded-lg border border-primary/15 bg-primary/5 p-3 text-sm text-muted-foreground">
                        <p className="flex items-center gap-2 font-medium text-foreground">
                          <Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" />
                          Dicas
                        </p>
                        <ul className="mt-2 space-y-1 pl-6">
                          {step.tips.map((tip) => (
                            <li key={tip} className="list-disc">
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </details>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-12" aria-labelledby="guide-faq-title">
          <h2 id="guide-faq-title" className="font-heading text-xl font-semibold">
            {content.faqTitle}
          </h2>
          <div className="mt-4 divide-y overflow-hidden rounded-lg border bg-card">
            {content.faqs.map((faq) => (
              <details key={faq.question} className="group px-4 sm:px-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
                </summary>
                <p className="pb-4 pr-8 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
