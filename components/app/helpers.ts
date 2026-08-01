import type {
  AccessoryLine,
  BatteryTopology,
  DesiredFeatureId,
  GeneratorConfig,
  MarginSettings,
  MicrogridConfig,
  ProjectServiceLine,
  PvConfig,
  ResidentialGridType,
  Solution,
  StockProductType,
  UserServiceItem,
  UserStockItem,
  WhiteTariffConfig,
} from '@/lib/types';
import { batteryQuantityBreakdown, expansionModelSet, type BatteryQuantityPart } from '@/lib/battery-quantity-breakdown';
import { gridLabels, topologyLabels } from './types';

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
  batteryCatalog: { model: string; expansionModel?: string | null }[] = []
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
    const unitValue = userServices.find((service) => service.id === line.serviceId)?.unitValue;
    if (unitValue !== undefined) {
      totalCost += unitValue * line.qty;
      pricedItemsCount += 1;
    } else {
      missingItems.push(line.name);
    }
  }

  const totalItemsCount = productItems.length + services.length;

  return {
    totalCost,
    pricedItemsCount,
    totalItemsCount,
    isComplete: pricedItemsCount === totalItemsCount,
    missingItems,
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
 * when Tarifa Branca is active, the inverter's rated/peak power floor must
 * also cover the tariff window's required power, not just the loads'. Kept
 * in sync manually since the Edge Function runs on Deno and can't be
 * imported here — this is what the server actually gated the solution on.
 * If you change this, update the Deno copy too — mirrors.test.ts next to
 * that file asserts both sides agree. */
export function effectiveTargetPowerW(
  desiredFeatures: DesiredFeatureId[],
  whiteTariff: WhiteTariffConfig | null,
  baseW: number
): number {
  if (!desiredFeatures.includes('white_tariff') || !whiteTariff) return baseW;
  return Math.max(baseW, whiteTariff.requiredPowerW);
}

/** Mirrors effectiveTargetEnergyWh from the same Edge Function file: the
 * battery must cover both expensive windows (ponta + intermediária). Same
 * manual-sync caveat as effectiveTargetPowerW above — see mirrors.test.ts. */
export function effectiveTargetEnergyWh(
  desiredFeatures: DesiredFeatureId[],
  whiteTariff: WhiteTariffConfig | null,
  baseTargetEnergyWh: number,
  roundTripEfficiencyPercent = 100
): number {
  if (!desiredFeatures.includes('white_tariff') || !whiteTariff) return baseTargetEnergyWh;
  const efficiency = Math.max(0.01, Math.min(1, roundTripEfficiencyPercent / 100));
  return (
    (whiteTariff.pontaEnergyWh + whiteTariff.intermediateEnergyWh) / efficiency +
    (whiteTariff.includeBackupReserve ? baseTargetEnergyWh : 0)
  );
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

/** Plain-text, WhatsApp-friendly (using its *bold* markup) summary of a
 * project — meant for the customer to copy and paste to their own
 * salesperson when asking for a quote on that exact configuration/solution,
 * so it needs to stand on its own without the app open (same spirit as
 * PrintableReport, just as short-form text instead of a full PDF).
 *
 * Takes already-derived topology/gridType/loadsCount/peakW/dailyKwh instead
 * of a full ResidentialOptions/SavedProject so it can be called both from a
 * SavedProject (Projeto tab) and from the live wizard state (Dimensionamento
 * tab's Resumo, which already has peakW/dailyKwh precomputed and a narrower
 * residentialOptions prop shape). */
export function buildProjectShareText(
  project: {
    name: string;
    address?: string;
    topology: BatteryTopology | null;
    gridType: ResidentialGridType | null;
    loadsCount: number;
    peakW: number;
    dailyKwh: number;
    solution: Solution | null;
  },
  clientName: string | undefined,
  batteryCatalog: { model: string; standardPowerKw: number | null; peakPowerKw: number | null; expansionModel?: string | null }[]
): string {
  const { topology, gridType, loadsCount, peakW, dailyKwh } = project;

  const lines: string[] = [`*Projeto: ${project.name || 'Sem nome'}*`];
  if (clientName) lines.push(`Cliente: ${clientName}`);
  if (project.address) lines.push(`Endereço: ${project.address}`);

  lines.push('', '*Configuração:*');
  if (topology) lines.push(`- Topologia: ${topologyLabels[topology]}`);
  if (gridType) lines.push(`- Rede: ${gridLabels[gridType]}`);
  lines.push(`- ${loadsCount} carga(s) cadastrada(s)`);
  lines.push(`- Pico: ${(peakW / 1000).toFixed(2)} kVA`);
  lines.push(`- Consumo: ${dailyKwh.toFixed(2)} kWh/dia`);

  if (project.solution) {
    const metrics = solutionMetrics(project.solution, batteryCatalog);
    const batteryParts = batteryQuantityBreakdown(
      project.solution.batteryModel,
      project.solution.batteryQty,
      batteryCatalog,
      (project.solution.inverterQty ?? 1) * (project.solution.batteryPortsUsed ?? 1)
    );

    lines.push('', '*Solução recomendada:*');
    lines.push(`- Inversor: ${project.solution.inverterModel}`);
    batteryParts.forEach((part, index) => {
      lines.push(`- Bateria${index > 0 ? ' (expansão)' : ''}: ${part.model} × ${part.qty}`);
    });
    if (project.solution.pvPowerKw) lines.push(`- Fotovoltaico: ${project.solution.pvPowerKw.toFixed(2)} kWp`);
    lines.push(
      `- Nominal: ${metrics.nominalW != null ? (metrics.nominalW / 1000).toFixed(2) : '-'} kVA · Máxima: ${
        metrics.peakW != null ? (metrics.peakW / 1000).toFixed(2) : '-'
      } kVA · Energia: ${metrics.energyKwh.toFixed(2)} kWh`
    );

    // Bundled accessories (already included with the inverter/battery) aren't
    // something the salesperson needs to quote separately, so they're left
    // out of the share text — only standalone required/optional items go in.
    const quotableAccessories = project.solution.accessories
      .map((accessory) => normalizeAccessoryLine(accessory))
      .filter((accessory) => !accessory.bundled);
    if (quotableAccessories.length > 0) {
      lines.push('', '*Acessórios:*');
      for (const { model, qty, optional } of quotableAccessories) {
        lines.push(`- ${model}${qty !== 1 ? ` × ${qty}` : ''} (${optional ? 'opcional' : 'obrigatório'})`);
      }
    }
  } else {
    lines.push('', 'Solução ainda não calculada.');
  }

  lines.push('', 'Poderia me passar um orçamento para essa solução?');

  return lines.join('\n');
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
  /** Portion of monthlySavings contributed by PV generation — either shifted
   * into the ponta/intermediária windows via the battery (capped by its
   * daily capacity, see calculateTariffSavings) or self-consumed at the fora
   * ponta rate. Zero when there's no PV generation estimate; always 0 <=
   * pvMonthlySavings <= monthlySavings. */
  pvMonthlySavings: number;
  /** Savings produced by shifting energy with the battery, excluding the
   * portion attributed to photovoltaic generation. */
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
 * Without PV, the saving is simply the ponta/intermediária energy shifted
 * off the grid, valued at the spread against the fora ponta rate (the
 * battery recharges at the cheap fora ponta rate to cover it). With PV, the
 * portion of the battery's daily charge that comes from free solar instead
 * of the grid saves the *full* ponta/intermediária tariff instead of just
 * the spread — but that portion can never exceed the battery's own daily
 * capacity (`availableEnergyWh`), and ponta gets first claim on it (the
 * pricier window). Any solar left over (battery full, or ponta/intermediária
 * already fully covered) still offsets grid consumption at the fora ponta
 * rate, same as before PV was factored in.
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

  const pvMonthlySavings =
    businessDays *
      (dailySolarToPonta * whiteTariff.pontaTariffPerKwh + dailySolarToIntermediate * whiteTariff.intermediateTariffPerKwh) +
    monthlyExcessSolarSavings;

  const standbyMonthlyCost = Math.max(0, standbyConsumptionW) * 24 * DAYS_PER_MONTH / 1000 * whiteTariff.foraPontaTariffPerKwh;
  const batteryMonthlySavings = Math.max(0, monthlyPontaSavings + monthlyIntermediateSavings - pvMonthlySavings - standbyMonthlyCost);
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
