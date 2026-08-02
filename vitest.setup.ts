import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';

// next/image's real implementation rewrites `src` through the (server-only)
// image optimizer, which doesn't run in jsdom — tests would otherwise see
// `/_next/image?url=...` instead of the plain URL they set up. Rendering a
// bare <img> keeps `src`/`alt` assertions working exactly as they did before
// the next/image migration, without every call site needing to know about it.
vi.mock('next/image', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- stripped so they don't land on the DOM <img> as invalid attributes
  default: ({ src, alt, fill, sizes, priority, ...rest }: Record<string, unknown> & { src: string; alt: string }) =>
    React.createElement('img', { src, alt, ...rest }),
}));
