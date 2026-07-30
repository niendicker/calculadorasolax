'use client';

import { TooltipBubble, useTooltipFlip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function PeakModeButton({
  label,
  tip,
  active,
  onClick,
}: {
  label: string;
  tip: string;
  active: boolean;
  onClick: () => void;
}) {
  const { ref, openUp, visible, onMouseEnter, onMouseLeave, onFocus, onBlur } = useTooltipFlip<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        'relative h-10 rounded-md px-2 text-sm font-medium transition md:h-8 md:text-xs',
        active
          ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
          : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
      )}
    >
      {label}
      <TooltipBubble triggerRef={ref} openUp={openUp} visible={visible}>
        {tip}
      </TooltipBubble>
    </button>
  );
}
