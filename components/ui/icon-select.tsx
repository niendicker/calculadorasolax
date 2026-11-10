'use client';

import type { ReactNode } from 'react';
import { Select } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface IconSelectOption {
  value: string;
  label: string;
  icon: ReactNode;
}

/** Custom select for compact controls with an icon beside every option. */
export function IconSelect({ id, label, value, options, onValueChange, disabled, className }: {
  id?: string;
  label: string;
  value: string;
  options: IconSelectOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const selected = options.find(option => option.value === value);
  return <Select.Root id={id} value={value} items={options} disabled={disabled} onValueChange={next => { if (next !== null) onValueChange(next); }}>
    <Select.Trigger aria-label={label} className={cn('flex h-8 min-w-0 items-center gap-2 rounded-lg border border-input bg-background px-2.5 text-left text-xs text-foreground outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50', className)}>
      <span aria-hidden="true" className="shrink-0 text-muted-foreground [&_svg]:size-4">{selected?.icon}</span>
      <Select.Value className="min-w-0 flex-1 truncate" />
      <Select.Icon><ChevronDown className="size-3.5 text-muted-foreground" /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Positioner sideOffset={6} align="start" alignItemWithTrigger={false} className="z-[110] outline-none">
        <Select.Popup className="max-h-[var(--available-height)] min-w-[var(--anchor-width)] max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card/95 p-1 text-foreground shadow-xl outline-none backdrop-blur-md">
          <Select.List>
            {options.map(option => <Select.Item key={option.value} value={option.value} className="flex min-h-10 cursor-default items-center gap-3 rounded-lg px-3 py-2 text-xs outline-none data-highlighted:bg-muted data-selected:text-primary">
              <span aria-hidden="true" className="shrink-0 text-muted-foreground [&_svg]:size-4">{option.icon}</span>
              <Select.ItemText className="min-w-0 flex-1 break-words">{option.label}</Select.ItemText>
              <Select.ItemIndicator><Check className="size-4" aria-hidden="true" /></Select.ItemIndicator>
            </Select.Item>)}
          </Select.List>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  </Select.Root>;
}
