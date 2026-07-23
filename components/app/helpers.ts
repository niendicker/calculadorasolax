import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { getCalculationErrorMessage, getNetworkErrorMessage } from '@/lib/calculation-error-messages';
import type {
  AccessoryLine,
  DesiredFeatureId,
  GeneratorConfig,
  MicrogridConfig,
  ResidentialGridType,
  Solution,
  StockProductType,
  UserStockItem,
  WhiteTariffConfig,
} from '@/lib/types';

/** Network phases/voltage implied by each ResidentialGridType, so the
 * Microrrede/Gerador Externo phase+voltage selection can be checked against
 * whatever grid type is chosen in Configurações. */
export const gridTypePhaseVoltage: Record<ResidentialGridType, { phases: 1 | 2 | 3; voltage: 220 | 380 }> = {
  singlePhase_220: { phases: 1, voltage: 220 },
  splitPhase_220: { phases: 2, voltage: 220 },
  threePhase_220: { phases: 3, voltage: 220 },
  threePhase_380: { phases: 3, voltage: 380 },
};

/** Compatibility between a chosen grid type and a phases+voltage selection.
 * `forMicrogrid` allows one documented exception: a 380V trifásico or 220V
 * bifásico network can still host a 220V monofásico on-grid inverter. Every
 * other combination (and the generator, which never gets the exception)
 * requires an exact match. Returns 'unknown' when no grid type is chosen yet
 * in Configurações — there's nothing to compare against. */
export function checkPhaseVoltageCompatibility(
  gridType: ResidentialGridType | null,
  phases: 1 | 2 | 3,
  voltageV: number,
  { forMicrogrid }: { forMicrogrid: boolean }
): 'unknown' | 'compatible' | 'incompatible' {
  if (!gridType) return 'unknown';
  const network = gridTypePhaseVoltage[gridType];
  if (phases === network.phases && voltageV === network.voltage) return 'compatible';
  if (forMicrogrid) {
    const networkAllowsException = gridType === 'threePhase_380' || gridType === 'splitPhase_220';
    if (networkAllowsException && phases === 1 && voltageV === 220) return 'compatible';
  }
  return 'incompatible';
}

/** True when Microrrede is selected and its phases/voltage don't match (or
 * fall under the one documented exception for) the grid type chosen in
 * Configurações — the wizard blocks calculating (and exporting the PDF,
 * which always follows canCalculate) in this case, and shows a matching
 * warning in SizingTab's Microrrede panel. */
export function isMicrogridPhaseVoltageIncompatible(
  desiredFeatures: DesiredFeatureId[],
  microgrid: MicrogridConfig | null,
  gridType: ResidentialGridType | null
): boolean {
  if (!desiredFeatures.includes('microgrid') || !microgrid) return false;
  return (
    checkPhaseVoltageCompatibility(gridType, microgrid.onGridPhases, microgrid.voltageV, { forMicrogrid: true }) ===
    'incompatible'
  );
}

/** True when Gerador Externo is selected and its phases/voltage don't match
 * the grid type chosen in Configurações — same blocking behavior as
 * isMicrogridPhaseVoltageIncompatible, no exception for the generator. */
export function isGeneratorPhaseVoltageIncompatible(
  desiredFeatures: DesiredFeatureId[],
  generator: GeneratorConfig | null,
  gridType: ResidentialGridType | null
): boolean {
  if (!desiredFeatures.includes('external_generator') || !generator) return false;
  return (
    checkPhaseVoltageCompatibility(gridType, generator.phases, generator.voltageV, { forMicrogrid: false }) ===
    'incompatible'
  );
}

/** Solutions saved before accessories carried structured metadata (either in
 * localStorage or a saved project's jsonb) still have plain string entries
 * like "Smart Meter - M1-40 x2 (opcional)" — parse those defensively into the
 * current shape; already-structured entries pass through unchanged. */
export function normalizeAccessoryLine(raw: string | AccessoryLine): AccessoryLine {
  if (typeof raw !== 'string') return raw;
  const optional = /\s*\(opcional\)\s*$/.test(raw);
  const withoutOptional = optional ? raw.replace(/\s*\(opcional\)\s*$/, '') : raw;
  const qtyMatch = withoutOptional.match(/^(.*)\s+x(\d+)$/);
  return {
    model: qtyMatch ? qtyMatch[1] : withoutOptional,
    qty: qtyMatch ? Number(qtyMatch[2]) : 1,
    optional,
    appliesTo: 'system',
    comment: null,
  };
}

/** True when Gerador Externo is selected and its rated power can't cover the
 * registered loads' peak power — the wizard blocks calculating in this case
 * (see canCalculate in useCalculation.ts) and shows a matching warning in
 * SizingTab's Gerador Externo panel, both driven by this single check. */
export function isGeneratorPowerInsufficient(
  desiredFeatures: DesiredFeatureId[],
  generator: GeneratorConfig | null,
  peakW: number
): boolean {
  if (!desiredFeatures.includes('external_generator') || !generator) return false;
  return generator.apparentPowerVA < peakW;
}

/** True when Gerador Externo is selected and the user hasn't yet confirmed
 * they're aware the generator needs its own ATS switch — the wizard blocks
 * calculating until this is checked (see canCalculate in useCalculation.ts). */
export function isGeneratorAtsUnacknowledged(desiredFeatures: DesiredFeatureId[], generator: GeneratorConfig | null): boolean {
  if (!desiredFeatures.includes('external_generator')) return false;
  return !generator?.ownAtsAcknowledged;
}

/** True when Microrrede is selected and the user hasn't yet confirmed
 * they're aware the on-grid system's power must stay below the solution's
 * inverter/battery power — the wizard blocks calculating until this is
 * checked (see canCalculate in useCalculation.ts). */
export function isMicrogridPowerNoticeUnacknowledged(
  desiredFeatures: DesiredFeatureId[],
  microgrid: MicrogridConfig | null
): boolean {
  if (!desiredFeatures.includes('microgrid')) return false;
  return !microgrid?.powerNoticeAcknowledged;
}

export interface SystemCostEstimate {
  totalCost: number;
  pricedItemsCount: number;
  totalItemsCount: number;
  /** false when at least one item in the solution has no price in the user's stock. */
  isComplete: boolean;
}

/** Sums the user's own stock price for every model in the solution (inverter,
 * battery, each accessory) by quantity. Items missing a price are skipped —
 * isComplete tells the caller whether the total should be shown as partial. */
export function calculateSystemCost(solution: Solution, userStockItems: UserStockItem[]): SystemCostEstimate {
  function priceFor(productType: StockProductType, model: string): number | undefined {
    return userStockItems.find((item) => item.productType === productType && item.productModel === model)
      ?.unitValue;
  }

  const items: { productType: StockProductType; model: string; qty: number }[] = [
    { productType: 'inverter', model: solution.inverterModel, qty: solution.inverterQty ?? 1 },
    { productType: 'battery', model: solution.batteryModel, qty: solution.batteryQty },
    ...solution.accessories.map((accessory) => {
      const { model, qty } = normalizeAccessoryLine(accessory);
      return { productType: 'accessory' as const, model, qty };
    }),
  ];

  let totalCost = 0;
  let pricedItemsCount = 0;

  for (const item of items) {
    const unitValue = priceFor(item.productType, item.model);
    if (unitValue !== undefined) {
      totalCost += unitValue * item.qty;
      pricedItemsCount += 1;
    }
  }

  return {
    totalCost,
    pricedItemsCount,
    totalItemsCount: items.length,
    isComplete: pricedItemsCount === items.length,
  };
}

export interface BatteryQuantityPart {
  model: string;
  qty: number;
}

/** Some battery lines scale via a "Master" unit plus electrically-identical
 * "Slave"/expansion units instead of more of the same model (e.g. "T58 V2
 * Master" + "T58 Slave"). Energy/power math already treats batteryQty as N
 * identical units, which holds true either way — this only changes what's
 * displayed for units 2..N, using the Master row's expansionModel. */
export function batteryQuantityBreakdown(
  model: string,
  quantity: number,
  batteryCatalog: { model: string; expansionModel?: string | null }[]
): BatteryQuantityPart[] {
  const expansionModel = batteryCatalog.find((battery) => battery.model === model)?.expansionModel;
  if (expansionModel && quantity > 1) {
    return [
      { model, qty: 1 },
      { model: expansionModel, qty: quantity - 1 },
    ];
  }
  return [{ model, qty: quantity }];
}

/** Expansion/Slave models only ever exist as units 2..N of some other
 * "Master" battery's bank — they aren't a real standalone base model, so
 * they must never be offered directly in the battery picker. */
export function expansionModelSet(batteryCatalog: { expansionModel?: string | null }[]): Set<string> {
  return new Set(
    batteryCatalog.map((battery) => battery.expansionModel).filter((model): model is string => Boolean(model))
  );
}

/** Mirrors supabase/functions/calculate-residential/logic.ts's effectiveTargetPowerW:
 * when Tarifa Branca is active, the inverter's rated/peak power floor must
 * also cover the tariff window's required power, not just the loads'. Kept
 * in sync manually since the Edge Function runs on Deno and can't be
 * imported here — this is what the server actually gated the solution on. */
export function effectiveTargetPowerW(
  desiredFeatures: DesiredFeatureId[],
  whiteTariff: WhiteTariffConfig | null,
  baseW: number
): number {
  if (!desiredFeatures.includes('white_tariff') || !whiteTariff) return baseW;
  return Math.max(baseW, whiteTariff.requiredPowerW);
}

/** Mirrors effectiveTargetEnergyWh from the same Edge Function file. */
export function effectiveTargetEnergyWh(
  desiredFeatures: DesiredFeatureId[],
  whiteTariff: WhiteTariffConfig | null,
  baseTargetEnergyWh: number
): number {
  if (!desiredFeatures.includes('white_tariff') || !whiteTariff) return baseTargetEnergyWh;
  return whiteTariff.requiredEnergyWh + (whiteTariff.includeBackupReserve ? baseTargetEnergyWh : 0);
}

export interface MarginRow {
  key: string;
  label: string;
  requiredValue: number;
  providedValue: number;
  unit: 'W' | 'Wh';
}

/** Builds the "how much slack does the chosen solution have over what the
 * customer actually needs" rows, using the exact same gating formulas the
 * Edge Function used to pick this solution — so the margins shown here
 * match why this solution (and not a smaller one) was recommended. */
export function buildMarginSummary({
  desiredFeatures,
  whiteTariff,
  microgrid,
  nominalW,
  peakW,
  dailyKwh,
  solution,
}: {
  desiredFeatures: DesiredFeatureId[];
  whiteTariff: WhiteTariffConfig | null;
  microgrid: MicrogridConfig | null;
  nominalW: number;
  peakW: number;
  dailyKwh: number;
  solution: Solution;
}): MarginRow[] {
  const rows: MarginRow[] = [
    {
      key: 'nominal',
      label: 'Potência padrão',
      requiredValue: effectiveTargetPowerW(desiredFeatures, whiteTariff, nominalW),
      providedValue: solution.inverterRatedPowerW ?? 0,
      unit: 'W',
    },
    {
      key: 'peak',
      label: 'Potência máxima',
      requiredValue: effectiveTargetPowerW(desiredFeatures, whiteTariff, peakW),
      providedValue: solution.inverterPeakPowerW ?? 0,
      unit: 'W',
    },
    {
      key: 'energy',
      label: 'Energia',
      requiredValue: effectiveTargetEnergyWh(desiredFeatures, whiteTariff, dailyKwh * 1000),
      providedValue: solution.availableEnergyWh ?? 0,
      unit: 'Wh',
    },
  ];

  // Microgrid's on-grid power must stay under both the inverter's and the
  // battery bank's power (see solutionSupportsMicrogrid in the Edge
  // Function) — only relevant when that feature is actually active.
  if (desiredFeatures.includes('microgrid') && microgrid && microgrid.onGridApparentPowerVA > 0) {
    rows.push({
      key: 'microgrid_inverter',
      label: 'Microrrede (inversor)',
      requiredValue: microgrid.onGridApparentPowerVA,
      providedValue: solution.inverterRatedPowerW ?? 0,
      unit: 'W',
    });
    if (solution.batteryPowerW != null) {
      rows.push({
        key: 'microgrid_battery',
        label: 'Microrrede (bateria)',
        requiredValue: microgrid.onGridApparentPowerVA,
        providedValue: solution.batteryPowerW,
        unit: 'W',
      });
    }
  }

  return rows;
}

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/** Default filename for the exported PDF report ("projeto_data") — most
 * browsers' print-to-PDF dialog suggests document.title as the filename, so
 * this is set as the title right before calling window.print() (see exportPdf
 * in SinglePageApp.tsx). Falls back to "projeto" when there's no project name
 * yet, and strips characters that aren't safe in a filename on any OS. */
export function buildPdfFileName(projectName: string, date: Date = new Date()): string {
  const safeName = projectName
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_');
  const isoDate = date.toISOString().slice(0, 10);
  return `${safeName || 'projeto'}_${isoDate}`;
}

export interface TariffSavingsEstimate {
  monthlySavings: number;
  annualSavings: number;
  businessDaysPerMonth: number;
}

/** Tarifa Branca's peak surcharge applies on business days — used as the
 * standard monthly multiplier for the savings estimate. */
export const TARIFF_BUSINESS_DAYS_PER_MONTH = 22;

/** Estimated savings from shifting the white-tariff window's energy off the
 * grid, using the spread the customer entered. Null when white_tariff isn't configured. */
export function calculateTariffSavings(whiteTariff: WhiteTariffConfig | null): TariffSavingsEstimate | null {
  if (!whiteTariff) return null;

  const dailySavings = (whiteTariff.requiredEnergyWh / 1000) * whiteTariff.tariffSpreadPerKwh;
  const monthlySavings = dailySavings * TARIFF_BUSINESS_DAYS_PER_MONTH;

  return {
    monthlySavings,
    annualSavings: monthlySavings * 12,
    businessDaysPerMonth: TARIFF_BUSINESS_DAYS_PER_MONTH,
  };
}

/** Turns a supabase.functions.invoke() error into a specific, actionable
 * message using the Edge Function's stable error code, falling back to a
 * network-specific message when the request never reached the function. */
export async function resolveCalculationErrorMessage(functionError: unknown): Promise<string> {
  if (functionError instanceof FunctionsHttpError) {
    try {
      const body = await functionError.context.json();
      return getCalculationErrorMessage(body?.error, body?.blockingFeatures);
    } catch {
      return getCalculationErrorMessage(undefined);
    }
  }

  if (functionError instanceof FunctionsFetchError) {
    return getNetworkErrorMessage();
  }

  return getCalculationErrorMessage(undefined);
}
