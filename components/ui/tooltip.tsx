'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp, Info } from 'lucide-react';
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
  showNow: () => void;
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

  function showNow() {
    clearPending();
    const top = ref.current?.getBoundingClientRect().top;
    if (top !== undefined) setOpenUp(top > MIN_SPACE_ABOVE);
    setVisible(true);
  }

  function show() {
    clearPending();
    timeoutRef.current = setTimeout(showNow, SHOW_DELAY_MS);
  }

  function hide() {
    clearPending();
    setVisible(false);
  }

  useEffect(() => clearPending, []);

  return { ref, openUp, visible, onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide, showNow };
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

  // Gates the createPortal call below until after client mount — document
  // doesn't exist during SSR, so this can't be a lazy useState initializer
  // without causing a hydration mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
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

    const above = triggerRect.top - GAP_PX - bubbleRect.height;
    const below = triggerRect.bottom + GAP_PX;
    const fitsAbove = above >= VIEWPORT_MARGIN_PX;
    const fitsBelow = below + bubbleRect.height <= window.innerHeight - VIEWPORT_MARGIN_PX;
    const preferredTop = (openUp && fitsAbove) || !fitsBelow ? above : below;
    const top = Math.max(VIEWPORT_MARGIN_PX, Math.min(preferredTop, window.innerHeight - bubbleRect.height - VIEWPORT_MARGIN_PX));

    setPosition({ top, left });
  }, [mounted, visible, openUp, align, triggerRef]);

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

/** Contextual help that also opens on tap and closes with Escape or blur. */
export function InfoTooltip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const { ref, openUp, visible: hovered, onMouseEnter, onMouseLeave, onFocus, onBlur, showNow } = useTooltipFlip<HTMLButtonElement>();
  const [pinned, setPinned] = useState(false);
  const visible = pinned || hovered;

  useEffect(() => {
    if (!pinned) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) {
        setPinned(false);
        onBlur();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [pinned, ref, onBlur]);

  return <span className="inline-flex shrink-0 align-middle">
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-describedby={visible ? id : undefined}
      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={() => { onBlur(); setPinned(false); }}
      onClick={event => {
        event.preventDefault();
        if (pinned) onBlur(); else showNow();
        setPinned(value => !value);
      }}
      onKeyDown={event => {
        if (event.key === 'Escape' && visible) {
          event.preventDefault(); event.stopPropagation(); onBlur(); setPinned(false);
        }
      }}
    ><Info className="h-3.5 w-3.5" aria-hidden="true" /></button>
    {visible && <TooltipBubble triggerRef={ref} openUp={openUp} visible className="z-[90]">
      <span id={id} role="tooltip">{children}</span>
    </TooltipBubble>}
  </span>;
}

/** Short help points, with one explanation per line. */
export function TooltipList({ items }: { items: ReactNode[] }) {
  return <span role="list" className="block space-y-1.5 text-left">
    {items.map((item, index) => <span key={index} role="listitem" className="flex items-start gap-2">
      <span aria-hidden="true" className="shrink-0">•</span>
      <span className="min-w-0">{item}</span>
    </span>)}
  </span>;
}
