import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function removeAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Reads a CSS custom property (design token) off the document root, e.g.
 * `--chart-1` — used by chart components that draw on canvas/SVG instead of
 * styled DOM elements, so they can't just rely on CSS cascading colors in
 * for them and need the resolved value at draw time. */
export function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}
