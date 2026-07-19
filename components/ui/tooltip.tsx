import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Shared bubble style for every hover/focus tooltip in the app: slightly
 * rounded corners and generous text padding, so tooltips look the same
 * everywhere instead of each spot hand-rolling its own variant. Exported for
 * triggers that can host `group relative` themselves (e.g. a `<button>`)
 * and don't need the `Tooltip` wrapper's extra span. */
export const TOOLTIP_BUBBLE_CLASSES =
  'pointer-events-none absolute left-0 top-full z-50 mt-2.5 w-56 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover px-3 py-2 text-xs font-normal leading-snug text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100';

/** Wraps any trigger element with a floating hover/focus tooltip. The trigger
 * is rendered as-is (plus `group relative`); the bubble appears below it. */
export function Tooltip({
  content,
  children,
  className,
  contentClassName,
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <span className={cn('group relative inline-flex', className)}>
      {children}
      <span className={cn(TOOLTIP_BUBBLE_CLASSES, contentClassName)}>{content}</span>
    </span>
  );
}

/** A text label followed by a help icon whose tooltip explains it. The most
 * common tooltip shape in the app (form field labels, section headers). */
export function InfoLabel({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <Tooltip content={tip}>
        <CircleHelp
          className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary group-focus-visible:text-primary"
          tabIndex={0}
          aria-label={tip}
        />
      </Tooltip>
    </span>
  );
}
