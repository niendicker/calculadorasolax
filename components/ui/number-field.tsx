'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { InfoTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type NumberFieldControlProps = Omit<React.ComponentProps<typeof Input>, 'type' | 'inputMode'> & {
  /** Unit shown as a chip at the right edge and announced as the input's description. */
  unit: string;
  /** Optional quantity icon at the left edge; keep it for quantities the catalog already illustrates. */
  icon?: React.ReactNode;
  onClear?: () => void;
};

/** Bordered numeric control: icon · value · unit. The box, not the input, carries border and focus ring. */
export function NumberFieldControl({ unit, icon, onClear, className, onFocus, ...props }: NumberFieldControlProps) {
  const unitId = React.useId();
  const hasValue = props.value !== undefined && props.value !== null && props.value !== '';
  const describedBy = [props['aria-describedby'], unitId].filter(Boolean).join(' ');
  return (
    <div data-slot="number-field-control" className={cn('flex h-10 min-w-0 items-center rounded-lg border border-input bg-muted transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[:disabled]:opacity-50 has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-3 has-[[aria-invalid=true]]:ring-destructive/20 dark:has-[[aria-invalid=true]]:border-destructive/50 dark:has-[[aria-invalid=true]]:ring-destructive/40 md:h-8', className)}>
      {icon && <span aria-hidden="true" className="flex h-full w-8 shrink-0 items-center justify-center text-muted-foreground [&>svg]:size-4">{icon}</span>}
      <Input
        {...props}
        value={props.value ?? ''}
        type="number"
        inputMode="decimal"
        aria-describedby={describedBy}
        onFocus={(event) => { event.target.select(); onFocus?.(event); }}
        className={cn('h-full border-0 bg-transparent px-1 py-0 focus-visible:border-transparent focus-visible:ring-0 disabled:bg-transparent disabled:opacity-100 aria-invalid:ring-0 md:h-full md:px-1 dark:bg-transparent dark:disabled:bg-transparent', !icon && 'pl-2.5 md:pl-2.5')}
      />
      {onClear && hasValue && (
        <button type="button" aria-label="Limpar campo" disabled={props.disabled || props.readOnly} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={onClear} className="mr-1 flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none md:size-6">
          <X className="h-3 w-3" />
        </button>
      )}
      <span id={unitId} aria-hidden="true" className="mr-2 shrink-0 rounded-md bg-background px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{unit}</span>
    </div>
  );
}

export type NumberFieldProps = NumberFieldControlProps & {
  label: string;
  /** Tooltip body; `tipLabel` names the tooltip trigger for assistive technology. */
  tip?: React.ReactNode;
  tipLabel?: string;
  optional?: boolean;
  /** Small text under the control, e.g. a derived equivalent value. */
  hint?: React.ReactNode;
  /** Matches panels whose labels are `text-xs`. */
  compact?: boolean;
  /** Class for the outer wrapper; use `controlClassName` for the bordered box. */
  className?: string;
  controlClassName?: string;
};

/** Labelled numeric field with the unit outside the label, as in the product editors. */
export function NumberField({ label, tip, tipLabel, optional, hint, compact, className, controlClassName, id, ...control }: NumberFieldProps) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex items-center gap-1">
        <label htmlFor={inputId} className={cn('font-medium text-foreground', compact ? 'text-xs' : 'text-sm')}>
          {label}
          {optional && <span className="font-normal text-muted-foreground"> (opcional)</span>}
        </label>
        {tip && <InfoTooltip label={tipLabel ?? `Sobre ${label.toLowerCase()}`}>{tip}</InfoTooltip>}
      </div>
      <NumberFieldControl id={inputId} className={controlClassName} {...control} />
      {hint && <span className="text-[11px] font-normal text-muted-foreground">{hint}</span>}
    </div>
  );
}
