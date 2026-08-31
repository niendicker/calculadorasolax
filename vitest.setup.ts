import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';

// Some tests opt into jsdom at file level, but setupFiles are evaluated before
// that environment is installed. Provide the smallest Web Storage fallback so
// Zustand's persist middleware can initialize consistently in those tests.
if (typeof globalThis.localStorage === 'undefined') {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
  });
}

// jsdom has no ResizeObserver at all — components that use one (e.g.
// LoadCurveChart, for responsive chart width) would otherwise throw
// "ResizeObserver is not defined" as soon as they mount in a test. A no-op
// stub is enough: nothing in this codebase asserts on resize-triggered
// behavior, just that mounting/unmounting doesn't crash.
if (typeof globalThis.ResizeObserver === 'undefined') {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
}

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
