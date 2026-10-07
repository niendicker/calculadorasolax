'use client';

import { BatteryCharging, CheckCircle2, CircleAlert, Gauge, HousePlug, Network, SolarPanel, TrendingUp, Zap, type LucideIcon } from 'lucide-react';
import type { DesiredFeatureId } from '@/lib/types';
import { cn } from '@/lib/utils';
import { marginRowIsInsufficient, type MarginRow } from './helpers';

type MetricKey = 'nominal' | 'peak' | 'energy' | 'microgrid' | 'pv' | 'tariff_power' | 'tariff_energy';
type MetricColumn = { key: MetricKey; label: string; icon: LucideIcon };
type EquipmentRow = { label: string; metrics: Partial<Record<MetricKey, MarginRow>> };
type MarginGroup = { label: string; metrics: MetricColumn[]; equipment: EquipmentRow[] };

function resourceForRow(row: MarginRow, desiredFeatures: DesiredFeatureId[]): string {
  if (row.key.startsWith('white_tariff_')) return 'Tarifa Branca';
  if (row.key.startsWith('microgrid_')) return 'Microrrede';
  if (row.key === 'pv') return 'Fotovoltaico';
  if (row.key.startsWith('backup_')) return 'Backup';
  if (row.key === 'nominal' || row.key === 'peak' || row.key.endsWith('_battery') || row.key === 'energy') {
    if (desiredFeatures.includes('backup') && desiredFeatures.includes('white_tariff')) {
      return 'Requisitos combinados';
    }
    if (desiredFeatures.includes('backup')) return 'Backup';
    if (desiredFeatures.includes('white_tariff')) return 'Tarifa Branca';
    return row.key === 'energy' ? 'Energia' : 'Dimensionamento';
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

function resourceIcon(label: string): LucideIcon {
  const icons: Record<string, LucideIcon> = {
    Backup: HousePlug,
    Microrrede: Network,
    Fotovoltaico: SolarPanel,
    'Tarifa Branca': TrendingUp,
    Energia: BatteryCharging,
    Dimensionamento: Gauge,
  };
  return icons[label] ?? Zap;
}

function ResourceHeading({ label }: { label: string }) {
  const Icon = resourceIcon(label);
  return (
    <div className="flex items-center gap-2 lg:flex-col lg:items-start lg:gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary lg:h-9 lg:w-9">
        <Icon className="h-4 w-4 lg:h-[18px] lg:w-[18px]" aria-hidden="true" />
      </span>
      <h3 className="text-left text-sm font-semibold text-foreground">{label}</h3>
    </div>
  );
}

function MetricHeading({ metric }: { metric: MetricColumn }) {
  const Icon = metric.icon;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      {metric.label}
    </span>
  );
}

function CombinedRequirementsNote() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-primary/10 bg-primary/[0.035] px-3 py-2 lg:px-4">
      <span className="inline-flex items-center gap-1 text-[0.7rem] font-medium text-foreground">
        <HousePlug className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        Backup
        <span className="text-muted-foreground" aria-hidden="true">+</span>
        <TrendingUp className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        Tarifa Branca
      </span>
      <span className="text-[0.65rem] text-muted-foreground">
        Potência considera o maior requisito; energia soma os dois.
      </span>
    </div>
  );
}

function equipmentForRow(row: MarginRow): string {
  if (row.key === 'white_tariff_battery' || row.key === 'white_tariff_energy') return 'Bateria';
  if (row.key === 'white_tariff_inverter') return 'Inversor';
  if (row.key.endsWith('_battery') || row.key === 'energy' || row.key === 'backup_energy' || row.key === 'microgrid_battery') return 'Bateria';
  if (row.key === 'pv') return 'Arranjo FV';
  return 'Inversor';
}

function equipmentIcon(label: string): LucideIcon {
  if (label === 'Bateria') return BatteryCharging;
  if (label === 'Arranjo FV') return SolarPanel;
  return Zap;
}

function EquipmentLabel({ label }: { label: string }) {
  const Icon = equipmentIcon(label);
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
  return `${scaled.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${unit}`;
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

function MetricValue({ row, highlight }: { row: MarginRow; highlight: boolean }) {
  const delta = row.providedValue - row.requiredValue;
  const insufficient = marginRowIsInsufficient(row);
  return (
    <div className={cn('space-y-1 rounded-md', highlight && 'bg-primary/5 px-2 py-1.5 ring-1 ring-inset ring-primary/25')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className={cn('font-bold tabular-nums', insufficient ? 'text-destructive' : 'text-primary')}>
          {delta >= 0 ? '+' : '-'}{formatValue(Math.abs(delta), row)}
        </span>
        {insufficient && <span className="text-[0.65rem] font-semibold text-destructive">Insuficiente</span>}
        {highlight && <span className="text-[0.65rem] font-semibold text-primary">Menor margem</span>}
      </div>
      <p className="text-[0.7rem]">
        <span className="text-muted-foreground">Projeto </span>
        <span className="font-medium tabular-nums text-muted-foreground">{formatValue(row.requiredValue, row)}</span>
        <span className="px-1.5 text-muted-foreground" aria-hidden="true">·</span>
        <span className="text-muted-foreground">Solução </span>
        <span className="font-medium tabular-nums text-muted-foreground">{formatValue(row.providedValue, row)}</span>
      </p>
    </div>
  );
}

export function MarginComparisonTable({
  rows,
  desiredFeatures,
}: {
  rows: MarginRow[];
  desiredFeatures: DesiredFeatureId[];
}) {
  if (rows.length === 0) return null;

  const groups: MarginGroup[] = [];
  for (const row of rows) {
    const resource = resourceForRow(row, desiredFeatures);
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

  if (desiredFeatures.includes('backup') && desiredFeatures.includes('white_tariff')) {
    const backupIndex = groups.findIndex((group) => group.label === 'Backup');
    if (backupIndex >= 0) {
      const [backupGroup] = groups.splice(backupIndex, 1);
      const combinedIndex = groups.findIndex((group) => group.label === 'Requisitos combinados');
      if (combinedIndex >= 0) groups.splice(combinedIndex + 1, 0, backupGroup);
      else groups.splice(backupIndex, 0, backupGroup);
    }
  }

  const insufficientCount = rows.filter(marginRowIsInsufficient).length;
  const lowestMarginKey = rows
    .filter((row) => resourceForRow(row, desiredFeatures) === 'Requisitos combinados' && row.requiredValue > 0)
    .reduce<{ key: string; marginPct: number } | null>((tightest, row) => {
      const marginPct = ((row.providedValue - row.requiredValue) / row.requiredValue) * 100;
      if (!tightest || marginPct < tightest.marginPct) return { key: row.key, marginPct };
      return tightest;
    }, null)?.key;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5',
          insufficientCount > 0
            ? 'border-destructive/30 bg-destructive/5'
            : 'border-emerald-600/20 bg-emerald-600/5 dark:border-emerald-400/20 dark:bg-emerald-400/5'
        )}
        role="status"
      >
        <div className="flex items-center gap-2">
          <MarginStatus insufficient={insufficientCount > 0} />
          <span className="text-xs text-muted-foreground">
            {insufficientCount > 0
              ? `${insufficientCount} de ${rows.length} verificações precisam de atenção`
              : `${rows.length} verificações atendidas`}
          </span>
        </div>
        {insufficientCount > 0 && (
          <span className="hidden text-xs font-medium text-destructive sm:inline">Revise os valores destacados</span>
        )}
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <section key={group.label} aria-label={group.label} className="overflow-hidden rounded-lg border bg-background lg:grid lg:grid-cols-[140px_minmax(0,1fr)]">
            <div className="border-b bg-muted/30 px-3 py-2.5 lg:border-b-0 lg:border-r lg:px-4 lg:py-4">
              <ResourceHeading label={group.label} />
            </div>

            <div className="min-w-0">
            {group.label === 'Requisitos combinados' && <CombinedRequirementsNote />}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">Margens de {group.label.toLocaleLowerCase()} por equipamento</caption>
                <thead className="bg-muted/20 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="w-32 px-3 py-2"><span className="sr-only">Equipamento</span></th>
                    {group.metrics.map((metric) => (
                      <th key={metric.key} scope="col" className="px-3 py-2 font-medium"><MetricHeading metric={metric} /></th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.equipment.map((equipment) => (
                    <tr key={equipment.label} className="border-t border-border/60">
                    <th scope="row" className="px-3 py-3 text-center font-medium"><EquipmentLabel label={equipment.label} /></th>
                      {group.metrics.map((metric) => {
                        const row = equipment.metrics[metric.key];
                        return (
                          <td key={metric.key} className="px-3 py-3 align-top">
                            {row ? <MetricValue row={row} highlight={row.key === lowestMarginKey} /> : <span className="text-muted-foreground">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y lg:hidden">
              {group.metrics.map((metric) => (
                <section key={metric.key} aria-label={metric.label}>
                  <h4 className="px-3 pb-1 pt-2.5 text-left text-xs font-semibold text-muted-foreground"><MetricHeading metric={metric} /></h4>
                  {group.equipment.map((equipment) => {
                    const row = equipment.metrics[metric.key];
                    if (!row) return null;
                    return (
                      <div key={equipment.label} className="flex items-start justify-between gap-3 px-3 py-2">
                        <span className="w-20 shrink-0 pt-0.5"><EquipmentLabel label={equipment.label} /></span>
                        <MetricValue row={row} highlight={row.key === lowestMarginKey} />
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
