'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Lightbulb, List, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { GuideContent } from '@/content/guide';

interface GuidePageProps {
  content: GuideContent;
  embedded?: boolean;
}

export function GuidePage({ content, embedded = false }: GuidePageProps) {
  const [mobileIndexOpen, setMobileIndexOpen] = useState(false);

  const indexLinks = [
    ...content.steps.map((step, index) => ({
      label: `${index + 1}. ${step.title}`,
      href: `#guide-step-${step.id}`,
    })),
    ...content.sections.map((section) => ({
      label: section.title,
      href: `#guide-section-${section.id}`,
    })),
    ...content.faqs.map((faq, index) => ({
      label: faq.question,
      href: `#guide-faq-${index}`,
    })),
  ];

  function renderIndex(className?: string, onNavigate?: () => void) {
    return (
      <nav aria-label="Índice do guia" className={className}>
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <List className="h-4 w-4 text-primary" aria-hidden="true" />
          Neste guia
        </p>
        <ul className="mt-3 space-y-1 border-l pl-3">
          {indexLinks.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                onClick={onNavigate}
                className="block rounded-md px-2 py-1.5 text-sm leading-5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <main className={embedded ? 'bg-background' : 'min-h-screen bg-background'}>
      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 sm:py-12">
        <div className="grid gap-10 lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start lg:gap-16">
          <aside className="sticky top-4 hidden lg:block">{renderIndex()}</aside>

          <div className="min-w-0">
            <header className="max-w-3xl">
              <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {content.title}
              </h1>
              <p className="mt-4 text-base leading-7 text-muted-foreground">{content.intro}</p>
            </header>

            <section className="mt-12" aria-labelledby="guide-steps-title">
              <h2 id="guide-steps-title" className="font-heading text-xl font-semibold">
                {content.stepsTitle}
              </h2>
              <div className="mt-4 space-y-3">
                {content.steps.map((step, index) => (
                  <Card key={step.id} id={`guide-step-${step.id}`}>
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

            {content.sections.map((section) => (
              <section key={section.id} id={`guide-section-${section.id}`} className="mt-12 scroll-mt-6" aria-labelledby={`guide-section-title-${section.id}`}>
                <h2 id={`guide-section-title-${section.id}`} className="font-heading text-xl font-semibold">
                  {section.title}
                </h2>
                <Card className="mt-4">
                  <CardContent className="pt-5">
                    <p className="text-sm leading-6 text-muted-foreground">{section.intro}</p>
                    {section.attention && (
                      <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                        <p><span className="font-semibold">Atenção:</span> {section.attention}</p>
                      </div>
                    )}
                    <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                      {section.details.map((detail) => (
                        <li key={detail} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                    {section.tips && (
                      <div className="mt-4 rounded-lg border border-primary/15 bg-primary/5 p-3 text-sm text-muted-foreground">
                        <p className="flex items-center gap-2 font-medium text-foreground">
                          <Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" />
                          Resumo
                        </p>
                        <ul className="mt-2 space-y-1 pl-6">
                          {section.tips.map((tip) => (
                            <li key={tip} className="list-disc">
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </section>
            ))}

            <section className="mt-12" aria-labelledby="guide-faq-title">
              <h2 id="guide-faq-title" className="font-heading text-xl font-semibold">
                {content.faqTitle}
              </h2>
              <div className="mt-4 divide-y overflow-hidden rounded-lg border bg-card">
                {content.faqs.map((faq, index) => (
                  <details key={faq.question} id={`guide-faq-${index}`} className="group px-4 sm:px-5">
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
        </div>
      </div>
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileIndexOpen((open) => !open)}
          className="fixed right-4 bottom-20 z-30 inline-flex h-11 items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium text-foreground shadow-lg"
          aria-expanded={mobileIndexOpen}
          aria-controls="mobile-guide-index"
        >
          {mobileIndexOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <List className="h-4 w-4" aria-hidden="true" />}
          Índice
        </button>
        {mobileIndexOpen && (
          <div id="mobile-guide-index" className="fixed right-4 bottom-34 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-card p-4 shadow-xl">
            {renderIndex(undefined, () => setMobileIndexOpen(false))}
          </div>
        )}
      </div>
    </main>
  );
}
