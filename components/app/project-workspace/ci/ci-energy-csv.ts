import type { CiSolarConfig, LoadCurve } from '@/supabase/functions/_shared/commercial-industrial/types';
import { buildSolarPreviewPoints } from './ci-daily-solar-profile';

/** Export the same interval values shown in the chart, preserving missing PV readings. */
export function exportEnergyCurveCsv(curve: LoadCurve, powerFactor: number, solar?: CiSolarConfig): string {
  const generation = buildSolarPreviewPoints(solar, curve);
  const header = generation ? 'timestamp,consumptionKva,generationKva' : 'timestamp,consumptionKva';
  const rows = curve.points.map((point, index) => {
    const cells = [point.timestamp, String(point.powerKw / powerFactor)];
    if (generation) {
      const value = generation[index].powerKw;
      cells.push(value === null ? '' : String(value / powerFactor));
    }
    return cells.join(',');
  });
  return `${header}\n${rows.join('\n')}`;
}
