'use client';

import {
  BatteryCharging,
  Check,
  Clock,
  Fuel,
  Gauge,
  HousePlug,
  AlertTriangle,
  Layers,
  Network,
  ShieldCheck,
  Sun,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadSelector } from '@/components/wizard/LoadSelector';
import { DESIRED_FEATURE_DEFINITIONS } from '@/lib/desired-features';
import type {
  DesiredFeatureId,
  GeneratorConfig,
  MicrogridConfig,
  PvConfig,
  ResidentialGridType,
  WhiteTariffConfig,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import type { InverterCatalogOption } from '../../types';
import { desiredFeatureHasPendingIssue } from './feature-status';
import { ExternalAtsPanel } from './features/ExternalAtsPanel';
import { emptyGeneratorConfig, ExternalGeneratorPanel } from './features/ExternalGeneratorPanel';
import { emptyMicrogridConfig, MicrogridPanel } from './features/MicrogridPanel';
import { emptyPvConfig, PvPanel } from './features/PvPanel';
import { emptyWhiteTariffConfig, WhiteTariffPanel } from './features/WhiteTariffPanel';
import { defaultPhaseVoltageForGridType } from './PhaseVoltagePicker';

export const featureIcons: Record<DesiredFeatureId, LucideIcon> = {
  backup: HousePlug,
  external_ats: ShieldCheck,
  microgrid: Network,
  external_generator: Fuel,
  pv: Sun,
  white_tariff: Clock,
};

export function DesiredFeaturesPicker({
  activeTab,
  value,
  onChange,
  whiteTariff,
  onWhiteTariffChange,
  microgrid,
  onMicrogridChange,
  generator,
  onGeneratorChange,
  pv,
  onPvChange,
  atsPhotoUrl,
  onAtsPhotoUrlChange,
  atsBackupAcknowledged,
  onAtsBackupAcknowledgedChange,
  onUploadPhoto,
  loadsCount,
  operationHours,
  inverterCatalog,
  availableInverterModels,
  selectedInverterModel,
  gridType,
  peakW,
  nominalW,
  dailyKwh,
}: {
  activeTab: DesiredFeatureId;
  value: DesiredFeatureId[];
  onChange: (value: DesiredFeatureId[]) => void;
  whiteTariff: WhiteTariffConfig | null;
  onWhiteTariffChange: (whiteTariff: WhiteTariffConfig | null) => void;
  microgrid: MicrogridConfig | null;
  onMicrogridChange: (microgrid: MicrogridConfig | null) => void;
  generator: GeneratorConfig | null;
  onGeneratorChange: (generator: GeneratorConfig | null) => void;
  pv: PvConfig | null;
  onPvChange: (pv: PvConfig | null) => void;
  atsPhotoUrl: string | null;
  onAtsPhotoUrlChange: (atsPhotoUrl: string | null) => void;
  atsBackupAcknowledged: boolean;
  onAtsBackupAcknowledgedChange: (atsBackupAcknowledged: boolean) => void;
  onUploadPhoto: (file: File, slot: 'ats' | 'microgrid' | 'generator') => Promise<string>;
  loadsCount: number;
  operationHours: number;
  inverterCatalog: InverterCatalogOption[];
  availableInverterModels: Set<string> | null;
  selectedInverterModel: string | null;
  gridType: ResidentialGridType | null;
  peakW: number;
  nominalW: number;
  dailyKwh: number;
}) {
  const tabs = DESIRED_FEATURE_DEFINITIONS;
  const activeFeature = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const ActiveFeatureIcon = featureIcons[activeTab];
  const isBackupTab = activeTab === 'backup';
  const isActiveEnabled = value.includes(activeTab);

  function hasPendingIssue(id: DesiredFeatureId): boolean {
    return desiredFeatureHasPendingIssue(id, value, {
      microgrid,
      generator,
      pv,
      whiteTariff,
      atsBackupAcknowledged,
      gridType,
      peakW,
      loadsCount,
      operationHours,
      inverterCatalog,
      availableInverterModels,
      selectedInverterModel,
    });
  }

  function toggle(id: DesiredFeatureId) {
    if (value.includes(id)) {
      onChange(value.filter((item) => item !== id));
      if (id === 'white_tariff') onWhiteTariffChange(null);
      if (id === 'microgrid') onMicrogridChange(null);
      if (id === 'external_generator') onGeneratorChange(null);
      if (id === 'pv') onPvChange(null);
    } else {
      onChange([...value, id]);
      if (id === 'white_tariff' && !whiteTariff) onWhiteTariffChange(emptyWhiteTariffConfig);
      if (id === 'microgrid' && !microgrid) {
        const defaults = defaultPhaseVoltageForGridType(gridType);
        onMicrogridChange({ ...emptyMicrogridConfig, onGridPhases: defaults.phases, voltageV: defaults.voltage });
      }
      if (id === 'external_generator' && !generator) {
        const defaults = defaultPhaseVoltageForGridType(gridType);
        onGeneratorChange({ ...emptyGeneratorConfig, phases: defaults.phases, voltageV: defaults.voltage });
      }
      if (id === 'pv' && !pv) onPvChange(emptyPvConfig);
    }
  }

  const activeFeatureHasPendingIssue = hasPendingIssue(activeTab);
  const activeFeatureStatus = activeFeatureHasPendingIssue
    ? 'Requer atenção'
    : activeTab === 'white_tariff' && isActiveEnabled
      ? 'Configuração completa'
      : isActiveEnabled
        ? 'Ativo'
        : 'Desativado';

  return (
    <div className="space-y-3">
      {/* The Backup tab's own content (LoadSelector) is already a rich set of
       * bordered sections on its own — wrapping it in another card here just
       * nests boxes. Every other feature tab is simple enough (description +
       * toggle, maybe one config panel) to still want the card framing. */}
      <div className={cn('space-y-4', !isBackupTab && 'rounded-xl border bg-background p-4')}>
        <div className={cn('flex items-start justify-between gap-3', isActiveEnabled && 'border-b pb-4')}>
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground',
                isActiveEnabled && 'bg-primary/10 text-primary'
              )}
            >
              <ActiveFeatureIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold">{activeFeature.label}</p>
              <Badge
                variant="outline"
                className={cn(
                  activeFeatureHasPendingIssue
                    ? 'border-destructive/30 bg-destructive/5 text-destructive'
                    : isActiveEnabled
                      ? 'border-primary/30 bg-primary/5 text-primary'
                      : 'text-muted-foreground'
                )}
              >
                {activeFeatureStatus}
              </Badge>
            </div>
            {isBackupTab ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Selecione os equipamentos que precisam permanecer ligados durante uma falta de energia.
              </p>
            ) : (
              activeFeature.description && (
                <p className="mt-1 text-xs text-muted-foreground">{activeFeature.description}</p>
              )
            )}
            {activeFeatureHasPendingIssue && activeTab === 'white_tariff' && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Complete os dados necessários para calcular a Tarifa Branca.
              </p>
            )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant={isActiveEnabled ? 'secondary' : 'outline'}
              size="sm"
              className="min-w-28"
              aria-pressed={isActiveEnabled}
              onClick={() => toggle(activeTab)}
            >
              {isActiveEnabled ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Habilitado
                </>
              ) : (
                'Habilitar'
              )}
            </Button>
          </div>
        </div>

        {isBackupTab && (
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border bg-background px-3 py-2 text-sm"
            role="group"
            aria-label="Resumo das cargas cadastradas"
          >
            <span className="flex items-baseline gap-1.5">
              <Gauge className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground" aria-hidden="true" />
              <strong className="tabular-nums">{(nominalW / 1000).toFixed(2)}</strong>
              <span className="text-xs text-muted-foreground">kVA nominal</span>
            </span>
            <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
            <span className="flex items-baseline gap-1.5">
              <Zap className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground" aria-hidden="true" />
              <strong className="tabular-nums">{(peakW / 1000).toFixed(2)}</strong>
              <span className="text-xs text-muted-foreground">kVA máxima</span>
            </span>
            <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
            <span className="flex items-baseline gap-1.5">
              <BatteryCharging className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground" aria-hidden="true" />
              <strong className="tabular-nums">{dailyKwh.toFixed(2)}</strong>
              <span className="text-xs text-muted-foreground">kWh/dia</span>
            </span>
            <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
            <span className="flex items-baseline gap-1.5">
              <Layers className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground" aria-hidden="true" />
              <strong className="tabular-nums">{loadsCount}</strong>
              <span className="text-xs text-muted-foreground">{loadsCount === 1 ? 'carga' : 'cargas'}</span>
            </span>
          </div>
        )}

        {isBackupTab && isActiveEnabled && loadsCount === 0 && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-amber-800 dark:text-amber-300"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">Nenhuma carga adicionada ao projeto</p>
              <p className="mt-0.5 text-xs">Adicione ao menos uma carga abaixo para dimensionar o backup.</p>
            </div>
          </div>
        )}

        {isBackupTab && isActiveEnabled && <LoadSelector defaultToMine />}

        {isActiveEnabled && activeTab === 'external_ats' && (
          <ExternalAtsPanel
            inverterCatalog={inverterCatalog}
            availableInverterModels={availableInverterModels}
            selectedInverterModel={selectedInverterModel}
            atsBackupAcknowledged={atsBackupAcknowledged}
            onAtsBackupAcknowledgedChange={onAtsBackupAcknowledgedChange}
            atsPhotoUrl={atsPhotoUrl}
            onAtsPhotoUrlChange={onAtsPhotoUrlChange}
            onUploadPhoto={onUploadPhoto}
          />
        )}

        {isActiveEnabled && activeTab === 'white_tariff' && (
          <WhiteTariffPanel
            value={value}
            dailyKwh={dailyKwh}
            whiteTariff={whiteTariff}
            onWhiteTariffChange={onWhiteTariffChange}
            pv={pv}
          />
        )}

        {isActiveEnabled && activeTab === 'microgrid' && (
          <MicrogridPanel
            gridType={gridType}
            microgrid={microgrid}
            onMicrogridChange={onMicrogridChange}
            inverterCatalog={inverterCatalog}
            availableInverterModels={availableInverterModels}
            selectedInverterModel={selectedInverterModel}
            onUploadPhoto={onUploadPhoto}
          />
        )}

        {isActiveEnabled && activeTab === 'external_generator' && (
          <ExternalGeneratorPanel
            value={value}
            gridType={gridType}
            generator={generator}
            onGeneratorChange={onGeneratorChange}
            peakW={peakW}
            onUploadPhoto={onUploadPhoto}
            inverterCatalog={inverterCatalog}
            availableInverterModels={availableInverterModels}
            selectedInverterModel={selectedInverterModel}
          />
        )}

        {isActiveEnabled && activeTab === 'pv' && <PvPanel pv={pv} onPvChange={onPvChange} />}
      </div>
    </div>
  );
}
