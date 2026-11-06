// Helpers for DailyCurveEditor: energetic KPI calculations, batch updates, and smoothing.

export interface DailyEnergyMetrics {
  totalConsumptionKwh: number;
  avgConsumptionKw: number;
  peakConsumptionKw: number;
  peakConsumptionIndex: number;
  totalSolarKwh: number;
  peakSolarKw: number;
  peakSolarIndex: number;
  solarCoveragePercent: number;
  solarExportKwh: number;
}

export type BatchOperationMode = 'scale' | 'set' | 'offset';

export function calculateDailyMetrics(
  consumptionKw: number[],
  solarKw?: (number | null)[] | null
): DailyEnergyMetrics {
  const count = consumptionKw.length || 24;
  const hoursPerPoint = 24 / count;

  let totalConsumptionKwh = 0;
  let peakConsumptionKw = 0;
  let peakConsumptionIndex = 0;

  for (let i = 0; i < consumptionKw.length; i++) {
    const val = Math.max(0, consumptionKw[i] ?? 0);
    totalConsumptionKwh += val * hoursPerPoint;
    if (val > peakConsumptionKw) {
      peakConsumptionKw = val;
      peakConsumptionIndex = i;
    }
  }

  const avgConsumptionKw = totalConsumptionKwh / 24;

  let totalSolarKwh = 0;
  let peakSolarKw = 0;
  let peakSolarIndex = 0;
  let solarExportKwh = 0;

  if (solarKw && solarKw.length > 0) {
    for (let i = 0; i < solarKw.length; i++) {
      const sVal = Math.max(0, solarKw[i] ?? 0);
      const cVal = Math.max(0, consumptionKw[i] ?? 0);
      totalSolarKwh += sVal * hoursPerPoint;
      if (sVal > peakSolarKw) {
        peakSolarKw = sVal;
        peakSolarIndex = i;
      }
      if (sVal > cVal) {
        solarExportKwh += (sVal - cVal) * hoursPerPoint;
      }
    }
  }

  const solarCoveragePercent =
    totalConsumptionKwh > 0 ? Math.min(100, (totalSolarKwh / totalConsumptionKwh) * 100) : 0;

  return {
    totalConsumptionKwh,
    avgConsumptionKw,
    peakConsumptionKw,
    peakConsumptionIndex,
    totalSolarKwh,
    peakSolarKw,
    peakSolarIndex,
    solarCoveragePercent,
    solarExportKwh,
  };
}

export function applyBatchOperation(
  values: number[],
  startIndex: number,
  endIndex: number,
  mode: BatchOperationMode,
  value: number,
  maxLimit = 500
): number[] {
  const start = Math.max(0, Math.min(startIndex, endIndex));
  const end = Math.min(values.length - 1, Math.max(startIndex, endIndex));
  const result = values.slice();

  for (let i = start; i <= end; i++) {
    let nextVal = result[i];
    if (mode === 'scale') {
      nextVal = nextVal * (1 + value / 100);
    } else if (mode === 'set') {
      nextVal = value;
    } else if (mode === 'offset') {
      nextVal = nextVal + value;
    }
    result[i] = Math.max(0, Math.min(maxLimit, Math.round(nextVal * 10) / 10));
  }

  return result;
}

export function applyMovingAverageSmoothing(values: number[], maxLimit = 500): number[] {
  const n = values.length;
  if (n < 3) return values.slice();

  const result = values.slice();
  for (let i = 1; i < n - 1; i++) {
    const smoothed = values[i - 1] * 0.25 + values[i] * 0.5 + values[i + 1] * 0.25;
    result[i] = Math.max(0, Math.min(maxLimit, Math.round(smoothed * 10) / 10));
  }
  return result;
}

export function formatPtNumber(val: number, decimals = 1): string {
  return val.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
