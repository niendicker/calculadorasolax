/** Pure calculation primitives shared by the browser and the Deno function. */

export type PeakCalcMode = 'sum' | 'largest-surge' | 'select';

export interface WhiteTariffEnergyRequirement {
  requiredPowerW: number;
  pontaEnergyWh: number;
  intermediateEnergyWh: number;
}

export interface SingleLoad {
  powerW: number;
  qty: number;
  ipInRatio?: number;
  usageFactor?: number;
  usageMode?: 'fraction' | 'fixed';
  fixedHours?: number;
  includedInPeak?: boolean;
}

export function totalNominalW(loads: SingleLoad[]): number {
  return loads.reduce((acc, load) => acc + load.powerW * load.qty, 0);
}

export function totalDailyKwh(loads: SingleLoad[], operationHours: number): number {
  return loads.reduce((acc, load) => {
    const hours = load.usageMode === 'fixed' ? Math.max(0, load.fixedHours ?? 0) : operationHours * (load.usageFactor ?? 1);
    return acc + (load.powerW * load.qty * hours) / 1000;
  }, 0);
}

export function totalPeakW(loads: SingleLoad[], mode: PeakCalcMode = 'sum'): number {
  if (loads.length === 0) return 0;
  if (mode === 'sum') return loads.reduce((acc, load) => acc + load.powerW * (load.ipInRatio ?? 1) * load.qty, 0);
  if (mode === 'select') {
    return loads
      .filter((load) => load.includedInPeak ?? true)
      .reduce((acc, load) => acc + load.powerW * (load.ipInRatio ?? 1) * load.qty, 0);
  }

  const largestExtra = loads.reduce((max, load) => {
    const extra = load.powerW * ((load.ipInRatio ?? 1) - 1);
    return extra > max ? extra : max;
  }, 0);
  return totalNominalW(loads) + largestExtra;
}

/** Shared sizing floor for rated/peak power. Backup and Tarifa Branca are
 * alternative operating modes, so the larger requirement wins. */
export function effectiveTargetPowerW(
  desiredFeatures: readonly string[],
  whiteTariff: WhiteTariffEnergyRequirement | null,
  baseW: number
): number {
  const backupFloor = desiredFeatures.includes('backup') ? baseW : 0;
  const whiteTariffFloor = desiredFeatures.includes('white_tariff') && whiteTariff ? whiteTariff.requiredPowerW : 0;
  return Math.max(backupFloor, whiteTariffFloor);
}

/** Shared battery-energy floor. Backup reserve and the Tarifa Branca daily
 * arbitrage cycle stack because they are separate capacity requirements. */
export function effectiveTargetEnergyWh(
  desiredFeatures: readonly string[],
  whiteTariff: WhiteTariffEnergyRequirement | null,
  baseTargetEnergyWh: number,
  roundTripEfficiencyPercent = 100
): number {
  const backupFloor = desiredFeatures.includes('backup') ? baseTargetEnergyWh : 0;
  if (!desiredFeatures.includes('white_tariff') || !whiteTariff) return backupFloor;
  const efficiency = Math.max(0.01, Math.min(1, roundTripEfficiencyPercent / 100));
  return backupFloor + (whiteTariff.pontaEnergyWh + whiteTariff.intermediateEnergyWh) / efficiency;
}
