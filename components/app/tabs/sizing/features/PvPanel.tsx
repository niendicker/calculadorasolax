'use client';

import { AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PvConfig } from '@/lib/types';

export const emptyPvConfig: PvConfig = {
  monthlyConsumptionKwh: 0,
  hsp: 0,
};

export function PvPanel({
  pv,
  onPvChange,
}: {
  pv: PvConfig | null;
  onPvChange: (pv: PvConfig | null) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        A potência do arranjo é calculada a partir do consumo e do HSP informados abaixo — não das cargas
        cadastradas — e nunca ultrapassa o sobredimensionamento permitido pelo inversor recomendado.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pvMonthlyConsumption">Consumo médio mensal (kWh)</Label>
          <Input
            id="pvMonthlyConsumption"
            type="number"
            min={0}
            placeholder="Ex.: 450"
            value={pv?.monthlyConsumptionKwh || ''}
            onChange={(event) =>
              onPvChange({ ...(pv ?? emptyPvConfig), monthlyConsumptionKwh: Number(event.target.value) || 0 })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pvHsp">HSP da instalação (h/dia)</Label>
          <Input
            id="pvHsp"
            type="number"
            min={0}
            step={0.1}
            placeholder="Ex.: 4.5"
            value={pv?.hsp || ''}
            onChange={(event) => onPvChange({ ...(pv ?? emptyPvConfig), hsp: Number(event.target.value) || 0 })}
          />
        </div>
      </div>
      {(!pv?.monthlyConsumptionKwh || !pv?.hsp) && (
        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Informe o consumo médio mensal e o HSP para calcular o FV.
        </p>
      )}
    </div>
  );
}
