'use client';

import type { ReactNode } from 'react';
import { BatteryCharging, CheckCircle2, CircuitBoard, CircleAlert, Gauge, HousePlug, Info, Layers3, Network, SolarPanel, TrendingUp, Zap, type LucideIcon } from 'lucide-react';
import type { DesiredFeatureId } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import { marginRowIsInsufficient, type MarginRow } from './helpers';

type MetricKey = 'nominal' | 'peak' | 'energy' | 'microgrid' | 'pv' | 'tariff_power' | 'tariff_energy';
type MetricColumn = { key: MetricKey; label: string; icon: LucideIcon };
type EquipmentRow = { label: string; metrics: Partial<Record<MetricKey, MarginRow>> };
type MarginGroup = { label: string; metrics: MetricColumn[]; equipment: EquipmentRow[] };

function resourceForRow(row: MarginRow): string {
  if (row.key.startsWith('white_tariff_')) return 'Tarifa Branca';
  if (row.key.startsWith('microgrid_')) return 'Microrrede';
  if (row.key === 'pv') return 'Fotovoltaico';
  if (row.key.startsWith('backup_')) return 'Backup';
  if (['nominal', 'peak', 'nominal_battery', 'peak_battery', 'energy'].includes(row.key)) {
    return 'Requisitos combinados';
  }
  return 'Outros requisitos';
}

function metricForRow(row: MarginRow): MetricKey {
  if (row.key === 'white_tariff_energy') return 'tariff_energy';
  if (row.key.startsWith('white_tariff_')) return 'tariff_power';
  if (row.key === 'nominal' || row.key === 'nominal_battery' || row.key === 'backup_nominal_inverter' || row.key === 'backup_nominal_battery') return 'nominal';
  if (row.key === 'peak' || row.key === 'peak_battery' || row.key === 'backup_peak_inverter' || row.key === 'backup_peak_battery') return 'peak';
  if (row.key === 'energy' || row.key === 'backup_energy') return 'energy';
  if (row.key.startsWith('microgrid_')) return 'microgrid';
  return 'pv';
}

function metricLabel(key: MetricKey): string {
  const labels: Record<MetricKey, string> = {
    nominal: 'Potência padrão',
    peak: 'Potência máxima',
    energy: 'Energia',
    microgrid: 'Potência do on-grid',
    pv: 'Potência FV máxima',
    tariff_power: 'Potência exigida',
    tariff_energy: 'Energia exigida',
  };
  return labels[key];
}

function metricIcon(key: MetricKey): LucideIcon {
  const icons: Record<MetricKey, LucideIcon> = {
    nominal: Gauge,
    peak: Zap,
    energy: BatteryCharging,
    microgrid: Zap,
    pv: SolarPanel,
    tariff_power: Gauge,
    tariff_energy: BatteryCharging,
  };
  return icons[key];
}

const resourceIcons: Record<string, LucideIcon> = {
    Backup: HousePlug,
    'Requisitos combinados': Layers3,
    Microrrede: Network,
    Fotovoltaico: SolarPanel,
    'Tarifa Branca': TrendingUp,
    Energia: BatteryCharging,
    Dimensionamento: Gauge,
};

function ResourceHeading({ label }: { label: string }) {
  const Icon = resourceIcons[label] ?? Zap;
  const descriptions: Record<string, string> = {
    Backup: 'Atende cargas essenciais quando a rede falha.',
    'Tarifa Branca': 'Atende o consumo no horário de ponta.',
    Fotovoltaico: 'Geração estimada e limite dos inversores.',
    Microrrede: 'Operação em modo de microrrede.',
  };

  return (
    <div className="flex min-w-0 items-start gap-3 lg:flex-col lg:gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div>
          <h3 className="text-left text-lg font-semibold leading-tight text-foreground">
            {label}
          </h3>
        {label !== 'Requisitos combinados' && (
          <p className="mt-1.5 text-xs leading-4 text-muted-foreground">
            {descriptions[label] ?? 'Requisitos do sistema e capacidade disponível na solução.'}
          </p>
        )}
        </div>
      </div>
    </div>
  );
}

const metricColors: Partial<Record<MetricKey, { icon: string; value: string }>> = {
    nominal: {
      icon: 'text-sky-600 dark:text-sky-400',
      value: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    },
    peak: {
      icon: 'text-amber-600 dark:text-amber-400',
      value: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    },
    energy: {
      icon: 'text-emerald-600 dark:text-emerald-400',
      value: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    },
};

function MetricHeading({ metric, combinedRequirement }: { metric: MetricColumn; combinedRequirement: boolean }) {
  const Icon = metric.icon;
  const colors = combinedRequirement ? metricColors[metric.key] : undefined;
  const combinedTooltip: Partial<Record<MetricKey, string>> = {
    nominal: 'Considera o maior requisito de potência padrão entre os recursos ativos: Backup, Tarifa Branca e Microrrede.',
    peak: 'Considera o maior valor entre o pico do Backup e a potência padrão combinada, incluindo Tarifa Branca e Microrrede quando ativas.',
    energy: 'Soma a energia necessária dos recursos ativos: Backup e/ou Tarifa Branca. Microrrede não adiciona uma necessidade de energia.',
  };
  const tooltip = combinedRequirement ? combinedTooltip[metric.key] : undefined;
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="inline-flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', colors?.icon ?? 'text-primary')} aria-hidden="true" />
        {metric.label}
        {tooltip && (
          <Tooltip className="ml-1 inline-flex align-middle" content={tooltip}>
            <Info
              className="inline-block h-[0.75em] w-[0.75em] text-muted-foreground transition-colors hover:text-primary focus-visible:text-primary"
              tabIndex={0}
              aria-label={`Origem do valor de ${metric.label.toLocaleLowerCase()}`}
            />
          </Tooltip>
        )}
      </span>
    </span>
  );
}

function ProjectValue({ row, metric, sourceMetrics, combinedRequirement }: {
  row: MarginRow;
  metric: MetricKey;
  sourceMetrics: MetricKey[];
  combinedRequirement: boolean;
}) {
  const sourceColor = sourceMetrics.length === 1
    ? metricColors[sourceMetrics[0]]?.value
    : sourceMetrics.length > 1
      ? 'bg-gradient-to-r from-sky-500/10 to-amber-500/10 text-foreground'
      : undefined;
  const color = combinedRequirement ? metricColors[metric]?.value : sourceColor;
  return (
    <p className="text-[0.65rem] font-normal text-muted-foreground">
      Projeto{' '}
      <span className={cn('tabular-nums', color && `rounded px-1 py-0.5 font-semibold ${color}`)}>
        {sourceMetrics.length > 0 && <span className="sr-only">Usado no requisito combinado: </span>}
        {formatValue(row.requiredValue, row)}
      </span>
    </p>
  );
}

function equipmentForRow(row: MarginRow): string {
  if (row.key === 'white_tariff_battery' || row.key === 'white_tariff_energy') return 'Bateria';
  if (row.key === 'white_tariff_inverter') return 'Inversor';
  if (row.key.endsWith('_battery') || row.key === 'energy' || row.key === 'backup_energy' || row.key === 'microgrid_battery') return 'Bateria';
  if (row.key === 'pv') return 'Arranjo FV';
  return 'Inversor';
}

const equipmentIcons: Record<string, LucideIcon> = {
  Bateria: BatteryCharging,
  'Arranjo FV': SolarPanel,
  Solução: Layers3,
  Inversor: CircuitBoard,
};

function EquipmentLabel({ label }: { label: string }) {
  const Icon = equipmentIcons[label] ?? Zap;
  return (
    <span className="inline-flex w-full flex-col items-center gap-1 text-center text-xs font-medium text-muted-foreground">
      <Icon className="h-5 w-5 shrink-0 text-primary/80" aria-hidden="true" />
      {label}
    </span>
  );
}

function formatValue(value: number, row: MarginRow): string {
  const scaled = value / 1000;
  const unit = row.unit === 'Wh' ? 'kWh' : row.unit === 'kWp' ? 'kWp' : equipmentForRow(row) === 'Bateria' ? 'kW' : 'kVA';
  return `${scaled.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} ${unit}`;
}

function MarginStatus({ insufficient }: { insufficient: boolean }) {
  const Icon = insufficient ? CircleAlert : CheckCircle2;
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium', insufficient ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {insufficient ? 'Insuficiente' : 'Adequado'}
    </span>
  );
}

function MetricValue({
  row,
  highlight,
  projectValue,
}: {
  row: MarginRow;
  highlight: boolean;
  projectValue?: ReactNode;
}) {
  const delta = row.providedValue - row.requiredValue;
  const insufficient = marginRowIsInsufficient(row);
  return (
    <div className={cn('space-y-1 rounded-md', highlight && 'bg-primary/5 px-2 py-1 ring-1 ring-inset ring-primary/25')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className={cn('text-base font-bold leading-tight tabular-nums', insufficient ? 'text-destructive' : 'text-primary')}>
          {delta < 0 && '−'}{formatValue(Math.abs(delta), row)}
        </span>
        {insufficient && <span className="text-[0.65rem] font-semibold text-destructive">Insuficiente</span>}
        {highlight && <span className="text-[0.65rem] font-semibold text-primary">Menor margem</span>}
      </div>
      {projectValue}
      <p className="text-[0.7rem]">
        <span className="text-muted-foreground">Solução </span>
        <span className="font-medium tabular-nums text-muted-foreground">{formatValue(row.providedValue, row)}</span>
      </p>
    </div>
  );
}

function combinedSourceMetrics(rows: MarginRow[], desiredFeatures: DesiredFeatureId[]): Map<string, MetricKey[]> {
  const sources = new Map<string, MetricKey[]>();
  if (!desiredFeatures.some((feature) => feature === 'backup' || feature === 'microgrid' || feature === 'white_tariff')) return sources;

  const rowsByKey = new Map(rows.map((row) => [row.key, row]));
  const matchesCombinedValue = (sourceKey: string, combinedKey: string) => {
    const sourceValue = rowsByKey.get(sourceKey)?.requiredValue;
    const combinedValue = rowsByKey.get(combinedKey)?.requiredValue;
    return sourceValue != null && combinedValue != null && Math.abs(sourceValue - combinedValue) < 0.001;
  };
  const addSource = (sourceKey: string, metric: MetricKey) => {
    const sourceMetrics = sources.get(sourceKey) ?? [];
    if (!sourceMetrics.includes(metric)) sourceMetrics.push(metric);
    sources.set(sourceKey, sourceMetrics);
  };

  // Power requirements use the largest active source; energy requirements stack.
  for (const sourceKey of ['backup_nominal_inverter', 'white_tariff_inverter', 'microgrid_inverter']) {
    if (matchesCombinedValue(sourceKey, 'nominal')) addSource(sourceKey, 'nominal');
  }
  for (const sourceKey of ['backup_peak_inverter', 'white_tariff_inverter', 'microgrid_inverter']) {
    if (matchesCombinedValue(sourceKey, 'peak')) addSource(sourceKey, 'peak');
  }
  for (const sourceKey of ['backup_energy', 'white_tariff_energy']) {
    if (rowsByKey.has(sourceKey)) addSource(sourceKey, 'energy');
  }

  return sources;
}

export function MarginComparisonTable({
  rows: allRows,
  desiredFeatures,
}: {
  rows: MarginRow[];
  desiredFeatures: DesiredFeatureId[];
}) {
  const hasPowerResource = desiredFeatures.some((feature) =>
    feature === 'backup' || feature === 'microgrid' || feature === 'white_tariff'
  );
  const rows = allRows.filter((row) => hasPowerResource || resourceForRow(row) !== 'Requisitos combinados');
  if (rows.length === 0) return null;

  const groups: MarginGroup[] = [];
  for (const row of rows) {
    const resource = resourceForRow(row);
    let group = groups.find((item) => item.label === resource);
    if (!group) {
      group = { label: resource, metrics: [], equipment: [] };
      groups.push(group);
    }

    const metric = metricForRow(row);
    if (!group.metrics.some((item) => item.key === metric)) {
      group.metrics.push({ key: metric, label: metricLabel(metric), icon: metricIcon(metric) });
    }

    const equipmentLabel = equipmentForRow(row);
    let equipment = group.equipment.find((item) => item.label === equipmentLabel);
    if (!equipment) {
      equipment = { label: equipmentLabel, metrics: {} };
      group.equipment.push(equipment);
    }
    equipment.metrics[metric] = row;
  }

  for (const group of groups) {
    const energyIndex = group.metrics.findIndex((metric) => metric.key === 'energy');
    if (energyIndex >= 0 && energyIndex !== group.metrics.length - 1) {
      const [energyMetric] = group.metrics.splice(energyIndex, 1);
      group.metrics.push(energyMetric);
    }
  }

  if (hasPowerResource) {
    const backupIndex = groups.findIndex((group) => group.label === 'Backup');
    if (backupIndex >= 0) {
      const [backupGroup] = groups.splice(backupIndex, 1);
      const combinedIndex = groups.findIndex((group) => group.label === 'Requisitos combinados');
      if (combinedIndex >= 0) groups.splice(combinedIndex + 1, 0, backupGroup);
      else groups.splice(backupIndex, 0, backupGroup);
    }
  }

  const insufficientCount = rows.filter(marginRowIsInsufficient).length;
  const combinedSources = combinedSourceMetrics(rows, desiredFeatures);
  const lowestMarginKey = rows
    .filter((row) => resourceForRow(row) === 'Requisitos combinados' && row.requiredValue > 0)
    .reduce<{ key: string; marginPct: number } | null>((tightest, row) => {
      const marginPct = ((row.providedValue - row.requiredValue) / row.requiredValue) * 100;
      if (!tightest || marginPct < tightest.marginPct) return { key: row.key, marginPct };
      return tightest;
    }, null)?.key;
  return (
    <div className="space-y-2">
      {insufficientCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2" role="status">
          <div className="flex items-center gap-2">
            <MarginStatus insufficient />
            <span className="text-xs text-muted-foreground">
              {insufficientCount} de {rows.length} verificações precisam de atenção
            </span>
          </div>
          <span className="hidden text-xs font-medium text-destructive sm:inline">Revise os valores destacados</span>
        </div>
      )}
      <div className="space-y-2">
        {groups.map((group) => (
          <section key={group.label} aria-label={group.label} className="overflow-hidden rounded-xl border bg-background lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="bg-muted/10 px-3 py-2 lg:border-r lg:border-border/60 lg:px-4 lg:py-3">
            <ResourceHeading label={group.label} />
            </div>

            <div className="min-w-0">
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">Margens de {group.label.toLocaleLowerCase()} por equipamento</caption>
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="w-20 px-1 pb-1 pt-2"><span className="sr-only">Equipamento</span></th>
                    {group.metrics.map((metric) => (
                        <th key={metric.key} scope="col" className="px-3 pb-1 pt-2 font-medium">
                          <MetricHeading
                            metric={metric}
                            combinedRequirement={group.label === 'Requisitos combinados'}
                          />
                        </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.equipment.map((equipment, equipmentIndex) => (
                    <tr key={equipment.label} className={equipment.label === 'Bateria' ? 'border-t border-border/50' : undefined}>
                    <th scope="row" className={cn('px-1 text-center font-medium', equipmentIndex === 0 ? 'pb-2.5 pt-1' : 'py-2.5')}><EquipmentLabel label={equipment.label} /></th>
                      {group.metrics.map((metric) => {
                        const isSharedEnergy = metric.key === 'energy' || metric.key === 'tariff_energy';
                        const sharedEnergyRow = isSharedEnergy
                          ? group.equipment.find((item) => item.metrics[metric.key])?.metrics[metric.key]
                          : undefined;
                        if (isSharedEnergy && equipmentIndex > 0) return null;

                        const row = isSharedEnergy ? sharedEnergyRow : equipment.metrics[metric.key];
                        const projectRow = group.equipment.find((item) => item.metrics[metric.key])?.metrics[metric.key];
                        return (
                          <td
                            key={metric.key}
                            rowSpan={isSharedEnergy ? group.equipment.length : undefined}
                            className={cn('px-3', equipmentIndex === 0 ? 'pb-2.5 pt-1' : 'py-2.5', isSharedEnergy || equipmentIndex === 0 ? 'align-top' : 'align-middle')}
                          >
                            {row ? (
                              <MetricValue
                                row={row}
                                highlight={row.key === lowestMarginKey}
                                projectValue={row.key === projectRow?.key ? (
                                  <ProjectValue
                                    row={row}
                                    metric={metric.key}
                                    sourceMetrics={combinedSources.get(row.key) ?? []}
                                    combinedRequirement={group.label === 'Requisitos combinados'}
                                  />
                                ) : undefined}
                              />
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden">
              {group.metrics.map((metric) => {
                const projectRow = group.equipment.find((item) => item.metrics[metric.key])?.metrics[metric.key];
                return (
                <section key={metric.key} aria-label={metric.label}>
                  <h4 className="px-3 pb-0.5 pt-2 text-left text-xs font-semibold text-muted-foreground">
                    <MetricHeading
                      metric={metric}
                      combinedRequirement={group.label === 'Requisitos combinados'}
                    />
                  </h4>
                  {group.equipment.map((equipment) => {
                    const row = equipment.metrics[metric.key];
                    if (!row) return null;
                    const isSharedEnergy = metric.key === 'energy' || metric.key === 'tariff_energy';
                    if (isSharedEnergy && equipment.label !== 'Bateria') return null;
                    return (
                      <div key={equipment.label} className={cn('flex items-start justify-between gap-3 px-3 pb-1.5', row.key === projectRow?.key ? 'pt-0.5' : 'pt-1.5')}>
                        <span className="w-20 shrink-0 pt-0.5"><EquipmentLabel label={isSharedEnergy ? 'Solução' : equipment.label} /></span>
                        <MetricValue
                          row={row}
                          highlight={row.key === lowestMarginKey}
                          projectValue={row.key === projectRow?.key ? (
                            <ProjectValue
                              row={row}
                              metric={metric.key}
                              sourceMetrics={combinedSources.get(row.key) ?? []}
                              combinedRequirement={group.label === 'Requisitos combinados'}
                            />
                          ) : undefined}
                        />
                      </div>
                    );
                  })}
                </section>
                );
              })}
            </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
