import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['pt', 'en', 'zh'] as const,
  defaultLocale: 'pt' as const,
});

export type Locale = (typeof routing.locales)[number];
