'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  CheckCircle2,
  ClipboardList,
  ArrowRight,
  Fuel,
  HousePlug,
  AlertTriangle,
  Network,
  ShieldCheck,
  SolarPanel,
  TrendingUp,
  X,
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
import { defaultMicrogridPhaseVoltage, defaultPhaseVoltageForGridType } from './PhaseVoltagePicker';

export const featureIcons: Record<DesiredFeatureId, LucideIcon> = {
  backup: HousePlug,
  external_ats: ShieldCheck,
  microgrid: Network,
  external_generator: Fuel,
  pv: SolarPanel,
  white_tariff: TrendingUp,
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
  onFeatureDisabled,
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
  onFeatureDisabled?: () => void;
}) {
  const tabs = DESIRED_FEATURE_DEFINITIONS;
  const activeFeature = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const ActiveFeatureIcon = featureIcons[activeTab];
  const isBackupTab = activeTab === 'backup';
  const isActiveEnabled = value.includes(activeTab);
  const [pendingFeature, setPendingFeature] = useState<'microgrid' | 'external_generator' | null>(null);
  const [mounted, setMounted] = useState(false);
  const featureToggleRef = useRef<HTMLButtonElement | null>(null);
  const confirmationDialogRef = useRef<HTMLDivElement | null>(null);
  const confirmationCancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmationTitleId = useId();
  const confirmationDescriptionId = useId();
  const confirmationWarningId = useId();
  const closeConfirmation = useCallback(() => {
    setPendingFeature(null);
    requestAnimationFrame(() => featureToggleRef.current?.focus());
  }, []);

  // Render the confirmation through a portal only after mount so the picker
  // remains SSR-safe.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!pendingFeature) return;

    function getFocusableElements() {
      return Array.from(
        confirmationDialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeConfirmation();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => confirmationCancelRef.current?.focus());
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeConfirmation, pendingFeature]);

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

  function seedFeatureConfig(id: DesiredFeatureId) {
    if (id === 'white_tariff' && !whiteTariff) onWhiteTariffChange(emptyWhiteTariffConfig);
    if (id === 'microgrid' && !microgrid) {
      const defaults = defaultMicrogridPhaseVoltage(gridType);
      onMicrogridChange({ ...emptyMicrogridConfig, onGridPhases: defaults.phases, voltageV: defaults.voltage });
    }
    if (id === 'external_generator' && !generator) {
      const defaults = defaultPhaseVoltageForGridType(gridType);
      onGeneratorChange({ ...emptyGeneratorConfig, phases: defaults.phases, voltageV: defaults.voltage });
    }
    if (id === 'pv' && !pv) onPvChange(emptyPvConfig);
  }

  function enableFeature(id: DesiredFeatureId, replacedFeature?: 'microgrid' | 'external_generator') {
    const nextValue = value.filter((item) => item !== replacedFeature);
    onChange(nextValue.includes(id) ? nextValue : [...nextValue, id]);

    if (replacedFeature === 'microgrid') onMicrogridChange(null);
    if (replacedFeature === 'external_generator') onGeneratorChange(null);
    seedFeatureConfig(id);
  }

  function toggle(id: DesiredFeatureId) {
    if (value.includes(id)) {
      onChange(value.filter((item) => item !== id));
      if (id === 'white_tariff') onWhiteTariffChange(null);
      if (id === 'microgrid') onMicrogridChange(null);
      if (id === 'external_generator') onGeneratorChange(null);
      if (id === 'pv') onPvChange(null);
      onFeatureDisabled?.();
    } else {
      const conflictingFeature = id === 'microgrid'
        ? 'external_generator'
        : id === 'external_generator'
          ? 'microgrid'
          : null;
      if (conflictingFeature && value.includes(conflictingFeature)) {
        if (id === 'microgrid' || id === 'external_generator') setPendingFeature(id);
        return;
      }
      enableFeature(id);
    }
  }

  function confirmFeatureSwitch() {
    if (!pendingFeature) return;
    const replacedFeature = pendingFeature === 'microgrid' ? 'external_generator' : 'microgrid';
    enableFeature(pendingFeature, replacedFeature);
    closeConfirmation();
  }

  const conflictingFeature = activeTab === 'microgrid'
    ? 'external_generator'
    : activeTab === 'external_generator'
      ? 'microgrid'
      : null;
  const hasConflictingFeature = Boolean(conflictingFeature && value.includes(conflictingFeature));
  const conflictingFeatureLabel = conflictingFeature
    ? tabs.find((tab) => tab.id === conflictingFeature)?.label
    : null;
  const featureToRemove = pendingFeature === 'microgrid' ? 'Gerador' : 'Microrrede';
  const featureToEnable = pendingFeature === 'microgrid' ? 'Microrrede' : 'Gerador';
  const hasConfigToRemove = pendingFeature === 'microgrid' ? Boolean(generator) : Boolean(microgrid);

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
      <div className="space-y-4 rounded-xl border bg-background p-4">
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
              {(!isBackupTab || isActiveEnabled) && (
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
              )}
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
            {hasConflictingFeature && conflictingFeatureLabel && (
              <p role="status" aria-live="polite" className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {activeFeature.label} não é compatível com {conflictingFeatureLabel}. Ao habilitar, a configuração atual de {conflictingFeatureLabel} será removida.
              </p>
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
              ref={featureToggleRef}
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

        {isBackupTab && isActiveEnabled && <div className="space-y-3">
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
      {pendingFeature && mounted && createPortal(
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 p-4"
          aria-hidden={false}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeConfirmation();
          }}
        >
          <div
            ref={confirmationDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={confirmationTitleId}
            aria-describedby={hasConfigToRemove ? `${confirmationDescriptionId} ${confirmationWarningId}` : confirmationDescriptionId}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border bg-card text-card-foreground shadow-2xl"
          >
            <div className="flex items-start gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <ArrowRight className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={confirmationTitleId} className="text-lg font-semibold leading-6">Substituir {featureToRemove} por {featureToEnable}?</h2>
                <p id={confirmationDescriptionId} className="mt-1.5 text-sm leading-5 text-muted-foreground">
                  Para habilitar {featureToEnable}, {featureToRemove} será desativado.
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Fechar confirmação" onClick={closeConfirmation}>
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="space-y-4 px-5 py-5 sm:px-6">
              <div className="rounded-lg border bg-muted/30 p-3.5">
                <p className="text-xs font-semibold text-muted-foreground">Esta ação afeta</p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Será desativado</p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-destructive">{featureToRemove}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1 text-right">
                    <p className="text-xs text-muted-foreground">Será habilitado</p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-primary">{featureToEnable}</p>
                  </div>
                </div>
              </div>
              {hasConfigToRemove && (
                <p id={confirmationWarningId} className="flex items-start gap-2 text-sm leading-5">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                  <span>Os dados preenchidos de {featureToRemove} serão apagados. Essa ação não pode ser desfeita.</span>
                </p>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t bg-muted/20 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <Button ref={confirmationCancelRef} type="button" variant="outline" className="h-10 w-full sm:w-auto md:h-10" onClick={closeConfirmation}>
                Cancelar
              </Button>
              <Button type="button" variant="destructive" className="h-10 w-full border-destructive/30 whitespace-normal text-center leading-4 sm:w-auto md:h-10" onClick={confirmFeatureSwitch}>
                Substituir por {featureToEnable}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
