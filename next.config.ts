import { execSync } from 'node:child_process';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

function resolveCommitSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    return '';
  }
}

// Derived from NEXT_PUBLIC_SUPABASE_URL instead of a hardcoded hostname, so
// migrating the Supabase project (self-hosted or not) only requires updating
// that one env var — next/image's remote-host allowlist follows it
// automatically instead of needing a matching next.config.ts edit + redeploy
// every time (see the supabase-calculadora.solaxpowerbrasil.cloud migration).
const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_COMMIT_SHA: resolveCommitSha(),
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
