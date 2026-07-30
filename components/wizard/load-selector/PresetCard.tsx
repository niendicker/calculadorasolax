'use client';

import { BatteryCharging, Layers, ListChecks, Zap } from 'lucide-react';
import { TooltipBubble, useTooltipFlip } from '@/components/ui/tooltip';
import type { LoadPresetLoad } from '@/lib/types';
import { cn } from '@/lib/utils';

export function PresetCard({
  preset,
  onAdd,
  withDeleteSpacing,
  operationHours,
}: {
  preset: { name: string; description: string; loads: LoadPresetLoad[] };
  onAdd: () => void;
  withDeleteSpacing?: boolean;
  operationHours: number;
}) {
  const peakKva = preset.loads.reduce((acc, load) => acc + load.powerW * (load.ipInRatio ?? 1) * load.qty, 0) / 1000;
  const dailyKwh = (operationHours * preset.loads.reduce((acc, load) => acc + load.powerW * load.qty, 0)) / 1000;
  const {
    ref: loadsTipRef,
    openUp: loadsTipOpenUp,
    visible: loadsTipVisible,
    onMouseEnter: loadsTipOnMouseEnter,
    onMouseLeave: loadsTipOnMouseLeave,
    onFocus: loadsTipOnFocus,
    onBlur: loadsTipOnBlur,
  } = useTooltipFlip<HTMLSpanElement>();
  const {
    ref: peakTipRef,
    openUp: peakTipOpenUp,
    visible: peakTipVisible,
    onMouseEnter: peakTipOnMouseEnter,
    onMouseLeave: peakTipOnMouseLeave,
    onFocus: peakTipOnFocus,
    onBlur: peakTipOnBlur,
  } = useTooltipFlip<HTMLSpanElement>();
  const {
    ref: dailyTipRef,
    openUp: dailyTipOpenUp,
    visible: dailyTipVisible,
    onMouseEnter: dailyTipOnMouseEnter,
    onMouseLeave: dailyTipOnMouseLeave,
    onFocus: dailyTipOnFocus,
    onBlur: dailyTipOnBlur,
  } = useTooltipFlip<HTMLSpanElement>();

  return (
    <button
      type="button"
      onClick={onAdd}
      className={cn(
        'w-full space-y-1 rounded-lg border bg-card p-2.5 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        withDeleteSpacing && 'pr-9'
      )}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate">{preset.name}</span>
      </div>
      {preset.description && <p className="truncate text-xs text-muted-foreground">{preset.description}</p>}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span
          ref={loadsTipRef}
          onMouseEnter={loadsTipOnMouseEnter}
          onMouseLeave={loadsTipOnMouseLeave}
          onFocus={loadsTipOnFocus}
          onBlur={loadsTipOnBlur}
          className="relative flex items-center gap-1"
        >
          <ListChecks className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{preset.loads.length}</span>
          <TooltipBubble triggerRef={loadsTipRef} openUp={loadsTipOpenUp} visible={loadsTipVisible}>
            Cargas
          </TooltipBubble>
        </span>
        <span
          ref={peakTipRef}
          onMouseEnter={peakTipOnMouseEnter}
          onMouseLeave={peakTipOnMouseLeave}
          onFocus={peakTipOnFocus}
          onBlur={peakTipOnBlur}
          className="relative flex items-center gap-1"
        >
          <Zap className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{peakKva.toFixed(1)}</span>
          kVA
          <TooltipBubble triggerRef={peakTipRef} openUp={peakTipOpenUp} visible={peakTipVisible}>
            Máxima
          </TooltipBubble>
        </span>
        <span
          ref={dailyTipRef}
          onMouseEnter={dailyTipOnMouseEnter}
          onMouseLeave={dailyTipOnMouseLeave}
          onFocus={dailyTipOnFocus}
          onBlur={dailyTipOnBlur}
          className="relative flex items-center gap-1"
        >
          <BatteryCharging className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{dailyKwh.toFixed(1)}</span>
          kWh
          <TooltipBubble triggerRef={dailyTipRef} openUp={dailyTipOpenUp} visible={dailyTipVisible}>
            Consumo diário
          </TooltipBubble>
        </span>
      </div>
    </button>
  );
}
