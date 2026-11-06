import { estimateSolarGenerationKw } from '@/supabase/functions/_shared/commercial-industrial/dispatch';
import type { CiSolarConfig, LoadCurve } from '@/supabase/functions/_shared/commercial-industrial/types';

/** Average available readings by local quarter-hour, without filling missing days with zeros. */
export function buildDailySolarProfile(solar: CiSolarConfig | undefined, pattern: 'weekday' | 'weekend', timezone: string, consumption?: LoadCurve | null): (number | null)[] | undefined {
  if (!solar?.enabled) return undefined;
  if (solar.generationCurve?.source === 'manual' && solar.generationCurve.manualConfig) return [...(pattern === 'weekday' ? solar.generationCurve.manualConfig.weekdayKw : solar.generationCurve.manualConfig.weekendKw)];
  const imported = solar.generationCurve;
  const points = imported?.points ?? (solar.generationPoints && consumption
    ? consumption.points.map((point, index) => ({ timestamp: point.timestamp, powerKw: solar.generationPoints![index] })) : undefined);
  if (!points) return Array.from({ length: 96 }, (_, slot) => estimateSolarGenerationKw(solar, slot * 15, 15));
  const resolution = imported?.resolutionMinutes ?? consumption!.resolutionMinutes;
  const sums = Array(96).fill(0), counts = Array(96).fill(0);
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (const point of points) {
    if (!Number.isFinite(point.powerKw) || point.powerKw < 0) continue;
    for (let offset = 0; offset < resolution; offset += 15) {
      const parts = formatter.formatToParts(new Date(Date.parse(point.timestamp) + offset * 60000));
      const part = (name: string) => parts.find((item) => item.type === name)!.value;
      const weekend = ['Sat', 'Sun'].includes(part('weekday'));
      if (weekend !== (pattern === 'weekend')) continue;
      const slot = Number(part('hour')) * 4 + Math.floor(Number(part('minute')) / 15);
      sums[slot] += point.powerKw;
      counts[slot]++;
    }
  }
  return sums.map((sum, slot) => counts[slot] ? sum / counts[slot] : null);
}

function localSlot(timestamp: string, formatter: Intl.DateTimeFormat) {
  const parts = formatter.formatToParts(new Date(timestamp));
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return { weekend: ['Sat', 'Sun'].includes(part('weekday')), minute: Number(part('hour')) * 60 + Number(part('minute')) };
}

/** Manual PV patterns follow the consumption timestamps, including partial imported days. */
export function buildSolarPreviewPoints(solar: CiSolarConfig | undefined, consumption: LoadCurve): { timestamp: string; powerKw: number | null }[] | undefined {
  if (!solar?.enabled) return undefined;
  const manual = solar.generationCurve?.source === 'manual' ? solar.generationCurve.manualConfig : undefined;
  const imported = solar.generationCurve ? new Map(solar.generationCurve.points.map(point => [Date.parse(point.timestamp), point.powerKw])) : undefined;
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: consumption.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return consumption.points.map((point, index) => {
    const local = localSlot(point.timestamp, formatter);
    let powerKw: number | null;
    if (manual) {
      const pattern = local.weekend ? manual.weekendKw : manual.weekdayKw;
      const slots = consumption.resolutionMinutes / 15;
      powerKw = Array.from({ length: slots }, (_, offset) => pattern[Math.floor(local.minute / 15) + offset] ?? 0).reduce((sum, value) => sum + value, 0) / slots;
    } else if (imported) powerKw = imported.get(Date.parse(point.timestamp)) ?? null;
    else powerKw = solar.generationPoints?.[index] ?? estimateSolarGenerationKw(solar, local.minute, consumption.resolutionMinutes);
    return { timestamp: point.timestamp, powerKw };
  });
}

export function updateDailySolarProfile(solar: CiSolarConfig, consumption: LoadCurve, pattern: 'weekday' | 'weekend', values: number[]): CiSolarConfig {
  const weekdayKw = pattern === 'weekday' ? values : buildDailySolarProfile(solar, 'weekday', consumption.timezone, consumption)!.map(value => value ?? 0);
  const weekendKw = pattern === 'weekend' ? values : buildDailySolarProfile(solar, 'weekend', consumption.timezone, consumption)!.map(value => value ?? 0);
  const generationCurve: LoadCurve = { ...consumption, source: 'manual', manualConfig: { weekdayKw: weekdayKw.slice(), weekendKw: weekendKw.slice(), presetId: 'custom' }, points: [] };
  const updated = { ...solar, generationPoints: undefined, generationCurve };
  generationCurve.points = buildSolarPreviewPoints(updated, consumption)!.map(point => ({ ...point, powerKw: point.powerKw ?? 0 }));
  return updated;
}
