'use client';

import {
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Fuel,
  HousePlug,
  AlertTriangle,
  Network,
  ShieldCheck,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OperationHoursControl } from '@/components/wizard/LoadSelector';
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
  dailyKwh,
  onOpenLoads,
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
  dailyKwh: number;
  onOpenLoads?: () => void;
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
    : activeTab === 'backup' && isActiveEnabled
      ? 'Configurado'
    : activeTab === 'white_tariff' && isActiveEnabled
      ? 'Configuração completa'
      : isActiveEnabled
        ? 'Ativo'
        : 'Desativado';

  return (
    <div className="space-y-3">
      {/* Backup keeps only its activation and autonomy settings here. Load
       * management lives in the dedicated Workspace Cargas section. */}
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
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-xs font-medium',
                  activeFeatureHasPendingIssue
                    ? 'text-amber-600'
                    : activeFeatureStatus === 'Configurado' || activeFeatureStatus === 'Configuração completa'
                      ? 'text-emerald-600'
                      : isActiveEnabled
                        ? 'text-primary'
                        : 'text-muted-foreground'
                )}
              >
                {activeFeatureHasPendingIssue && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
                {!activeFeatureHasPendingIssue && activeFeatureStatus === 'Configurado' && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                {activeFeatureStatus}
              </span>
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
              variant={isActiveEnabled ? 'secondary' : 'default'}
              size="default"
              className="min-h-10 min-w-32 px-4"
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

        {isBackupTab && <div className="space-y-3">
          <OperationHoursControl />
          {onOpenLoads && <Button type="button" variant="outline" onClick={onOpenLoads}>
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            Revisar cargas ({loadsCount})
          </Button>}
        </div>}

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
