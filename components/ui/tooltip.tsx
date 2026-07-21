'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Minimum room (px) a tooltip needs above its trigger to open upward;
 * below this, it flips to open downward instead. */
const MIN_SPACE_ABOVE = 90;

/** Delay (ms) before a tooltip opens, so sweeping the mouse across the
 * screen doesn't spam a tooltip for every element passed over — mirrors the
 * delay ConfirmDeleteButton already uses for its own hover popover. */
const SHOW_DELAY_MS = 300;

/** Gap (px) between the trigger and the tooltip bubble — matches the old
 * mb-2.5/mt-2.5 CSS spacing. */
const GAP_PX = 10;

/** Minimum distance (px) from the viewport edge the bubble is clamped to. */
const VIEWPORT_MARGIN_PX = 12;

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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearPending() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function show() {
    clearPending();
    timeoutRef.current = setTimeout(() => {
      const top = ref.current?.getBoundingClientRect().top;
      if (top !== undefined) setOpenUp(top > MIN_SPACE_ABOVE);
      setVisible(true);
    }, SHOW_DELAY_MS);
  }

  function hide() {
    clearPending();
    setVisible(false);
  }

  useEffect(() => clearPending, []);

  return { ref, openUp, visible, onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide };
}

/** The floating bubble itself: slightly rounded corners and generous text
 * padding, shared by every tooltip in the app. Opens above its trigger by
 * default, flipping below near the top of the viewport — pass the `openUp`
 * and `visible` flags from `useTooltipFlip`, along with the same `ref` used
 * on the trigger.
 *
 * Portals to `document.body` and positions itself with fixed pixel
 * coordinates (rather than CSS `absolute` relative to the trigger) so it
 * can't be clipped by a scrolling/overflow-hidden ancestor — e.g. the
 * summary sidebar's `overflow-y-auto` used to cut tooltips off. */
export function TooltipBubble({
  triggerRef,
  openUp,
  visible,
  children,
  className,
  align = 'start',
}: {
  triggerRef: RefObject<HTMLElement | null>;
  openUp: boolean;
  visible: boolean;
  children: ReactNode;
  className?: string;
  /** 'end' right-aligns the bubble to the trigger's right edge instead of its left. */
  align?: 'start' | 'end';
}) {
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const bubbleRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!visible) return;
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;

    const triggerRect = trigger.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();

    let left = align === 'end' ? triggerRect.right - bubbleRect.width : triggerRect.left;
    left = Math.min(Math.max(VIEWPORT_MARGIN_PX, left), window.innerWidth - bubbleRect.width - VIEWPORT_MARGIN_PX);

    const top = openUp ? triggerRect.top - GAP_PX - bubbleRect.height : triggerRect.bottom + GAP_PX;

    setPosition({ top, left });
  }, [visible, openUp, align, triggerRef]);

  if (!mounted) return null;

  return createPortal(
    <span
      ref={bubbleRef}
      className={cn(
        'pointer-events-none fixed z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover px-3 py-2 text-xs font-normal leading-snug text-popover-foreground shadow-md transition-opacity',
        visible ? 'opacity-100' : 'opacity-0',
        className
      )}
      style={{ top: position.top, left: position.left }}
    >
      {children}
    </span>,
    document.body
  );
}

/** Wraps any trigger element with a floating hover/focus tooltip. The trigger
 * is rendered as-is; the bubble opens above it by default, flipping below
 * near the top of the viewport. */
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
      className={cn('inline-flex', className)}
    >
      {children}
      <TooltipBubble triggerRef={ref} openUp={openUp} visible={visible} className={contentClassName}>
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
