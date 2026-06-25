import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

const LOCALES = routing.locales as readonly string[];
const DEFAULT_LOCALE = routing.defaultLocale;

export default function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Pass through static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    /\.(.*)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // If path already starts with a supported locale, let next-intl handle it
  const pathnameLocale = LOCALES.find(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
  );

  if (pathnameLocale) {
    return intlMiddleware(request);
  }

  // No locale in path — redirect to Accept-Language best match or default
  const acceptLanguage = request.headers.get('accept-language') ?? '';
  const preferred = acceptLanguage
    .split(',')
    .map((part) => part.split(';')[0].trim().split('-')[0].toLowerCase())
    .find((lang) => LOCALES.includes(lang));

  const locale = preferred ?? DEFAULT_LOCALE;
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
