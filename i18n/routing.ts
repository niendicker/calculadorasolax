import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['pt', 'en', 'zh'] as const,
  defaultLocale: 'pt' as const,
  // Disable Accept-Language detection: negotiator (CJS) fails in Vercel Edge Runtime
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
