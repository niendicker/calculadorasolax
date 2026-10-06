'use client';

import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { MicrogridConfig, ResidentialGridType } from '@/lib/types';
import type { InverterCatalogOption } from '../../../types';
import { InverterSupportSummary } from '../InverterSupportSummary';
import {
  PhasePicker,
  PhaseVoltageCompatibilityWarning,
  VoltagePicker,
  recommendedPhases,
  recommendedVoltageForPhase,
  voltageOptionsForPhases,
} from '../PhaseVoltagePicker';
import { PhotoUploadField } from '../PhotoUploadField';
import {
  microgridOnGridConnection,
  microgridPerPhasePowerW,
  normalizeOnGridPhases,
} from '@/supabase/functions/_shared/microgrid-connection';

/** Phase-neutral voltage label of the networks where a 220V monofásico
 * on-grid has to be wired fase-fase. */
const phaseToPhaseLegLabel: Partial<Record<ResidentialGridType, string>> = {
  splitPhase_220: '110V',
  threePhase_220: '127V',
};

function OnGridConnectionNote({ gridType, phases }: { gridType: ResidentialGridType | null; phases: 1 | 3 }) {
  if (!gridType || phases !== 1) return null;
  const { connection, perPhaseFactor } = microgridOnGridConnection(gridType, phases);
  const share = (perPhaseFactor * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return (
    <p className="text-xs text-muted-foreground">
      {connection === 'phaseToPhase' ? (
        <>
          <strong className="font-medium text-foreground">Ligação fase-fase</strong> (entre 2 fases de{' '}
          {phaseToPhaseLegLabel[gridType]}): cada uma dessas fases do inversor híbrido recebe ≈{share}% da potência do on-grid.
        </>
      ) : (
        <>
          <strong className="font-medium text-foreground">Ligação fase-neutro</strong>: toda a potência do on-grid fica em uma
          única fase do inversor híbrido.
        </>
      )}
    </p>
  );
}

export const emptyMicrogridConfig: MicrogridConfig = {
  voltageV: 220,
  onGridPhases: 1,
  onGridApparentPowerVA: 0,
  photoUrl: null,
  powerNoticeAcknowledged: true,
};

export function MicrogridPanel({
  gridType,
  microgrid,
  onMicrogridChange,
  inverterCatalog,
  availableInverterModels,
  selectedInverterModel,
  onUploadPhoto,
}: {
  gridType: ResidentialGridType | null;
  microgrid: MicrogridConfig | null;
  onMicrogridChange: (microgrid: MicrogridConfig | null) => void;
  inverterCatalog: InverterCatalogOption[];
  availableInverterModels: Set<string> | null;
  selectedInverterModel: string | null;
  onUploadPhoto: (file: File, slot: 'ats' | 'microgrid' | 'generator') => Promise<string>;
}) {
  const microgridExistingPowerW = microgrid?.onGridApparentPowerVA ?? 0;
  const microgridRequiredPowerW = microgridExistingPowerW;
  const onGridPhases = microgrid?.onGridPhases ?? 1;
  const microgridRequiredPerPhaseW = microgridPerPhasePowerW(gridType, onGridPhases, microgridRequiredPowerW);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Microrrede</h2>
          <p className="text-sm text-muted-foreground">Sistema fotovoltaico existente. A Microrrede conecta e mantém operando um inversor on-grid já instalado. Para dimensionar um novo arranjo, use a funcionalidade Fotovoltaico.</p>
        </div>
      </div>
      <InverterSupportSummary
        flag="microgrid"
        featureLabel="microrrede"
        inverterCatalog={inverterCatalog}
        availableInverterModels={availableInverterModels}
        selectedInverterModel={selectedInverterModel}
      />
      <div className="space-y-1.5">
        <Label>Fases</Label>
        <PhasePicker
          value={onGridPhases}
          ariaLabel="Fases do sistema ongrid"
          options={[1, 3]}
          recommendedValues={recommendedPhases(gridType, onGridPhases, microgrid?.voltageV ?? 220, true)}
          onChange={(selected) => {
            const phases = normalizeOnGridPhases(selected);
            const validVoltages = voltageOptionsForPhases(phases).map((option) => option.value);
            const currentVoltage = microgrid?.voltageV ?? 220;
            onMicrogridChange({
              ...(microgrid ?? emptyMicrogridConfig),
              onGridPhases: phases,
              voltageV: validVoltages.includes(currentVoltage as 220 | 380) ? currentVoltage : validVoltages[0],
            });
          }}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Tensão</Label>
          <VoltagePicker
            value={microgrid?.voltageV ?? 220}
            phases={onGridPhases}
            ariaLabel="Tensão do sistema ongrid"
            recommendedValue={recommendedVoltageForPhase(
              gridType,
              onGridPhases,
              microgrid?.voltageV ?? 220,
              true
            )}
            onChange={(voltageV) =>
              onMicrogridChange({
                ...(microgrid ?? emptyMicrogridConfig),
                voltageV,
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="microgridPower">Potência nominal AC (kW)</Label>
          <Input
            id="microgridPower"
            type="number"
            min={0}
            step={0.1}
            placeholder="Ex.: 5,0"
            value={microgrid?.onGridApparentPowerVA ? microgrid.onGridApparentPowerVA / 1000 : ''}
            onChange={(event) =>
              onMicrogridChange({
                ...(microgrid ?? emptyMicrogridConfig),
                onGridApparentPowerVA: (Number(event.target.value) || 0) * 1000,
              })
            }
          />
        </div>
      </div>
      <OnGridConnectionNote gridType={gridType} phases={onGridPhases} />
      <PhaseVoltageCompatibilityWarning
        gridType={gridType}
        phases={onGridPhases}
        voltageV={microgrid?.voltageV ?? 220}
        forMicrogrid
      />
      {!microgridExistingPowerW && <p role="alert" className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>Informe a potência nominal AC do inversor on-grid existente.</p>}
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">Resumo instantâneo</p><Badge variant="outline" className={microgridExistingPowerW ? 'border-primary/30 text-primary' : 'text-muted-foreground'}>{microgridExistingPowerW ? 'Limite calculado' : 'Potência pendente'}</Badge></div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Sistema existente</p><strong>{(microgridExistingPowerW / 1000).toFixed(2)} kW</strong></div>
          <div><p className="text-xs text-muted-foreground">Inversor e baterias</p><strong>mín. {(microgridRequiredPowerW / 1000).toFixed(2)} kW</strong></div>
          <div><p className="text-xs text-muted-foreground">Limite por fase</p><strong>mín. {(microgridRequiredPerPhaseW / 1000).toFixed(2)} kW/fase</strong></div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">A solução final é validada automaticamente contra a potência nominal, a potência das baterias e o limite de cada fase.</p>
      </div>
      <PhotoUploadField
        label="Foto da etiqueta do inversor ongrid"
        photoUrl={microgrid?.photoUrl ?? null}
        slot="microgrid"
        onUploadPhoto={onUploadPhoto}
        onChange={(photoUrl) => onMicrogridChange({ ...(microgrid ?? emptyMicrogridConfig), photoUrl })}
      />
    </div>
  );
}
