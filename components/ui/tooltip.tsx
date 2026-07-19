'use client';

import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Minimum room (px) a tooltip needs above its trigger to open upward;
 * below this, it flips to open downward instead. */
const MIN_SPACE_ABOVE = 90;

/** Tracks a tooltip's visibility and vertical placement. Visibility is
 * driven from React state rather than CSS `group-hover` — with many
 * tooltip triggers nested inside a shared draggable/hoverable card,
 * `group-hover` matches any ancestor named "group" and ends up opening
 * every tooltip inside that card at once. Attach `ref` to the trigger
 * element and spread the returned event handlers onto it. */
export function useTooltipFlip<T extends HTMLElement = HTMLElement>(): {
  ref: RefObject<T | null>;
  openUp: boolean;
  visible: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
} {
  const ref = useRef<T>(null);
  const [openUp, setOpenUp] = useState(true);
  const [visible, setVisible] = useState(false);

  function show() {
    const top = ref.current?.getBoundingClientRect().top;
    if (top !== undefined) setOpenUp(top > MIN_SPACE_ABOVE);
    setVisible(true);
  }

  function hide() {
    setVisible(false);
  }

  return { ref, openUp, visible, onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide };
}

/** The floating bubble itself: slightly rounded corners and generous text
 * padding, shared by every tooltip in the app. Opens above its trigger by
 * default, flipping below near the top of the viewport — pass the `openUp`
 * and `visible` flags from `useTooltipFlip`. */
export function TooltipBubble({
  openUp,
  visible,
  children,
  className,
}: {
  openUp: boolean;
  visible: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute left-0 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover px-3 py-2 text-xs font-normal leading-snug text-popover-foreground shadow-md transition-opacity',
        openUp ? 'bottom-full mb-2.5' : 'top-full mt-2.5',
        visible ? 'opacity-100' : 'opacity-0',
        className
      )}
    >
      {children}
    </span>
  );
}

/** Wraps any trigger element with a floating hover/focus tooltip. The trigger
 * is rendered as-is (plus `relative`); the bubble opens above it by default,
 * flipping below near the top of the viewport. */
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
  const { ref, openUp, visible, onMouseEnter, onMouseLeave, onFocus, onBlur } = useTooltipFlip<HTMLSpanElement>();
  return (
    <span
      ref={ref}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn('relative inline-flex', className)}
    >
      {children}
      <TooltipBubble openUp={openUp} visible={visible} className={contentClassName}>
        {content}
      </TooltipBubble>
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
          className="h-3.5 w-3.5 text-muted-foreground transition-colors hover:text-primary focus-visible:text-primary"
          tabIndex={0}
          aria-label={tip}
        />
      </Tooltip>
    </span>
  );
}
