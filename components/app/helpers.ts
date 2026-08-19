import type {
  Address,
  AccessoryLine,
  BatteryTopology,
  Client,
  DesiredFeatureId,
  GeneratorConfig,
  MarginSettings,
  MicrogridConfig,
  ProjectServiceLine,
  PvConfig,
  ResidentialGridType,
  SavedProject,
  Solution,
  StockProductType,
  UserServiceItem,
  UserServicePricingUnit,
  UserStockItem,
  WhiteTariffConfig,
} from '@/lib/types';
import { formatAddress, isAddressEmpty } from '@/lib/address';
import { batteryQuantityBreakdown, expansionModelSet, type BatteryQuantityPart } from '@/lib/battery-quantity-breakdown';
import { totalDailyKwh, totalNominalW, totalPeakW } from '@/lib/store/wizard-calculations';
import { gridLabels, topologyLabels, type BatteryCatalogOption, type InlineProfile, type InverterCatalogOption } from './types';

export { batteryQuantityBreakdown, expansionModelSet, type BatteryQuantityPart };

/** Network phases/voltage implied by each ResidentialGridType, so the
 * Microrrede/Gerador phase+voltage selection can be checked against
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

/** True when Gerador is selected and its phases/voltage don't match
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
  // Solutions saved before `bundled` existed are missing that field even
  // though the rest is already structured — patch it in defensively without
  // touching an already-fully-structured line's identity.
  if (typeof raw !== 'string') return raw.bundled === undefined ? { ...raw, bundled: false } : raw;
  const optional = /\s*\(opcional\)\s*$/.test(raw);
  const withoutOptional = optional ? raw.replace(/\s*\(opcional\)\s*$/, '') : raw;
  const qtyMatch = withoutOptional.match(/^(.*)\s+x(\d+)$/);
  return {
    model: qtyMatch ? qtyMatch[1] : withoutOptional,
    qty: qtyMatch ? Number(qtyMatch[2]) : 1,
    optional,
    appliesTo: 'system',
    comment: null,
    bundled: false,
  };
}

/** True when Gerador is selected and its rated power can't cover the
 * registered loads' peak power — the wizard blocks calculating in this case
 * (see canCalculate in useCalculation.ts) and shows a matching warning in
 * SizingTab's Gerador panel, both driven by this single check. */
export function isGeneratorPowerInsufficient(
  desiredFeatures: DesiredFeatureId[],
  generator: GeneratorConfig | null,
  peakW: number
): boolean {
  if (!desiredFeatures.includes('external_generator') || !generator) return false;
  return generatorActivePowerW(generator) < recommendedGeneratorActivePowerW(peakW, generator.safetyMarginW);
}

export function generatorActivePowerW(generator: GeneratorConfig | null): number {
  if (!generator) return 0;
  const powerFactor = Math.max(0.1, Math.min(1, generator.powerFactor ?? 0.8));
  return generator.apparentPowerVA * powerFactor;
}

export function recommendedGeneratorActivePowerW(peakW: number, safetyMarginW = 1000): number {
  return Math.max(0, peakW) + Math.max(0, safetyMarginW ?? 1000);
}

export function recommendedGeneratorApparentPowerVA(
  peakW: number,
  powerFactor = 0.8,
  safetyMarginW = 1000
): number {
  const normalizedPowerFactor = Math.max(0.1, Math.min(1, powerFactor));
  return recommendedGeneratorActivePowerW(peakW, safetyMarginW) / normalizedPowerFactor;
}

/** True when Gerador is selected and the user hasn't yet confirmed
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
export const MICROGRID_POWER_MARGIN_PERCENT = 20;

export function recommendedMicrogridSupportPowerW(onGridPowerW: number): number {
  return Math.max(0, onGridPowerW) * (1 + MICROGRID_POWER_MARGIN_PERCENT / 100);
}

/** True when Fotovoltaico is selected but the customer hasn't yet entered
 * the monthly consumption and HSP it needs to size the PV array from — the
 * wizard blocks calculating until both are filled in (see canCalculate in
 * useCalculation.ts). */
export function isPvConfigIncomplete(desiredFeatures: DesiredFeatureId[], pv: PvConfig | null): boolean {
  if (!desiredFeatures.includes('pv')) return false;
  return !pv?.monthlyConsumptionKwh || !pv?.hsp;
}

export interface SystemCostEstimate {
  totalCost: number;
  pricedItemsCount: number;
  totalItemsCount: number;
  /** false when at least one item in the solution has no price in the user's stock. */
  isComplete: boolean;
  missingItems: string[];
  serviceDetails?: ServiceCostDetail[];
}

export interface ServiceCostDetail {
  serviceId: string;
  name: string;
  pricingUnit: UserServicePricingUnit;
  quantity: number | null;
  unitValue: number;
  total: number | null;
}

type ServiceLoad = { qty: number; powerW: number; usageMode?: 'fixed' | 'fraction'; usageFactor?: number; fixedHours?: number };

export function servicePricingUnitLabel(unit: UserServicePricingUnit): string {
  return {
    project: 'projeto', pv_kwp: 'kWp', nominal_kva: 'kVA nominal', peak_kva: 'kVA pico',
    daily_kwh: 'kWh/dia', battery_qty: 'baterias', inverter_qty: 'inversores',
    accessory_qty: 'acessórios', load_qty: 'cargas',
  }[unit];
}

export function calculateServiceQuantity(
  pricingUnit: UserServicePricingUnit,
  solution: Solution | null,
  residentialOptions?: { loads: ServiceLoad[]; operationHours: number },
  batteryCatalog: { model: string; standardPowerKw: number | null; peakPowerKw: number | null }[] = []
): number | null {
  if (pricingUnit === 'project') return 1;
  if (!solution) return null;
  if (pricingUnit === 'pv_kwp') return solution.pvPowerKw;
  if (pricingUnit === 'battery_qty') return solution.batteryQty;
  if (pricingUnit === 'inverter_qty') return solution.inverterQty ?? 1;
  if (pricingUnit === 'accessory_qty') {
    return solution.accessories.reduce((sum, item) => {
      const normalized = normalizeAccessoryLine(item);
      return normalized.bundled || normalized.optional ? sum : sum + normalized.qty;
    }, 0);
  }
  if (pricingUnit === 'load_qty') return residentialOptions?.loads.reduce((sum, load) => sum + load.qty, 0) ?? null;
  if (pricingUnit === 'daily_kwh') {
    return residentialOptions
      ? residentialOptions.loads.reduce((sum, load) => {
          const hours = load.usageMode === 'fixed' ? Math.max(0, load.fixedHours ?? 0) : residentialOptions.operationHours * (load.usageFactor ?? 1);
          return sum + (load.powerW * load.qty * hours) / 1000;
        }, 0)
      : null;
  }
  const metrics = solutionMetrics(solution, batteryCatalog);
  return (pricingUnit === 'nominal_kva' ? metrics.nominalW : metrics.peakW) == null
    ? null
    : (pricingUnit === 'nominal_kva' ? metrics.nominalW : metrics.peakW)! / 1000;
}

const noMargin: MarginSettings = { inverterPercent: 0, batteryPercent: 0, accessoryPercent: 0 };

const marginFieldByProductType: Record<StockProductType, keyof MarginSettings> = {
  inverter: 'inverterPercent',
  battery: 'batteryPercent',
  accessory: 'accessoryPercent',
};

/** Sums the user's own stock price for every model in the solution (inverter,
 * battery parts and each required, non-bundled accessory) by quantity — marked
 * up by the matching category's sell margin (see MarginSettings) — plus the project's own services (priced
 * as-is from the user's services catalog by serviceId, no margin applied:
 * services have no separate cost basis). Together, this is the final cost of
 * the solution shown to the customer, i.e. what every economic analysis
 * should display. Items/services missing a price are skipped — isComplete
 * tells the caller whether the total should be shown as partial. `solution`
 * may be null (e.g. a project with services added before a solution has been
 * calculated), in which case only the services are priced. */
export function calculateSystemCost(
  solution: Solution | null,
  userStockItems: UserStockItem[],
  services: ProjectServiceLine[] = [],
  userServices: UserServiceItem[] = [],
  marginSettings: MarginSettings = noMargin,
  batteryCatalog: { model: string; expansionModel?: string | null; standardPowerKw?: number | null; peakPowerKw?: number | null }[] = [],
  residentialOptions?: { loads: ServiceLoad[]; operationHours: number }
): SystemCostEstimate {
  function priceFor(productType: StockProductType, model: string): number | undefined {
    const unitValue = userStockItems.find(
      (item) => item.productType === productType && item.productModel === model
    )?.unitValue;
    if (unitValue === undefined) return undefined;
    const marginPercent = marginSettings[marginFieldByProductType[productType]];
    return unitValue * (1 + marginPercent / 100);
  }

  const batteryItems = solution
    ? batteryQuantityBreakdown(
        solution.batteryModel,
        solution.batteryQty,
        batteryCatalog,
        (solution.inverterQty ?? 1) * (solution.batteryPortsUsed ?? 1)
      ).map((part) => ({ productType: 'battery' as const, model: part.model, qty: part.qty }))
    : [];

  const productItems: { productType: StockProductType; model: string; qty: number }[] = solution
    ? [
        { productType: 'inverter', model: solution.inverterModel, qty: solution.inverterQty ?? 1 },
        ...batteryItems,
        ...solution.accessories.flatMap((accessory) => {
          const { model, qty, optional, bundled } = normalizeAccessoryLine(accessory);
          // Bundled accessories are already included in their parent product's
          // price. Optional accessories only join the investment once the app
          // has an explicit opt-in state; today they are recommendations only.
          return bundled || optional ? [] : [{ productType: 'accessory' as const, model, qty }];
        }),
      ]
    : [];

  let totalCost = 0;
  let pricedItemsCount = 0;
  const missingItems: string[] = [];
  const serviceDetails: ServiceCostDetail[] = [];

  for (const item of productItems) {
    const unitValue = priceFor(item.productType, item.model);
    if (unitValue !== undefined) {
      totalCost += unitValue * item.qty;
      pricedItemsCount += 1;
    } else {
      missingItems.push(item.model);
    }
  }

  for (const line of services) {
    const service = userServices.find((item) => item.id === line.serviceId);
    const unitValue = service?.unitValue;
    const pricingUnit = service?.pricingUnit ?? 'project';
    const quantity = service ? calculateServiceQuantity(pricingUnit, solution, residentialOptions, batteryCatalog.map((item) => ({ model: item.model, standardPowerKw: item.standardPowerKw ?? null, peakPowerKw: item.peakPowerKw ?? null }))) : null;
    const effectiveQuantity = pricingUnit === 'project' ? line.qty : quantity;
    serviceDetails.push({ serviceId: line.serviceId, name: line.name, pricingUnit, quantity: effectiveQuantity, unitValue: unitValue ?? 0, total: unitValue != null && effectiveQuantity != null ? unitValue * effectiveQuantity : null });
    if (unitValue !== undefined && effectiveQuantity !== null) {
      totalCost += unitValue * effectiveQuantity;
      pricedItemsCount += 1;
    } else {
      missingItems.push(service ? `${line.name} (aguardando dimensionamento)` : line.name);
    }
  }

  const totalItemsCount = productItems.length + services.length;

  return {
    totalCost,
    pricedItemsCount,
    totalItemsCount,
    isComplete: pricedItemsCount === totalItemsCount,
    missingItems,
    serviceDetails,
  };
}

/** Nominal/Máxima for a proposed solution are capped by whichever side of the
 * pair (battery or inverter) is weaker — the system can't exceed either. The
 * inverter's rated/peak power already comes as solution-level totals from
 * the API; the battery's only comes as per-unit catalog specs, so it's
 * multiplied by batteryQty here to compare on the same basis. Shared between
 * the Solução tab's metric cards and the PDF report so both read the same
 * numbers off the same formula. */
export function solutionMetrics(
  solution: Solution,
  batteryCatalog: { model: string; standardPowerKw: number | null; peakPowerKw: number | null }[]
): { nominalW: number | null; peakW: number | null; energyKwh: number } {
  const batteryCat = batteryCatalog.find((battery) => battery.model === solution.batteryModel);
  const batteryNominalW = batteryCat?.standardPowerKw != null ? batteryCat.standardPowerKw * 1000 * solution.batteryQty : null;
  const batteryPeakW = batteryCat?.peakPowerKw != null ? batteryCat.peakPowerKw * 1000 * solution.batteryQty : null;
  const inverterNominalW = solution.inverterRatedPowerW ?? null;
  const inverterPeakW = solution.inverterPeakPowerW ?? null;

  function minOf(a: number | null, b: number | null): number | null {
    if (a == null) return b;
    if (b == null) return a;
    return Math.min(a, b);
  }

  return {
    nominalW: minOf(batteryNominalW, inverterNominalW),
    peakW: minOf(batteryPeakW, inverterPeakW),
    energyKwh: (solution.availableEnergyWh ?? 0) / 1000,
  };
}

/** Mirrors supabase/functions/calculate-residential/logic.ts's effectiveTargetPowerW:
 * raises a power floor to cover whichever of Backup/Tarifa Branca demands
 * more (baseW only counts when 'backup' is a desired feature — an outage and
 * a normal grid-connected tariff window can't happen at the same instant, so
 * the two floors are never summed, just maxed). Kept in sync manually since
 * the Edge Function runs on Deno and can't be imported here — this is what
 * the server actually gated the solution on. If you change this, update the
 * Deno copy too — mirrors.test.ts next to that file asserts both sides agree. */
export function effectiveTargetPowerW(
  desiredFeatures: DesiredFeatureId[],
  whiteTariff: WhiteTariffConfig | null,
  baseW: number
): number {
  const backupFloor = desiredFeatures.includes('backup') ? baseW : 0;
  const whiteTariffFloor = desiredFeatures.includes('white_tariff') && whiteTariff ? whiteTariff.requiredPowerW : 0;
  return Math.max(backupFloor, whiteTariffFloor);
}

/** Mirrors effectiveTargetEnergyWh from the same Edge Function file: Backup's
 * reserve and Tarifa Branca's daily arbitrage cycle stack (unlike power),
 * since a customer wanting both needs capacity for both at once. Same
 * manual-sync caveat as effectiveTargetPowerW above — see mirrors.test.ts. */
export function effectiveTargetEnergyWh(
  desiredFeatures: DesiredFeatureId[],
  whiteTariff: WhiteTariffConfig | null,
  baseTargetEnergyWh: number,
  roundTripEfficiencyPercent = 100
): number {
  const backupFloor = desiredFeatures.includes('backup') ? baseTargetEnergyWh : 0;
  if (!desiredFeatures.includes('white_tariff') || !whiteTariff) return backupFloor;
  const efficiency = Math.max(0.01, Math.min(1, roundTripEfficiencyPercent / 100));
  return backupFloor + (whiteTariff.pontaEnergyWh + whiteTariff.intermediateEnergyWh) / efficiency;
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
  pv,
  nominalW,
  peakW,
  dailyKwh,
  solution,
}: {
  desiredFeatures: DesiredFeatureId[];
  whiteTariff: WhiteTariffConfig | null;
  microgrid: MicrogridConfig | null;
  pv: PvConfig | null;
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

  // PV is sized (computePvPowerKw in the Edge Function) to cover the
  // customer's own total monthly consumption, capped by the recommended
  // inverter's pv_oversizing_percent — so the solution's own generation
  // estimate can fall short of that target on a heavily-capped inverter,
  // same spirit as the other margin rows.
  if (desiredFeatures.includes('pv') && pv && pv.monthlyConsumptionKwh > 0) {
    rows.push({
      key: 'pv',
      label: 'Geração FV',
      requiredValue: pv.monthlyConsumptionKwh * 1000,
      providedValue: (solution.pvMonthlyGenerationKwh ?? 0) * 1000,
      unit: 'Wh',
    });
  }

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

/** True when any of buildMarginSummary's rows for this solution falls short
 * of what the customer needs — the Edge Function now intentionally falls
 * back to the largest available combination when nothing fully qualifies
 * (see calculate-residential/logic.ts's rankByLeastShortfall), so this is a
 * real, expected outcome rather than something the server should never
 * return. Used to block PDF export until the user adjusts loads/battery/
 * inverter selection. */
export function solutionHasInsufficientMargin(
  solution: Solution,
  params: Omit<Parameters<typeof buildMarginSummary>[0], 'solution'>
): boolean {
  return buildMarginSummary({ ...params, solution }).some((row) => row.providedValue < row.requiredValue);
}

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/** Formats a CPF/CNPJ as the user types — detects which shape by digit
 * count (≤11 digits stays CPF, more becomes CNPJ) so one field handles both
 * without asking which type it is up front. */
export function formatDocument(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** Masks a CPF/CNPJ for display — keeps the first 3 and last 2 digits
 * visible (enough to recognize/confirm it's the right document without
 * exposing the whole number) and replaces every other digit with •,
 * preserving whatever punctuation formatDocument already put in place.
 * Works on either document shape since it masks by digit *position*, not by
 * a fixed CPF/CNPJ pattern. Returns short/empty input unchanged — nothing
 * meaningful to hide below 6 digits. */
export function maskDocument(formatted: string): string {
  const digitIndexes: number[] = [];
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) digitIndexes.push(i);
  }
  if (digitIndexes.length <= 5) return formatted;

  const visible = new Set([...digitIndexes.slice(0, 3), ...digitIndexes.slice(-2)]);
  return formatted
    .split('')
    .map((char, index) => (/\d/.test(char) && !visible.has(index) ? '•' : char))
    .join('');
}

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
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

// Shared shape for the two WhatsApp-friendly summaries below — already-derived
// topology/gridType/loadsCount/peakW/dailyKwh instead of a full
// ResidentialOptions/SavedProject so either can be called both from a
// SavedProject (Projeto tab) and from the live wizard state (Dimensionamento
// tab's Resumo, which already has peakW/dailyKwh precomputed and a narrower
// residentialOptions prop shape).
export type ShareableProject = {
  name: string;
  address?: Address;
  topology: BatteryTopology | null;
  gridType: ResidentialGridType | null;
  loadsCount: number;
  peakW: number;
  dailyKwh: number;
  solution: Solution | null;
};

export type ShareableBatteryCatalog = {
  model: string;
  standardPowerKw: number | null;
  peakPowerKw: number | null;
  expansionModel?: string | null;
}[];

function buildConfigLines(project: ShareableProject): string[] {
  const { topology, gridType, loadsCount, peakW, dailyKwh } = project;
  const lines: string[] = ['*Configuração:*'];
  if (topology) lines.push(`- Topologia: ${topologyLabels[topology]}`);
  if (gridType) lines.push(`- Rede: ${gridLabels[gridType]}`);
  lines.push(`- ${loadsCount} carga(s) cadastrada(s)`);
  lines.push(`- Pico: ${(peakW / 1000).toFixed(2)} kVA`);
  lines.push(`- Consumo: ${dailyKwh.toFixed(2)} kWh/dia`);
  return lines;
}

function buildSolutionLines(solution: Solution, batteryCatalog: ShareableBatteryCatalog): string[] {
  const metrics = solutionMetrics(solution, batteryCatalog);
  const batteryParts = batteryQuantityBreakdown(
    solution.batteryModel,
    solution.batteryQty,
    batteryCatalog,
    (solution.inverterQty ?? 1) * (solution.batteryPortsUsed ?? 1)
  );

  const lines: string[] = ['*Solução recomendada:*', `- Inversor: ${solution.inverterModel} × ${solution.inverterQty ?? 1}`];
  batteryParts.forEach((part, index) => {
    lines.push(`- Bateria${index > 0 ? ' (expansão)' : ''}: ${part.model} × ${part.qty}`);
  });
  if (solution.pvPowerKw) lines.push(`- Fotovoltaico: ${solution.pvPowerKw.toFixed(2)} kWp`);
  lines.push(
    `- Nominal: ${metrics.nominalW != null ? (metrics.nominalW / 1000).toFixed(2) : '-'} kVA · Máxima: ${
      metrics.peakW != null ? (metrics.peakW / 1000).toFixed(2) : '-'
    } kVA · Energia: ${metrics.energyKwh.toFixed(2)} kWh`
  );

  // Bundled accessories (already included with the inverter/battery) aren't
  // something that needs quoting/listing separately, so they're left out —
  // only standalone required/optional items go in.
  const quotableAccessories = solution.accessories
    .map((accessory) => normalizeAccessoryLine(accessory))
    .filter((accessory) => !accessory.bundled);
  if (quotableAccessories.length > 0) {
    lines.push('', '*Acessórios:*');
    for (const { model, qty, optional } of quotableAccessories) {
      lines.push(`- ${model}${qty !== 1 ? ` × ${qty}` : ''} (${optional ? 'opcional' : 'obrigatório'})`);
    }
  }
  return lines;
}

/** Plain-text, WhatsApp-friendly (using its *bold* markup) summary of a
 * project, addressed *upstream* — meant for the installer to send to their
 * own supplier/distributor asking for pricing on that exact
 * configuration/solution, not to the end client (no pricing is included; see
 * `buildClientQuoteText` for the client-facing version). */
export function buildProjectShareText(
  project: ShareableProject,
  clientName: string | undefined,
  batteryCatalog: ShareableBatteryCatalog
): string {
  const lines: string[] = [`*Projeto: ${project.name || 'Sem nome'}*`];
  if (clientName) lines.push(`Cliente: ${clientName}`);
  if (project.address && !isAddressEmpty(project.address)) lines.push(`Endereço: ${formatAddress(project.address)}`);

  lines.push('', ...buildConfigLines(project));
  lines.push('', ...(project.solution ? buildSolutionLines(project.solution, batteryCatalog) : ['Solução ainda não calculada.']));
  lines.push('', 'Poderia me passar um orçamento para essa solução?');

  return lines.join('\n');
}

/** Email counterpart to `buildProjectShareText` — same technical summary
 * (config + solution), but as a plain-text email body instead of a
 * WhatsApp-bound clipboard string: no `*bold*` markup (doesn't render in an
 * email), and leads with the requester's own company data (name, CNPJ/CPF,
 * phone, address) so the supplier has what it needs to issue an NF and quote
 * freight, alongside the solution to be priced. */
export function buildSupplierQuoteRequestEmail(
  project: ShareableProject,
  profile: InlineProfile,
  batteryCatalog: ShareableBatteryCatalog
): string {
  const lines: string[] = [
    `Olá! Gostaria de solicitar uma cotação para a solução abaixo${project.name ? ` (projeto: ${project.name})` : ''}.`,
    '',
    'Dados para nota fiscal e frete:',
    `- Empresa: ${profile.companyName || profile.fullName}`,
  ];
  if (profile.companyDocument) lines.push(`- CNPJ/CPF: ${profile.companyDocument}`);
  if (profile.phone) lines.push(`- Telefone: ${profile.phone}`);
  if (profile.email) lines.push(`- Email: ${profile.email}`);
  if (!isAddressEmpty(profile.companyAddress)) {
    lines.push(`- Endereço de entrega: ${formatAddress(profile.companyAddress)}`);
  }

  lines.push('', ...buildConfigLines(project));
  lines.push('', ...(project.solution ? buildSolutionLines(project.solution, batteryCatalog) : ['Solução ainda não calculada.']));
  lines.push('', 'Poderiam nos passar valores e prazo de entrega/frete para esses itens?');

  // buildConfigLines/buildSolutionLines use WhatsApp's *bold* markup, which
  // would just show up as literal asterisks in an email body.
  return lines.join('\n').replace(/\*/g, '');
}

/** Client-facing counterpart to `buildProjectShareText` — same technical
 * summary, but addressed *to* the client with the priced total instead of
 * asking a supplier for one, meant to be sent straight over WhatsApp
 * (`buildWhatsAppShareUrl`) as a lightweight alternative to the full PDF
 * report for a quick first contact. */
export function buildClientQuoteText(
  project: ShareableProject,
  clientName: string | undefined,
  batteryCatalog: ShareableBatteryCatalog,
  services: ProjectServiceLine[],
  systemCost: SystemCostEstimate | null,
  companyName?: string
): string {
  const lines: string[] = [`*Orçamento: ${project.name || 'Sem nome'}*`];
  if (clientName) lines.push(`Cliente: ${clientName}`);
  if (project.address && !isAddressEmpty(project.address)) lines.push(`Endereço: ${formatAddress(project.address)}`);

  lines.push('', ...buildConfigLines(project));
  lines.push('', ...(project.solution ? buildSolutionLines(project.solution, batteryCatalog) : ['Solução ainda não calculada.']));

  if (services.length > 0) {
    lines.push('', '*Serviços inclusos:*');
    for (const line of services) {
      const detail = systemCost?.serviceDetails?.find((item) => item.serviceId === line.serviceId);
      const quantity = detail?.quantity != null
        ? ` × ${detail.quantity.toFixed(2).replace(/\.00$/, '')} ${servicePricingUnitLabel(detail.pricingUnit)}`
        : line.qty !== 1 ? ` × ${line.qty}` : '';
      const total = detail?.total != null ? ` — ${formatCurrencyBRL(detail.total)}` : '';
      lines.push(`- ${line.name}${quantity}${total}`);
    }
  }

  if (systemCost && systemCost.pricedItemsCount > 0) {
    lines.push('', `*Investimento total: ${formatCurrencyBRL(systemCost.totalCost)}*`);
    if (!systemCost.isComplete) lines.push('_Valor parcial: ainda faltam itens com preço cadastrado._');
  }

  lines.push('', 'Fico à disposição para dúvidas!');
  if (companyName) lines.push(companyName);

  return lines.join('\n');
}

/** Opens WhatsApp with `text` pre-filled for `phone` — returns null when the
 * number doesn't look like a valid Brazilian phone (fewer than 10 digits:
 * DDD + number), so callers can disable the send action instead of opening
 * a broken link. Prefixes the country code (55) when the stored number
 * doesn't already carry one, since wa.me needs the full digit string. */
export function buildWhatsAppShareUrl(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const fullNumber = digits.length > 11 ? digits : `55${digits}`;
  return `https://wa.me/${fullNumber}?text=${encodeURIComponent(text)}`;
}

/** Frozen, customer-safe copy of a project's quote — everything a public
 * quote-share link (quote_shares table) needs to render, with nothing that
 * requires the installer's private tables (userStockItems, marginSettings,
 * catalogs) to redisplay later, since the end customer has no session to
 * read those. Deliberately excludes MarginSettings/unitValue (the
 * installer's cost/margin, never shown to a customer), Solution.solutionCode/
 * sourceFile (internal rule identifiers — see project-quote-pdf.tsx's
 * "Referência técnica"), and Client.notes (the installer's private CRM
 * note). */
export interface QuoteShareSnapshot {
  companyName: string | null;
  companyLogoUrl: string | null;
  projectName: string;
  clientName: string | null;
  generatedAt: string;
  nominalW: number;
  peakW: number;
  dailyKwh: number;
  desiredFeatures: DesiredFeatureId[];
  whiteTariff: WhiteTariffConfig | null;
  pv: PvConfig | null;
  pvPowerKw: number | null;
  pvMonthlyGenerationKwh: number | null;
  microgrid: MicrogridConfig | null;
  generator: GeneratorConfig | null;
  products: { category: string; model: string; qty: number }[];
  services: { name: string; qty: number | null; unitLabel: string; total: number | null }[];
  marginRows: MarginRow[];
  systemCost: { totalCost: number; isComplete: boolean } | null;
  tariffSavings: TariffSavingsEstimate | null;
}

/** Builds the snapshot persisted into quote_shares.snapshot at share time —
 * same computations project-quote-pdf.tsx's ProjectQuotePdfDocument already
 * runs (calculateSystemCost, calculateTariffSavings, buildMarginSummary),
 * trimmed to the customer-facing subset described on QuoteShareSnapshot.
 * Returns null when the project has no calculated solution yet, mirroring
 * buildProjectQuotePdfInputFromSavedProject's same guard. */
export function buildQuoteShareSnapshot(
  project: SavedProject,
  {
    client,
    profile,
    userStockItems,
    marginSettings,
    userServices,
    batteryCatalog,
    inverterCatalog = [],
  }: {
    client: Client | null;
    profile: InlineProfile | null;
    userStockItems: UserStockItem[];
    marginSettings?: MarginSettings;
    userServices?: UserServiceItem[];
    batteryCatalog: BatteryCatalogOption[];
    inverterCatalog?: InverterCatalogOption[];
  }
): QuoteShareSnapshot | null {
  const { solution, residentialOptions, services = [] } = project;
  if (!solution) return null;

  const nominalW = totalNominalW(residentialOptions.loads);
  const peakW = totalPeakW(residentialOptions.loads, residentialOptions.peakCalcMode ?? 'sum');
  const dailyKwh = totalDailyKwh(residentialOptions.loads, residentialOptions.operationHours);

  const batteryPerformance = batteryCatalog.find((item) => item.model === solution.batteryModel);
  const inverterPerformance = inverterCatalog.find((item) => item.model === solution.inverterModel);
  const tariffSavings = calculateTariffSavings(residentialOptions.whiteTariff, {
    totalMonthlyConsumptionKwh:
      residentialOptions.whiteTariff?.totalMonthlyConsumptionKwh || residentialOptions.pv?.monthlyConsumptionKwh || null,
    availableEnergyWh: solution.availableEnergyWh ?? 0,
    pvMonthlyGenerationKwh: solution.pvMonthlyGenerationKwh,
    batteryRoundTripEfficiencyPercent: batteryPerformance?.roundTripEfficiencyPercent ?? 95,
    inverterChargeEfficiencyPercent: inverterPerformance?.batteryChargeEfficiencyPercent ?? 97,
    inverterDischargeEfficiencyPercent: inverterPerformance?.batteryDischargeEfficiencyPercent ?? 97,
    initialSohPercent: batteryPerformance?.initialSohPercent ?? 100,
    annualSohLossPercent: batteryPerformance?.annualSohLossPercent ?? 2,
    standbyConsumptionW: inverterPerformance?.standbyConsumptionW ?? 0,
    maxBatteryDischargePowerW: inverterPerformance?.maxBatteryDischargePowerW ?? null,
    maxBatteryChargePowerW: inverterPerformance?.maxBatteryChargePowerW ?? null,
  });

  const systemCostEstimate = calculateSystemCost(solution, userStockItems, services, userServices, marginSettings, batteryCatalog, residentialOptions);
  const systemCost =
    systemCostEstimate.pricedItemsCount > 0
      ? { totalCost: systemCostEstimate.totalCost, isComplete: systemCostEstimate.isComplete }
      : null;

  const marginRows = solution.microgridAlternative
    ? []
    : buildMarginSummary({
        desiredFeatures: residentialOptions.desiredFeatures,
        whiteTariff: residentialOptions.whiteTariff,
        microgrid: residentialOptions.microgrid,
        pv: residentialOptions.pv,
        nominalW,
        peakW,
        dailyKwh,
        solution,
      });

  const products: QuoteShareSnapshot['products'] = [
    { category: 'Inversor', model: solution.inverterModel, qty: solution.inverterQty ?? 1 },
  ];
  const batteryParts = batteryQuantityBreakdown(
    solution.batteryModel,
    solution.batteryQty,
    batteryCatalog,
    (solution.inverterQty ?? 1) * (solution.batteryPortsUsed ?? 1)
  );
  batteryParts.forEach((part, index) => {
    products.push({ category: index === 0 ? 'Bateria' : 'Bateria (expansão)', model: part.model, qty: part.qty });
  });
  solution.accessories.forEach((accessory) => {
    const { model, qty } = normalizeAccessoryLine(accessory);
    products.push({ category: 'Acessório', model, qty });
  });

  return {
    companyName: profile?.companyName ?? null,
    companyLogoUrl: profile?.companyLogoUrl ?? null,
    projectName: project.name,
    clientName: client?.name ?? null,
    generatedAt: new Date().toISOString(),
    nominalW,
    peakW,
    dailyKwh,
    desiredFeatures: residentialOptions.desiredFeatures,
    whiteTariff: residentialOptions.whiteTariff,
    pv: residentialOptions.pv,
    pvPowerKw: solution.pvPowerKw,
    pvMonthlyGenerationKwh: solution.pvMonthlyGenerationKwh ?? null,
    microgrid: residentialOptions.microgrid,
    generator: residentialOptions.generator,
    products,
    services: (systemCostEstimate.serviceDetails ?? []).map((detail) => ({ name: detail.name, qty: detail.quantity, unitLabel: servicePricingUnitLabel(detail.pricingUnit), total: detail.total })),
    marginRows,
    systemCost,
    tariffSavings,
  };
}

export interface TariffSavingsEstimate {
  monthlySavings: number;
  annualSavings: number;
  businessDaysPerMonth: number;
  /** Absolute monthly bill estimates — only present when a total monthly
   * consumption was given (Fotovoltaico's monthlyConsumptionKwh, when that
   * feature is also enabled) AND it's large enough to cover the ponta +
   * intermediária energy on its own; otherwise these stay null and only the
   * delta (monthlySavings/annualSavings) is shown, rather than a breakdown
   * that would contradict the customer's own total. */
  monthlyCostWithoutSolaxBrl: number | null;
  monthlyCostWithSolaxBrl: number | null;
  /** Portion of monthlySavings from PV generation that never touches the
   * battery — already full, or the tariff windows are already fully served
   * — credited at the fora ponta rate. Zero when there's no PV generation
   * estimate, or when it's small enough that the battery absorbs all of it
   * (see batteryMonthlySavings). Always 0 <= pvMonthlySavings <= monthlySavings. */
  pvMonthlySavings: number;
  /** Savings from everything the battery discharges into the ponta/
   * intermediária windows, whichever source charged it — solar (capped by
   * the battery's daily capacity, see calculateTariffSavings) or grid. */
  batteryMonthlySavings: number;
  /** False when ponta/intermediária are not actually more expensive than
   * fora ponta, making the arbitrage estimate misleading or negative. */
  tariffOrderValid: boolean;
  effectiveRoundTripEfficiencyPct: number;
  initialSohPercent: number;
  annualSohLossPercent: number;
  standbyMonthlyCost: number;
  dailyPontaServedKwh: number;
  dailyIntermediateServedKwh: number;
}

/** Tarifa Branca's peak surcharge applies on business days — used as the
 * standard monthly multiplier for the savings estimate. */
export const TARIFF_BUSINESS_DAYS_PER_MONTH = 22;

/** Calendar days per month used to spread PV's own monthly generation
 * estimate (computePvMonthlyGenerationKwh in the Edge Function) back into a
 * daily figure — solar generates every day, unlike the tariff windows above
 * which only apply on business days. */
const DAYS_PER_MONTH = 30;
const PONTA_WINDOW_HOURS = 3;
const INTERMEDIATE_WINDOW_HOURS = 2;

export function isWhiteTariffConfigIncomplete(
  desiredFeatures: DesiredFeatureId[],
  whiteTariff: WhiteTariffConfig | null
) {
  if (!desiredFeatures.includes('white_tariff')) return false;
  if (!whiteTariff) return true;
  const total = whiteTariff.totalMonthlyConsumptionKwh ?? 0;
  const expensiveMonthlyKwh =
    ((whiteTariff.pontaEnergyWh + whiteTariff.intermediateEnergyWh) / 1000) *
    (whiteTariff.businessDaysPerMonth ?? TARIFF_BUSINESS_DAYS_PER_MONTH);
  return !(
    whiteTariff.requiredPowerW > 0 &&
    (whiteTariff.pontaEnergyWh > 0 || whiteTariff.intermediateEnergyWh > 0) &&
    whiteTariff.pontaTariffPerKwh > 0 &&
    whiteTariff.intermediateTariffPerKwh > 0 &&
    whiteTariff.foraPontaTariffPerKwh > 0 &&
    whiteTariff.pontaTariffPerKwh >= whiteTariff.foraPontaTariffPerKwh &&
    whiteTariff.intermediateTariffPerKwh >= whiteTariff.foraPontaTariffPerKwh &&
    total > 0 &&
    expensiveMonthlyKwh <= total
  );
}

export interface EnergyPerformanceOptions {
  batteryRoundTripEfficiencyPercent?: number;
  inverterChargeEfficiencyPercent?: number;
  inverterDischargeEfficiencyPercent?: number;
  initialSohPercent?: number;
  annualSohLossPercent?: number;
  standbyConsumptionW?: number;
  maxBatteryDischargePowerW?: number | null;
  maxBatteryChargePowerW?: number | null;
}

/** Simple payback with battery savings reduced by the catalogued SOH loss
 * each year. PV savings remain independent from battery ageing. */
export function calculateDegradedPaybackMonths(
  investment: number,
  savings: Pick<TariffSavingsEstimate, 'batteryMonthlySavings' | 'pvMonthlySavings' | 'annualSohLossPercent'>,
  maxYears = 25
) {
  if (!(investment > 0)) return null;
  let accumulated = 0;
  const annualFade = Math.max(0, Math.min(0.99, savings.annualSohLossPercent / 100));
  for (let month = 1; month <= maxYears * 12; month += 1) {
    const yearIndex = Math.floor((month - 1) / 12);
    const monthlyBatterySavings = Math.max(0, savings.batteryMonthlySavings) * (1 - annualFade) ** yearIndex;
    accumulated += monthlyBatterySavings + Math.max(0, savings.pvMonthlySavings);
    if (accumulated >= investment) return month;
  }
  return null;
}

/** Combined estimate of "Ganho com SolaX" — battery-shift savings from
 * Tarifa Branca plus PV generation savings, folded into a single figure
 * (see pvMonthlySavings for the PV-only breakdown). Null when white_tariff
 * isn't configured.
 *
 * `batteryMonthlySavings` is the value of *all* energy the battery discharges
 * into the ponta/intermediária windows, regardless of what charged it —
 * grid-charged energy is valued at the spread against the fora ponta rate
 * (the battery recharges at the cheap fora ponta rate to cover it);
 * solar-charged energy is valued at the *full* ponta/intermediária tariff,
 * since it cost nothing to put in. Solar's share of that daily discharge can
 * never exceed the battery's own daily capacity (`availableEnergyWh`), and
 * ponta gets first claim on it (the pricier window). `pvMonthlySavings` is
 * only the solar left over once the battery is full and both windows are
 * already fully served — credited separately at the fora ponta rate, and
 * deliberately excluded from calculateDegradedPaybackMonths' SOH fade since
 * it never depends on battery health.
 *
 * When `totalMonthlyConsumptionKwh` is given (Fotovoltaico's own
 * monthlyConsumptionKwh, when that feature is enabled too), also derives two
 * absolute monthly totals — what the bill would be without and with SolaX —
 * by splitting the total into ponta energy, intermediária energy (both
 * already known) and the remaining fora ponta energy (never stored
 * directly, always derived as the leftover). The difference between the two
 * totals normally equals monthlySavings — this is the same figure, just
 * decomposed instead of shown as a bare delta. The projected bill is clamped
 * at zero for pathological inputs where estimated savings exceed the bill. */
export function calculateTariffSavings(
  whiteTariff: WhiteTariffConfig | null,
  options: {
    totalMonthlyConsumptionKwh?: number | null;
    /** The solution's battery capacity (Wh) — caps how much daily PV
     * generation can be credited at the ponta/intermediária tariffs instead
     * of fora ponta. */
    availableEnergyWh?: number;
    pvMonthlyGenerationKwh?: number | null;
  } & EnergyPerformanceOptions = {}
): TariffSavingsEstimate | null {
  if (!whiteTariff) return null;
  const {
    totalMonthlyConsumptionKwh = null,
    availableEnergyWh = 0,
    pvMonthlyGenerationKwh = null,
    batteryRoundTripEfficiencyPercent = 100,
    inverterChargeEfficiencyPercent = 100,
    inverterDischargeEfficiencyPercent = 100,
    initialSohPercent = 100,
    annualSohLossPercent = 0,
    standbyConsumptionW = 0,
    maxBatteryDischargePowerW = null,
    maxBatteryChargePowerW = null,
  } = options;

  const dailyPontaKwh = whiteTariff.pontaEnergyWh / 1000;
  const dailyIntermediateKwh = whiteTariff.intermediateEnergyWh / 1000;
  const businessDays = whiteTariff.businessDaysPerMonth ?? TARIFF_BUSINESS_DAYS_PER_MONTH;
  const pontaWindowHours = whiteTariff.pontaWindowHours ?? PONTA_WINDOW_HOURS;
  const intermediateWindowHours = whiteTariff.intermediateWindowHours ?? INTERMEDIATE_WINDOW_HOURS;
  const batteryRte = Math.max(0.01, Math.min(1, batteryRoundTripEfficiencyPercent / 100));
  const chargeEfficiency = Math.max(0.01, Math.min(1, inverterChargeEfficiencyPercent / 100));
  const dischargeEfficiency = Math.max(0.01, Math.min(1, inverterDischargeEfficiencyPercent / 100));
  const effectiveRte = batteryRte * chargeEfficiency * dischargeEfficiency;
  const sohFactor = Math.max(0.01, Math.min(1, initialSohPercent / 100));
  const hasCapacityLimit = availableEnergyWh > 0;
  const sohAdjustedCapacityKwh = hasCapacityLimit
    ? (availableEnergyWh / 1000) * sohFactor * dischargeEfficiency
    : Number.POSITIVE_INFINITY;
  const maxChargeKw = maxBatteryChargePowerW && maxBatteryChargePowerW > 0
    ? maxBatteryChargePowerW / 1000
    : Number.POSITIVE_INFINITY;
  const dailyBatteryCapacityKwh = Math.min(sohAdjustedCapacityKwh, maxChargeKw * 19 * effectiveRte);
  const dailySolarKwh = pvMonthlyGenerationKwh ? pvMonthlyGenerationKwh / DAYS_PER_MONTH : 0;

  const pontaSpread = whiteTariff.pontaTariffPerKwh - whiteTariff.foraPontaTariffPerKwh;
  const intermediateSpread = whiteTariff.intermediateTariffPerKwh - whiteTariff.foraPontaTariffPerKwh;
  const maxDischargeKw = maxBatteryDischargePowerW && maxBatteryDischargePowerW > 0
    ? maxBatteryDischargePowerW / 1000
    : Number.POSITIVE_INFINITY;
  const gridPontaEconomical = whiteTariff.pontaTariffPerKwh > whiteTariff.foraPontaTariffPerKwh / effectiveRte;
  const gridIntermediateEconomical = whiteTariff.intermediateTariffPerKwh > whiteTariff.foraPontaTariffPerKwh / effectiveRte;
  const pontaPotentialKwh = Math.min(dailyPontaKwh, maxDischargeKw * pontaWindowHours);
  const intermediatePotentialKwh = Math.min(dailyIntermediateKwh, maxDischargeKw * intermediateWindowHours);
  const pontaFirst = whiteTariff.pontaTariffPerKwh >= whiteTariff.intermediateTariffPerKwh;
  const firstPotential = pontaFirst ? pontaPotentialKwh : intermediatePotentialKwh;
  const firstServed = Math.min(firstPotential, dailyBatteryCapacityKwh);
  const secondServed = Math.min(
    pontaFirst ? intermediatePotentialKwh : pontaPotentialKwh,
    Math.max(0, dailyBatteryCapacityKwh - firstServed)
  );
  const dailyPontaServedKwh = pontaFirst ? firstServed : secondServed;
  const dailyIntermediateServedKwh = pontaFirst ? secondServed : firstServed;
  const dailyDeliveredKwh = dailyPontaServedKwh + dailyIntermediateServedKwh;
  const dailyPvDeliveredKwh = Math.min(dailyDeliveredKwh, dailySolarKwh * effectiveRte);
  const solarFirst = Math.min(dailyPvDeliveredKwh, pontaFirst ? dailyPontaServedKwh : dailyIntermediateServedKwh);
  const solarSecond = Math.min(
    dailyPvDeliveredKwh - solarFirst,
    pontaFirst ? dailyIntermediateServedKwh : dailyPontaServedKwh
  );
  const dailySolarToPonta = pontaFirst ? solarFirst : solarSecond;
  const dailySolarToIntermediate = pontaFirst ? solarSecond : solarFirst;
  const dailyGridToPonta = gridPontaEconomical ? dailyPontaServedKwh - dailySolarToPonta : 0;
  const dailyGridToIntermediate = gridIntermediateEconomical
    ? dailyIntermediateServedKwh - dailySolarToIntermediate
    : 0;
  const dailySolarInputUsedKwh = dailyPvDeliveredKwh / effectiveRte;
  const dailySolarExcessKwh = Math.max(0, dailySolarKwh - dailySolarInputUsedKwh);
  const monthlyPontaSavings = businessDays * (
    dailySolarToPonta * whiteTariff.pontaTariffPerKwh +
    dailyGridToPonta * (whiteTariff.pontaTariffPerKwh - whiteTariff.foraPontaTariffPerKwh / effectiveRte)
  );
  const monthlyIntermediateSavings = businessDays * (
    dailySolarToIntermediate * whiteTariff.intermediateTariffPerKwh +
    dailyGridToIntermediate * (whiteTariff.intermediateTariffPerKwh - whiteTariff.foraPontaTariffPerKwh / effectiveRte)
  );
  const monthlyExcessSolarSavings = dailySolarExcessKwh * whiteTariff.foraPontaTariffPerKwh * DAYS_PER_MONTH;

  const standbyMonthlyCost = Math.max(0, standbyConsumptionW) * 24 * DAYS_PER_MONTH / 1000 * whiteTariff.foraPontaTariffPerKwh;
  // Everything the battery discharges into ponta/intermediária, whichever
  // source charged it — solar or grid. Folding solar-charged discharge in
  // here (instead of under pvMonthlySavings) means this figure never reads
  // as "0" just because PV happens to cover 100% of what the battery is
  // shifting; it also means calculateDegradedPaybackMonths' SOH fade now
  // correctly applies to that portion too, since a degraded battery holds
  // less of either source.
  const batteryMonthlySavings = Math.max(0, monthlyPontaSavings + monthlyIntermediateSavings - standbyMonthlyCost);
  // Solar generation that never touches the battery at all (already full,
  // or the tariff windows are already fully served) — credited at the fora
  // ponta rate regardless of battery health, so kept out of SOH fade.
  const pvMonthlySavings = monthlyExcessSolarSavings;
  const monthlySavings = batteryMonthlySavings + pvMonthlySavings;
  const tariffOrderValid = pontaSpread >= 0 && intermediateSpread >= 0;

  let monthlyCostWithoutSolaxBrl: number | null = null;
  let monthlyCostWithSolaxBrl: number | null = null;
  if (totalMonthlyConsumptionKwh !== null) {
    const monthlyPontaKwh = dailyPontaKwh * businessDays;
    const monthlyIntermediateKwh = dailyIntermediateKwh * businessDays;
    const monthlyForaPontaKwh = totalMonthlyConsumptionKwh - monthlyPontaKwh - monthlyIntermediateKwh;
    if (monthlyForaPontaKwh >= 0) {
      monthlyCostWithoutSolaxBrl =
        monthlyPontaKwh * whiteTariff.pontaTariffPerKwh +
        monthlyIntermediateKwh * whiteTariff.intermediateTariffPerKwh +
        monthlyForaPontaKwh * whiteTariff.foraPontaTariffPerKwh;
      monthlyCostWithSolaxBrl = Math.max(0, monthlyCostWithoutSolaxBrl - Math.max(0, monthlySavings));
    }
  }

  return {
    monthlySavings,
    annualSavings: monthlySavings * 12,
    businessDaysPerMonth: businessDays,
    monthlyCostWithoutSolaxBrl,
    monthlyCostWithSolaxBrl,
    pvMonthlySavings,
    batteryMonthlySavings,
    tariffOrderValid,
    effectiveRoundTripEfficiencyPct: effectiveRte * 100,
    initialSohPercent: sohFactor * 100,
    annualSohLossPercent: Math.max(0, annualSohLossPercent),
    standbyMonthlyCost,
    dailyPontaServedKwh,
    dailyIntermediateServedKwh,
  };
}
