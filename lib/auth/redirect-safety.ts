import { routing, type Locale } from '@/i18n/routing';

export function isSupportedLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value);
}

/** Accept only same-origin application paths; `//host` is deliberately
 * rejected because browsers interpret it as an external protocol-relative URL. */
export function safeLocalRedirect(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;
  return candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : fallback;
}
