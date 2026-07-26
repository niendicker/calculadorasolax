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
import { gridLabels, topologyLabels } from './types';

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
}

const noMargin: MarginSettings = { inverterPercent: 0, batteryPercent: 0, accessoryPercent: 0 };

const marginFieldByProductType: Record<StockProductType, keyof MarginSettings> = {
  inverter: 'inverterPercent',
  battery: 'batteryPercent',
  accessory: 'accessoryPercent',
};

/** Sums the user's own stock price for every model in the solution (inverter,
 * battery, each accessory) by quantity — marked up by the matching category's
 * sell margin (see MarginSettings) — plus the project's own services (priced
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
  marginSettings: MarginSettings = noMargin
): SystemCostEstimate {
  function priceFor(productType: StockProductType, model: string): number | undefined {
    const unitValue = userStockItems.find(
      (item) => item.productType === productType && item.productModel === model
    )?.unitValue;
    if (unitValue === undefined) return undefined;
    const marginPercent = marginSettings[marginFieldByProductType[productType]];
    return unitValue * (1 + marginPercent / 100);
  }

  const productItems: { productType: StockProductType; model: string; qty: number }[] = solution
    ? [
        { productType: 'inverter', model: solution.inverterModel, qty: solution.inverterQty ?? 1 },
        { productType: 'battery', model: solution.batteryModel, qty: solution.batteryQty },
        ...solution.accessories.map((accessory) => {
          const { model, qty } = normalizeAccessoryLine(accessory);
          return { productType: 'accessory' as const, model, qty };
        }),
      ]
    : [];

  let totalCost = 0;
  let pricedItemsCount = 0;

  for (const item of productItems) {
    const unitValue = priceFor(item.productType, item.model);
    if (unitValue !== undefined) {
      totalCost += unitValue * item.qty;
      pricedItemsCount += 1;
    }
  }

  for (const line of services) {
    const unitValue = userServices.find((service) => service.id === line.serviceId)?.unitValue;
    if (unitValue !== undefined) {
      totalCost += unitValue * line.qty;
      pricedItemsCount += 1;
    }
  }

  const totalItemsCount = productItems.length + services.length;

  return {
    totalCost,
    pricedItemsCount,
    totalItemsCount,
    isComplete: pricedItemsCount === totalItemsCount,
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
 * displayed for units 2..N, using the Master row's expansionModel.
 *
 * Each battery port is its own physical string and needs its own Master at
 * the head of the chain — mastersNeeded should be inverterQty × the
 * solution's battery ports in use, not a flat 1, or a multi-port/
 * multi-inverter solution ends up short a Master in this breakdown. Defaults
 * to 1 for callers that don't have that data (e.g. older saved projects). */
export function batteryQuantityBreakdown(
  model: string,
  quantity: number,
  batteryCatalog: { model: string; expansionModel?: string | null }[],
  mastersNeeded = 1
): BatteryQuantityPart[] {
  const expansionModel = batteryCatalog.find((battery) => battery.model === model)?.expansionModel;
  if (!expansionModel || quantity <= 1) return [{ model, qty: quantity }];

  const masters = Math.min(quantity, Math.max(1, mastersNeeded));
  const slaves = quantity - masters;
  if (slaves <= 0) return [{ model, qty: quantity }];

  return [
    { model, qty: masters },
    { model: expansionModel, qty: slaves },
  ];
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

/** Mirrors effectiveTargetEnergyWh from the same Edge Function file: the
 * battery must cover both expensive windows (ponta + intermediária). */
export function effectiveTargetEnergyWh(
  desiredFeatures: DesiredFeatureId[],
  whiteTariff: WhiteTariffConfig | null,
  baseTargetEnergyWh: number
): number {
  if (!desiredFeatures.includes('white_tariff') || !whiteTariff) return baseTargetEnergyWh;
  return (
    whiteTariff.pontaEnergyWh +
    whiteTariff.intermediateEnergyWh +
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
}

/** Tarifa Branca's peak surcharge applies on business days — used as the
 * standard monthly multiplier for the savings estimate. */
export const TARIFF_BUSINESS_DAYS_PER_MONTH = 22;

/** Calendar days per month used to spread PV's own monthly generation
 * estimate (computePvMonthlyGenerationKwh in the Edge Function) back into a
 * daily figure — solar generates every day, unlike the tariff windows above
 * which only apply on business days. */
const DAYS_PER_MONTH = 30;

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
 * totals always equals monthlySavings — this is the same figure, just
 * decomposed instead of shown as a bare delta. */
export function calculateTariffSavings(
  whiteTariff: WhiteTariffConfig | null,
  options: {
    totalMonthlyConsumptionKwh?: number | null;
    /** The solution's battery capacity (Wh) — caps how much daily PV
     * generation can be credited at the ponta/intermediária tariffs instead
     * of fora ponta. */
    availableEnergyWh?: number;
    pvMonthlyGenerationKwh?: number | null;
  } = {}
): TariffSavingsEstimate | null {
  if (!whiteTariff) return null;
  const { totalMonthlyConsumptionKwh = null, availableEnergyWh = 0, pvMonthlyGenerationKwh = null } = options;

  const dailyPontaKwh = whiteTariff.pontaEnergyWh / 1000;
  const dailyIntermediateKwh = whiteTariff.intermediateEnergyWh / 1000;
  const dailyBatteryCapacityKwh = availableEnergyWh / 1000;
  const dailySolarKwh = pvMonthlyGenerationKwh ? pvMonthlyGenerationKwh / DAYS_PER_MONTH : 0;

  const dailySolarToBattery = Math.min(dailySolarKwh, dailyBatteryCapacityKwh);
  const dailySolarToPonta = Math.min(dailySolarToBattery, dailyPontaKwh);
  const dailySolarToIntermediate = Math.min(dailySolarToBattery - dailySolarToPonta, dailyIntermediateKwh);
  const dailySolarExcessKwh = dailySolarKwh - dailySolarToPonta - dailySolarToIntermediate;

  const pontaSpread = whiteTariff.pontaTariffPerKwh - whiteTariff.foraPontaTariffPerKwh;
  const intermediateSpread = whiteTariff.intermediateTariffPerKwh - whiteTariff.foraPontaTariffPerKwh;

  const monthlyPontaSavings =
    TARIFF_BUSINESS_DAYS_PER_MONTH *
    (dailySolarToPonta * whiteTariff.pontaTariffPerKwh + (dailyPontaKwh - dailySolarToPonta) * pontaSpread);
  const monthlyIntermediateSavings =
    TARIFF_BUSINESS_DAYS_PER_MONTH *
    (dailySolarToIntermediate * whiteTariff.intermediateTariffPerKwh +
      (dailyIntermediateKwh - dailySolarToIntermediate) * intermediateSpread);
  const monthlyExcessSolarSavings = dailySolarExcessKwh * whiteTariff.foraPontaTariffPerKwh * DAYS_PER_MONTH;

  const pvMonthlySavings =
    TARIFF_BUSINESS_DAYS_PER_MONTH *
      (dailySolarToPonta * whiteTariff.pontaTariffPerKwh + dailySolarToIntermediate * whiteTariff.intermediateTariffPerKwh) +
    monthlyExcessSolarSavings;

  const monthlySavings = monthlyPontaSavings + monthlyIntermediateSavings + monthlyExcessSolarSavings;

  let monthlyCostWithoutSolaxBrl: number | null = null;
  let monthlyCostWithSolaxBrl: number | null = null;
  if (totalMonthlyConsumptionKwh !== null) {
    const monthlyPontaKwh = dailyPontaKwh * TARIFF_BUSINESS_DAYS_PER_MONTH;
    const monthlyIntermediateKwh = dailyIntermediateKwh * TARIFF_BUSINESS_DAYS_PER_MONTH;
    const monthlyForaPontaKwh = totalMonthlyConsumptionKwh - monthlyPontaKwh - monthlyIntermediateKwh;
    if (monthlyForaPontaKwh >= 0) {
      monthlyCostWithoutSolaxBrl =
        monthlyPontaKwh * whiteTariff.pontaTariffPerKwh +
        monthlyIntermediateKwh * whiteTariff.intermediateTariffPerKwh +
        monthlyForaPontaKwh * whiteTariff.foraPontaTariffPerKwh;
      monthlyCostWithSolaxBrl = monthlyCostWithoutSolaxBrl - monthlySavings;
    }
  }

  return {
    monthlySavings,
    annualSavings: monthlySavings * 12,
    businessDaysPerMonth: TARIFF_BUSINESS_DAYS_PER_MONTH,
    monthlyCostWithoutSolaxBrl,
    monthlyCostWithSolaxBrl,
    pvMonthlySavings,
  };
}
