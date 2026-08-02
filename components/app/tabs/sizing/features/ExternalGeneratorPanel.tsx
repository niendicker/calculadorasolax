'use client';

import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DesiredFeatureId, GeneratorConfig, ResidentialGridType } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  generatorActivePowerW,
  isGeneratorPowerInsufficient,
  recommendedGeneratorActivePowerW,
  recommendedGeneratorApparentPowerVA,
} from '../../../helpers';
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

export const emptyGeneratorConfig: GeneratorConfig = {
  voltageV: 220,
  phases: 1,
  apparentPowerVA: 0,
  powerFactor: 0.8,
  safetyMarginW: 1000,
  photoUrl: null,
  ownAtsAcknowledged: false,
};

export function ExternalGeneratorPanel({
  value,
  gridType,
  generator,
  onGeneratorChange,
  peakW,
  onUploadPhoto,
  inverterCatalog,
  availableInverterModels,
  selectedInverterModel,
}: {
  value: DesiredFeatureId[];
  gridType: ResidentialGridType | null;
  generator: GeneratorConfig | null;
  onGeneratorChange: (generator: GeneratorConfig | null) => void;
  peakW: number;
  onUploadPhoto: (file: File, slot: 'ats' | 'microgrid' | 'generator') => Promise<string>;
  inverterCatalog: InverterCatalogOption[];
  availableInverterModels: Set<string> | null;
  selectedInverterModel: string | null;
}) {
  const generatorPowerFactor = generator?.powerFactor ?? 0.8;
  const generatorSafetyMargin = generator?.safetyMarginW ?? 1000;
  const generatorAvailableW = generatorActivePowerW(generator);
  const generatorRecommendedW = recommendedGeneratorActivePowerW(peakW, generatorSafetyMargin);
  const generatorRecommendedVA = recommendedGeneratorApparentPowerVA(peakW, generatorPowerFactor, generatorSafetyMargin);
  const generatorChargingReserveW = Math.max(0, generatorAvailableW - peakW);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-primary/[0.03] px-3 py-2 text-sm">
        <p className="font-medium">Operação combinada</p>
        <p className="mt-1 text-xs text-muted-foreground">O gerador alimenta as cargas e usa a potência restante para carregar as baterias.</p>
      </div>
      <InverterSupportSummary
        flag="external_generator"
          featureLabel="Gerador"
        inverterCatalog={inverterCatalog}
        availableInverterModels={availableInverterModels}
        selectedInverterModel={selectedInverterModel}
      />
      <div className="space-y-1.5">
        <Label>Fases</Label>
        <PhasePicker
          value={generator?.phases ?? 1}
          ariaLabel="Fases do gerador"
          recommendedValues={recommendedPhases(gridType, generator?.phases ?? 1, generator?.voltageV ?? 220, false)}
          onChange={(phases) => {
            const validVoltages = voltageOptionsForPhases(phases).map((option) => option.value);
            const currentVoltage = generator?.voltageV ?? 220;
            onGeneratorChange({
              ...(generator ?? emptyGeneratorConfig),
              phases,
              voltageV: validVoltages.includes(currentVoltage as 220 | 380) ? currentVoltage : validVoltages[0],
            });
          }}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Tensão</Label>
          <VoltagePicker
            value={generator?.voltageV ?? 220}
            phases={generator?.phases ?? 1}
            ariaLabel="Tensão do gerador"
            recommendedValue={recommendedVoltageForPhase(
              gridType,
              generator?.phases ?? 1,
              generator?.voltageV ?? 220,
              false
            )}
            onChange={(voltageV) =>
              onGeneratorChange({
                ...(generator ?? emptyGeneratorConfig),
                voltageV,
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="generatorPower">Potência nominal (kVA)</Label>
          <Input
            id="generatorPower"
            type="number"
            min={0}
            step={0.1}
            placeholder="Ex.: 8,5"
            value={generator?.apparentPowerVA ? generator.apparentPowerVA / 1000 : ''}
            onChange={(event) =>
              onGeneratorChange({
                ...(generator ?? emptyGeneratorConfig),
                apparentPowerVA: (Number(event.target.value) || 0) * 1000,
              })
            }
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="generatorPowerFactor">Fator de potência</Label>
          <Input id="generatorPowerFactor" type="number" min={0.1} max={1} step={0.01}
            value={generatorPowerFactor}
            onChange={(event) => onGeneratorChange({ ...(generator ?? emptyGeneratorConfig), powerFactor: Math.max(0.1, Math.min(1, Number(event.target.value) || 0.8)) })}/>
          <p className="text-xs text-muted-foreground">Use o valor da placa; quando desconhecido, adota-se 0,80.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="generatorMargin">Margem para recarga e operação (kW)</Label>
          <Input id="generatorMargin" type="number" min={0} step={0.1}
            value={generatorSafetyMargin / 1000}
            onChange={(event) => onGeneratorChange({ ...(generator ?? emptyGeneratorConfig), safetyMarginW: Math.max(0, (Number(event.target.value) || 0) * 1000) })}/>
          <p className="text-xs text-muted-foreground">Reserva acima do pico das cargas; recomendação padrão de 1,0 kW.</p>
        </div>
      </div>
      {isGeneratorPowerInsufficient(value, generator, peakW) && (
        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          O gerador fornece aproximadamente {(generatorAvailableW / 1000).toFixed(2)} kW, mas são recomendados {(generatorRecommendedW / 1000).toFixed(2)} kW para cargas e margem. Considere pelo menos {(generatorRecommendedVA / 1000).toFixed(1)} kVA com fator de potência {generatorPowerFactor.toFixed(2)}.
        </p>
      )}
      <PhaseVoltageCompatibilityWarning
        gridType={gridType}
        phases={generator?.phases ?? 1}
        voltageV={generator?.voltageV ?? 220}
        forMicrogrid={false}
      />
      <label
        className={cn(
          'flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
          generator?.ownAtsAcknowledged
            ? 'border-border bg-background'
            : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
        )}
      >
        <input
          type="checkbox"
          className="mt-0.5"
          checked={generator?.ownAtsAcknowledged ?? false}
          onChange={(event) =>
            onGeneratorChange({
              ...(generator ?? emptyGeneratorConfig),
              ownAtsAcknowledged: event.target.checked,
            })
          }
        />
        <span className="flex items-start gap-1.5">
          {!generator?.ownAtsAcknowledged && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>
            {generator?.ownAtsAcknowledged ? (
              <>
                <span className="font-medium">Confirmado:</span> o gerador externo tem a própria chave ATS.
              </>
            ) : (
              <>
                <span className="font-medium">Ciente:</span> O gerador externo precisa ter a própria chave ATS.
              </>
            )}
          </span>
        </span>
      </label>
      <PhotoUploadField
        label="Foto da etiqueta do gerador"
        photoUrl={generator?.photoUrl ?? null}
        slot="generator"
        onUploadPhoto={onUploadPhoto}
        onChange={(photoUrl) => onGeneratorChange({ ...(generator ?? emptyGeneratorConfig), photoUrl })}
      />
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Resumo instantâneo</p>
          <Badge variant="outline" className={cn(isGeneratorPowerInsufficient(value, generator, peakW) ? 'border-destructive/30 text-destructive' : generator?.apparentPowerVA ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
            {!generator?.apparentPowerVA ? 'Potência pendente' : isGeneratorPowerInsufficient(value, generator, peakW) ? 'Abaixo do recomendado' : 'Dentro do limite'}
          </Badge>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Potência ativa</p><strong>{(generatorAvailableW / 1000).toFixed(2)} kW</strong></div>
          <div><p className="text-xs text-muted-foreground">Pico das cargas</p><strong>{(peakW / 1000).toFixed(2)} kW</strong></div>
          <div><p className="text-xs text-muted-foreground">Reserva para recarga</p><strong>{(generatorChargingReserveW / 1000).toFixed(2)} kW</strong></div>
          <div><p className="text-xs text-muted-foreground">Gerador recomendado</p><strong>{(generatorRecommendedVA / 1000).toFixed(1)} kVA</strong></div>
        </div>
      </div>
    </div>
  );
}
