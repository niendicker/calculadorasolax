'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { activeKwToApparentKva, apparentKvaToActiveKw, formatAcPower, projectAcPowerFactor } from '@/supabase/functions/_shared/commercial-industrial/ac-power';

const CiAcPowerContext = createContext(1);

export function CiAcPowerProvider({ powerFactor, children }: { powerFactor?: number; children: ReactNode }) {
  return <CiAcPowerContext value={projectAcPowerFactor(powerFactor)}>{children}</CiAcPowerContext>;
}

export function useCiAcPower(override?: number) {
  const inherited = useContext(CiAcPowerContext);
  const factor = projectAcPowerFactor(override ?? inherited);
  return {
    factor,
    toKva: (kw: number) => Number(activeKwToApparentKva(kw, factor).toFixed(6)),
    fromKva: (kva: number) => apparentKvaToActiveKw(kva, factor),
    formatPower: (kw: number, digits = 1) => formatAcPower(kw, factor, digits),
  };
}

/** Keep incomplete typing local; only publish a physically valid factor. */
export function CiAcPowerFactorInput({ value, onChange, label }: { value: number; onChange: (factor: number) => void; label: string }) {
  const [draft, setDraft] = useState(String(value));
  const [previous, setPrevious] = useState(value);
  if (previous !== value) {
    setPrevious(value);
    setDraft(String(value));
  }
  return <Input aria-label={label} type="number" min={0.01} max={1} step={0.01} value={draft} onChange={event => {
    const text = event.target.value;
    setDraft(text);
    const factor = Number(text);
    if (factor > 0 && factor <= 1) onChange(factor);
  }} onBlur={() => setDraft(String(value))} />;
}
