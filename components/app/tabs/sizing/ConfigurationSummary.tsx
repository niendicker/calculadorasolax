'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Battery, BatteryCharging, Boxes, Cable, ChevronRight, Fuel, Layers, ListChecks, Network, Receipt, SolarPanel, Zap } from 'lucide-react';
import { DESIRED_FEATURE_DEFINITIONS } from '@/lib/desired-features';
import type {
  BatteryTopology,
  DesiredFeatureId,
  GeneratorConfig,
  MicrogridConfig,
  PvConfig,
  ResidentialGridType,
  WhiteTariffConfig,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { gridLabels, topologyLabels, type InverterCatalogOption } from '../../types';
import { desiredFeatureHasPendingIssue } from './feature-status';

function SummaryGroup({ title, icon: Icon, children }: { title: string; icon: typeof Boxes; children: ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 px-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {title}
      </p>
      <div className="mt-1 space-y-0.5">{children}</div>
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  done,
  alertLevel,
  hasIssue,
  onClick,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  done: boolean;
  /** 'critical' blocks calculation (styled destructive/red); 'warning' is just
   * worth a second look, e.g. an auto-selected inverter (styled amber). */
  alertLevel?: 'critical' | 'warning';
  /** Pending issue on an enabled feature (see desiredFeatureHasPendingIssue) —
   * turns this row's own icon red instead of swapping it for a triangle, so
   * the feature stays identifiable at a glance while flagged. */
  hasIssue?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {alertLevel ? (
        <AlertTriangle
          className={cn(
            'h-4 w-4 shrink-0',
            alertLevel === 'critical' ? 'text-destructive' : 'text-yellow-500 dark:text-yellow-400'
          )}
          aria-hidden="true"
        />
      ) : (
        <Icon
          className={cn('h-4 w-4 shrink-0', hasIssue ? 'text-destructive' : done ? 'text-primary' : 'text-muted-foreground/50')}
          aria-hidden="true"
        />
      )}
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
      <Badge variant={done ? 'secondary' : 'outline'} className="min-w-0 max-w-[55%] shrink">
        <span className="truncate">{value}</span>
      </Badge>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

const featureIcons: Record<DesiredFeatureId, typeof Boxes> = {
  backup: BatteryCharging,
  external_ats: Cable,
  microgrid: Network,
  external_generator: Fuel,
  pv: SolarPanel,
  white_tariff: Receipt,
};

/** Always-visible, grouped snapshot of every selection made across the
 * Funcionalidades e Configurações tabs, each row jumping straight back to
 * the control that set it — so the user doesn't have to hunt for where a
 * given setting lives. Icons identify each row at a glance, and the current
 * value reads as a tag rather than plain text. */
export function ConfigurationSummary({
  residentialOptions,
  loadsCount,
  onJumpToGridType,
  onJumpToBattery,
  onJumpToFeature,
  peakW,
  inverterCatalog,
  availableInverterModels,
}: {
  residentialOptions: {
    topology: BatteryTopology | null;
    batteryModel: string | null;
    inverterModel: string | null;
    gridType: ResidentialGridType | null;
    desiredFeatures: DesiredFeatureId[];
    whiteTariff: WhiteTariffConfig | null;
    microgrid: MicrogridConfig | null;
    generator: GeneratorConfig | null;
    pv: PvConfig | null;
    atsPhotoUrl: string | null;
    atsBackupAcknowledged: boolean;
  };
  loadsCount: number;
  onJumpToGridType: () => void;
  onJumpToBattery: () => void;
  onJumpToFeature: (id: DesiredFeatureId) => void;
  peakW: number;
  inverterCatalog: InverterCatalogOption[];
  availableInverterModels: Set<string> | null;
}) {
  const {
    topology,
    batteryModel,
    gridType,
    inverterModel,
    desiredFeatures,
    whiteTariff,
    microgrid,
    generator,
    pv,
    atsPhotoUrl,
    atsBackupAcknowledged,
  } = residentialOptions;

  function featureValue(id: DesiredFeatureId): string {
    if (!desiredFeatures.includes(id)) return 'Desativado';
    switch (id) {
      case 'backup':
        return `${loadsCount} ${loadsCount === 1 ? 'carga' : 'cargas'}`;
      case 'external_ats':
        return atsPhotoUrl ? 'Ativado · foto anexada' : 'Ativado · sem foto';
      case 'microgrid':
        return microgrid?.onGridApparentPowerVA ? `Ativado · ${microgrid.onGridApparentPowerVA} VA` : 'Ativado';
      case 'external_generator':
        return generator?.apparentPowerVA ? `Ativado · ${generator.apparentPowerVA} VA` : 'Ativado';
      case 'white_tariff':
        return whiteTariff?.pontaTariffPerKwh || whiteTariff?.intermediateTariffPerKwh || whiteTariff?.foraPontaTariffPerKwh
          ? `Ativado · R$ ${whiteTariff.pontaTariffPerKwh}/${whiteTariff.intermediateTariffPerKwh}/${whiteTariff.foraPontaTariffPerKwh} por kWh`
          : 'Ativado';
      default:
        return 'Ativado';
    }
  }

  return (
    <div className="space-y-3">
      <SummaryGroup title="Rede & inversor" icon={Zap}>
        <SummaryRow
          icon={Zap}
          label="Tipo de rede"
          value={gridType ? gridLabels[gridType] : 'Não selecionado'}
          done={Boolean(gridType)}
          onClick={onJumpToGridType}
        />
        <SummaryRow
          icon={Boxes}
          label="Inversor"
          value={inverterModel ?? 'Automático'}
          done={Boolean(inverterModel)}
          alertLevel={!inverterModel ? 'warning' : undefined}
          onClick={onJumpToGridType}
        />
      </SummaryGroup>
      <SummaryGroup title="Modelo de bateria" icon={Battery}>
        <SummaryRow
          icon={Layers}
          label="Topologia"
          value={topology ? topologyLabels[topology] : 'Não selecionada'}
          done={Boolean(topology)}
          onClick={onJumpToBattery}
        />
        <SummaryRow
          icon={Battery}
          label="Bateria"
          value={batteryModel ?? 'Não selecionado'}
          done={Boolean(batteryModel)}
          alertLevel={!batteryModel ? 'critical' : undefined}
          onClick={onJumpToBattery}
        />
      </SummaryGroup>
      <SummaryGroup title="Funcionalidades" icon={ListChecks}>
        {DESIRED_FEATURE_DEFINITIONS.map((feature) => (
          <SummaryRow
            key={feature.id}
            icon={featureIcons[feature.id]}
            label={feature.label}
            value={featureValue(feature.id)}
            done={desiredFeatures.includes(feature.id)}
            hasIssue={desiredFeatureHasPendingIssue(feature.id, desiredFeatures, {
              microgrid,
              generator,
              pv,
              atsBackupAcknowledged,
              gridType,
              peakW,
              loadsCount,
              inverterCatalog,
              availableInverterModels,
              selectedInverterModel: inverterModel,
            })}
            onClick={() => onJumpToFeature(feature.id)}
          />
        ))}
      </SummaryGroup>
    </div>
  );
}
