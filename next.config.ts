import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import packageJson from './package.json';
import { getPublicSupabaseUrl } from './lib/supabase/config';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// Derived from NEXT_PUBLIC_SUPABASE_URL instead of a hardcoded hostname, so
// migrating the Supabase project (self-hosted or not) only requires updating
// that one env var — next/image's remote-host allowlist follows it
// automatically instead of needing a matching next.config.ts edit + redeploy
// every time (see the supabase-calculadora.solaxpowerbrasil.cloud migration).
const supabaseUrl = new URL(getPublicSupabaseUrl());

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  images: {
    // Product photos, documents thumbnails and company logos are all served
    // from this Supabase project's public storage buckets.
    remotePatterns: [
      {
        protocol: supabaseUrl.protocol.replace(':', '') as 'http' | 'https',
        hostname: supabaseUrl.hostname,
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
