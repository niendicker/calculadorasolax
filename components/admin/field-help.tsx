'use client';

import { createContext, useContext, useId, type ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { TooltipBubble, useTooltipFlip } from '@/components/ui/tooltip';

const FieldHelpContext = createContext<Readonly<Record<string, string>>>({});

/** Scope extra explanations to a catalog without changing shared editors elsewhere. */
export function FieldHelpProvider({ tips, children }: {
  tips: Readonly<Record<string, string>>;
  children: ReactNode;
}) {
  return <FieldHelpContext.Provider value={tips}>{children}</FieldHelpContext.Provider>;
}

export function FieldHelpLabel({ label, iconOnly = false }: { label: ReactNode; iconOnly?: boolean }) {
  const tips = useContext(FieldHelpContext);
  const descriptionId = useId();
  const { ref, openUp, visible, onMouseEnter, onMouseLeave, onFocus, onBlur } = useTooltipFlip<HTMLSpanElement>();
  const tip = typeof label === 'string' ? tips[label] : undefined;
  // Existing InfoLabel nodes already carry the field's more specific explanation.
  if (!tip) return iconOnly ? null : <>{label}</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {!iconOnly && <span>{label}</span>}
      <span
        ref={ref}
        role="button"
        className="inline-flex shrink-0 cursor-help rounded-sm text-muted-foreground transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-2 focus-visible:outline-ring"
        tabIndex={0}
        aria-label={`Ajuda: ${label}`}
        aria-describedby={descriptionId}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={event => {
          if (event.key === 'Escape') onBlur();
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onFocus();
          }
        }}
        onClick={event => {
          // Tapping help inside a checkbox label must not toggle that checkbox.
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus();
          onFocus();
        }}
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <TooltipBubble triggerRef={ref} openUp={openUp} visible={visible}>
        <span id={descriptionId} hidden={!visible}>{tip}</span>
      </TooltipBubble>
    </span>
  );
}
