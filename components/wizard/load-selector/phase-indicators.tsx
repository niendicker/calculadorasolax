'use client';

import { loadPhases } from '@/lib/store/wizard-store';
import type { LoadPhase } from '@/lib/types';
import { cn } from '@/lib/utils';

// Fixed-order, CVD-safe categorical triad (one hue per phase, never cycled) so
// a load's phase reads at a glance across the card header, the phase picker,
// and the per-fase power summary — instead of only ever being a bare "L1"/
// "L2"/"L3" string. Text still always carries the letter too; color is never
// the only signal.
const phaseDotClass: Record<LoadPhase, string> = {
  L1: 'bg-[#2a78d6] dark:bg-[#3987e5]',
  L2: 'bg-[#eb6834] dark:bg-[#d95926]',
  L3: 'bg-[#1baf7a] dark:bg-[#199e70]',
};

export function PhaseDot({ phase, className }: { phase: LoadPhase; className?: string }) {
  return <span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', phaseDotClass[phase], className)} />;
}

/** A small pill badge (dot + letter) identifying one phase — used wherever a
 * bare "L1"/"L2"/"L3" used to stand alone in running text. */
export function PhaseTag({ phase }: { phase: LoadPhase }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-background px-1.5 py-0.5 text-[0.65rem] font-semibold leading-none">
      <PhaseDot phase={phase} />
      {phase}
    </span>
  );
}

/** All three phase dots clustered together, for a trifásica load that draws
 * from every phase at once. */
export function TriPhaseDots() {
  return (
    <span className="inline-flex -space-x-0.5">
      {loadPhases.map((phase) => (
        <PhaseDot key={phase} phase={phase} className="ring-1 ring-background" />
      ))}
    </span>
  );
}
