import type { CiAccessoryContext } from './accessories.ts';
import type { CiStsContext } from './sts-types.ts';
import type { CiBatteryCatalogEntry, CiCompatibilityRule, CiModularCatalog, CiModularComposition, CiModularPrices, CiModularSelection, CiPcsCatalogEntry } from './modular-types.ts';
import type { CommercialIndustrialOptions, CommercialIndustrialResult, ScenarioCandidate } from './types.ts';
import { buildScenarioGrid, materializeScenarioDetail, type ScenarioGridInput } from './scenarios.ts';
import { recommendScenario } from './ranking.ts';

export const MAX_MODULAR_SCENARIOS = 256;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const integer = (value: unknown): value is number => positive(value) && Number.isSafeInteger(value);

export function validateModularSelection(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return ['Configure a composição PCS + baterias.'];
  const value = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (value.kind !== 'modular' || typeof value.compatibilityId !== 'string' || !value.compatibilityId) errors.push('Selecione uma compatibilidade PCS + bateria.');
  if (value.mode !== 'auto' && value.mode !== 'fixed') errors.push('Escolha dimensionamento fixo ou automático.');
  let candidates = 1;
  for (const key of ['pcs', 'series', 'parallel']) {
    const range = value[key] as { min?: unknown; max?: unknown } | undefined;
    if (!range || !integer(range.min) || !integer(range.max) || range.min > range.max) {
      errors.push(`Preencha um intervalo inteiro válido para ${key === 'pcs' ? 'PCS' : key === 'series' ? 'baterias em série' : 'strings em paralelo'}.`);
    } else {
      if (value.mode === 'fixed' && range.min !== range.max) errors.push('No modo fixo, mínimo e máximo devem ser iguais.');
      candidates *= range.max - range.min + 1;
    }
  }
  if (candidates > MAX_MODULAR_SCENARIOS) errors.push(`As faixas geram ${candidates} combinações. Reduza para até ${MAX_MODULAR_SCENARIOS}.`);
  return errors;
}

/** Approval is an explicit manufacturer/document decision, independent from these numerical checks. */
export function validateCiCompatibility(rule: CiCompatibilityRule, pcs: CiPcsCatalogEntry | undefined, battery: CiBatteryCatalogEntry | undefined, requireApproval = true): string[] {
  const errors: string[] = [];
  if (!pcs || !battery) return ['PCS ou bateria não encontrado no catálogo C&I.'];
  if (!pcs.active || !battery.active || !rule.active) errors.push('PCS, bateria e compatibilidade precisam estar ativos.');
  if (requireApproval && rule.approval_status !== 'approved') errors.push('A compatibilidade ainda não está aprovada.');
  if (rule.pcs_id !== pcs.inverter_id || rule.battery_id !== battery.battery_id) errors.push('Os equipamentos não correspondem à compatibilidade.');
  for (const [min, max, label] of [[rule.min_series, rule.max_series, 'série'], [rule.min_parallel_strings, rule.max_parallel_strings, 'paralelo'], [rule.min_pcs, rule.max_pcs, 'PCS']] as const) {
    if (!integer(min) || !integer(max) || min > max) errors.push(`Faixa de ${label} inválida na compatibilidade.`);
  }
  if (!integer(pcs.max_parallel_units) || rule.max_pcs > pcs.max_parallel_units) errors.push('Paralelismo de PCS excede o limite cadastrado.');
  const unitsPerPcs = rule.max_series * rule.max_parallel_strings;
  if (positive(pcs.maxBatteryQty) && unitsPerPcs > pcs.maxBatteryQty) errors.push('A quantidade de baterias por PCS excede o limite da ficha do inversor.');
  if (positive(battery.maxAssociationQty) && unitsPerPcs > battery.maxAssociationQty) errors.push('A associação de baterias por PCS excede o limite da ficha da bateria.');
  if (positive(pcs.maxCurrentPerPortA) && positive(pcs.batteryPorts) && Math.max(pcs.charge_current_a, pcs.discharge_current_a) > pcs.maxCurrentPerPortA * pcs.batteryPorts) errors.push('A corrente DC total C&I excede a soma dos limites das portas do inversor.');
  if (![pcs.voltageMinV, pcs.voltageMaxV, battery.voltageMinV, battery.voltageMaxV].every(positive)) errors.push('Complete as tensões DC mínima e máxima nas fichas do inversor e da bateria.');
  else if (pcs.voltageMaxV! < pcs.voltageMinV! || battery.voltageMaxV! < battery.voltageMinV! || battery.voltageMinV! * rule.min_series < pcs.voltageMinV! || battery.voltageMaxV! * rule.max_series > pcs.voltageMaxV!) errors.push('As tensões mínima e máxima do banco não cabem na janela DC do PCS.');
  if (![pcs.charge_power_kw, pcs.discharge_power_kw, pcs.charge_current_a, pcs.discharge_current_a, battery.capacityKwh, battery.charge_power_kw, battery.discharge_power_kw, battery.charge_current_a, battery.discharge_current_a].every(positive)) errors.push('Complete as potências, correntes contínuas e capacidade dos equipamentos.');
  if (![pcs.chargeEfficiencyPercent, pcs.dischargeEfficiencyPercent, battery.roundTripEfficiencyPercent].every((value) => positive(value) && value <= 100)) errors.push('Complete as eficiências nas fichas do inversor e da bateria (maiores que 0 e até 100%).');
  if (!Number.isFinite(battery.socMinPercent) || battery.socMinPercent < 0 || !positive(battery.soc_max_percent) || battery.soc_max_percent > 100 || battery.socMinPercent >= battery.soc_max_percent) errors.push('A faixa de SOC da bateria é inválida.');
  if (positive(pcs.ratedPowerKw) && pcs.discharge_power_kw > pcs.ratedPowerKw) errors.push('A potência contínua de descarga C&I excede a potência nominal da ficha do inversor.');
  if (positive(battery.maxCurrentA) && Math.max(battery.charge_current_a, battery.discharge_current_a) > battery.maxCurrentA) errors.push('A corrente contínua C&I excede a corrente máxima da ficha da bateria.');
  if (rule.supports_backup && !pcs.supports_backup) errors.push('O PCS não está cadastrado para backup.');
  if (requireApproval && [rule.reference_document, rule.revision, rule.communication_profile, rule.pcs_firmware, rule.battery_firmware].some((value) => !value?.trim())) errors.push('Informe documento, revisão, comunicação/BMS e versões de firmware aprovadas.');
  if (rule.controller_accessory_id && !integer(rule.controller_quantity_per_pcs)) errors.push('Informe a quantidade de controladores por PCS.');
  return errors;
}

export function resolveModularCatalog(catalog: CiModularCatalog, selection: CiModularSelection) {
  const errors = validateModularSelection(selection);
  const rule = catalog.rules.find((item) => item.id === selection.compatibilityId);
  if (!rule) throw new Error('Compatibilidade não encontrada, inativa ou sem aprovação.');
  const pcs = catalog.pcs.find((item) => item.inverter_id === rule.pcs_id);
  const battery = catalog.batteries.find((item) => item.battery_id === rule.battery_id);
  errors.push(...validateCiCompatibility(rule, pcs, battery));
  if (errors.length) throw new Error(errors.join(' '));
  for (const [range, min, max, label] of [[selection.pcs, rule.min_pcs, rule.max_pcs, 'PCS'], [selection.series, rule.min_series, rule.max_series, 'baterias em série'], [selection.parallel, rule.min_parallel_strings, rule.max_parallel_strings, 'strings em paralelo']] as const) {
    if (range.min < min || range.max > max) throw new Error(`A quantidade de ${label} deve estar entre ${min} e ${max}, conforme a compatibilidade aprovada.`);
  }
  const controller = rule.controller_accessory_id ? catalog.accessories.find((item) => item.id === rule.controller_accessory_id && item.active) : null;
  if (rule.controller_accessory_id && !controller) throw new Error('O controlador exigido não está ativo no catálogo de acessórios.');
  return { rule, pcs: pcs!, battery: battery!, controller };
}

export function buildModularConfigurations(catalog: CiModularCatalog, selection: CiModularSelection, prices: CiModularPrices) {
  const { rule, pcs, battery, controller } = resolveModularCatalog(catalog, selection);
  if (![prices.pcsUnitBrl, prices.batteryUnitBrl, ...(controller ? [prices.controllerUnitBrl] : [])].every((price) => typeof price === 'number' && Number.isFinite(price) && price >= 0)) throw new Error('Preencha no Portfólio os preços do PCS, da bateria e do controlador exigido.');
  const results: { id: string; product: ScenarioGridInput['product']; composition: CiModularComposition; capex: number }[] = [];
  for (let pcsCount = selection.pcs.min; pcsCount <= selection.pcs.max; pcsCount++) {
    for (let series = selection.series.min; series <= selection.series.max; series++) {
      for (let parallel = selection.parallel.min; parallel <= selection.parallel.max; parallel++) {
        const unitsPerPcs = series * parallel;
        const batteryCount = pcsCount * unitsPerPcs;
        if (!Number.isSafeInteger(batteryCount)) throw new Error('A quantidade total de baterias excede o limite numérico. Reduza a composição.');
        const voltageMinV = battery.voltageMinV! * series;
        const voltageMaxV = battery.voltageMaxV! * series;
        const pcsChargeEfficiency = pcs.chargeEfficiencyPercent! / 100;
        const pcsDischargeEfficiency = pcs.dischargeEfficiencyPercent! / 100;
        const batteryLegEfficiency = Math.sqrt(battery.roundTripEfficiencyPercent! / 100);
        // Conservative continuous DC capability at the lowest bank voltage.
        const chargeDcKw = Math.min(battery.charge_power_kw * unitsPerPcs, voltageMinV * Math.min(pcs.charge_current_a, battery.charge_current_a * parallel) / 1000);
        const dischargeDcKw = Math.min(battery.discharge_power_kw * unitsPerPcs, voltageMinV * Math.min(pcs.discharge_current_a, battery.discharge_current_a * parallel) / 1000);
        const chargePowerKw = Math.min(pcs.charge_power_kw, chargeDcKw / pcsChargeEfficiency) * pcsCount;
        const dischargePowerKw = Math.min(pcs.discharge_power_kw, dischargeDcKw * pcsDischargeEfficiency) * pcsCount;
        const items: CiModularComposition['items'] = [
          { productId: pcs.inverter_id, productType: 'inverter', model: pcs.model, quantity: pcsCount, unitPriceBrl: prices.pcsUnitBrl, totalBrl: pcsCount * prices.pcsUnitBrl },
          { productId: battery.battery_id, productType: 'battery', model: battery.model, quantity: batteryCount, unitPriceBrl: prices.batteryUnitBrl, totalBrl: batteryCount * prices.batteryUnitBrl },
        ];
        if (controller) { const quantity = pcsCount * rule.controller_quantity_per_pcs; items.push({ productId: controller.id, productType: 'accessory', model: controller.model, quantity, unitPriceBrl: prices.controllerUnitBrl!, totalBrl: quantity * prices.controllerUnitBrl! }); }
        if (![chargePowerKw, dischargePowerKw, battery.capacityKwh * batteryCount, ...items.map((item) => item.totalBrl)].every(Number.isFinite)) throw new Error('Potência, capacidade ou preço excede o limite numérico. Revise os equipamentos.');
        results.push({ id: `pcs-${pcsCount}-series-${series}-parallel-${parallel}`,
          product: { modulePowerKw: dischargePowerKw, modulePeakPowerKw: dischargePowerKw, moduleChargePowerKw: chargePowerKw, moduleCapacityKwh: battery.capacityKwh * batteryCount, socMinPercent: battery.socMinPercent, socMaxPercent: battery.soc_max_percent, efficiencyPercent: pcsChargeEfficiency * pcsDischargeEfficiency * battery.roundTripEfficiencyPercent!, chargeEfficiencyPercent: pcsChargeEfficiency * batteryLegEfficiency * 100, dischargeEfficiencyPercent: pcsDischargeEfficiency * batteryLegEfficiency * 100 },
          capex: items.reduce((total, item) => total + item.totalBrl, 0),
          composition: { compatibilityId: rule.id, compatibilityName: rule.name, revision: rule.revision, referenceDocument: rule.reference_document, communicationProfile: rule.communication_profile, pcsFirmware: rule.pcs_firmware, batteryFirmware: rule.battery_firmware, pcsId: pcs.inverter_id, pcsModel: pcs.model, pcsCount, batteryId: battery.battery_id, batteryModel: battery.model, batteryCount, unitKind: battery.unit_kind, seriesCount: series, parallelStringsPerPcs: parallel, chargePowerKw, dischargePowerKw, voltageMinV, voltageMaxV, items },
        });
      }
    }
  }
  return results;
}

/** Each configuration is evaluated as one complete assembly, with independent PCS and battery quantities. */
export function calculateModularStudy(options: CommercialIndustrialOptions, catalog: CiModularCatalog, prices: CiModularPrices, stsContext?: CiStsContext, accessoryContext?: CiAccessoryContext): CommercialIndustrialResult {
  const selection = options.bessSystem;
  if (selection?.kind !== 'modular' || !options.loadCurve || !options.tariff) throw new Error('Configure a composição, curva de carga e tarifa.');
  const { rule, pcs, battery } = resolveModularCatalog(catalog, selection);
  if (options.backup?.enabled && (!rule.supports_backup || !pcs.supports_backup)) throw new Error('Esta composição não está aprovada para backup.');
  const configurations = buildModularConfigurations(catalog, selection, prices);
  const gridInput = (configuration: typeof configurations[number]): ScenarioGridInput => ({
    accessoryContext,
    accessoryTarget: {pcsId:pcs.inverter_id,batteryId:battery.battery_id,compatibilityId:rule.id,pcs:configuration.composition.pcsCount,battery:configuration.composition.batteryCount,string:configuration.composition.pcsCount*configuration.composition.parallelStringsPerPcs,bess:0,backup:Boolean(options.backup?.enabled),generator:Boolean(options.generator?.enabled),lineVoltageV:options.backup?.sts?.lineVoltageV},
    baseAccessories: configuration.composition.items.filter(item=>item.productType==='accessory').map(item=>({...item,bundled:false,reasons:['Controlador exigido pela compatibilidade PCS + bateria'],ruleIds:[]})),
    stsContext: stsContext ? {...stsContext, target: {...stsContext.target, unitsPerModule: configuration.composition.pcsCount}} : undefined,
    curve: options.loadCurve!, product: configuration.product, strategy: options.strategy, sizing: { mode: 'fixed', moduleCount: 1, minModules: null, maxModules: null }, tariffWindow: { peakStart: options.tariff!.peakStart, peakEnd: options.tariff!.peakEnd }, tariff: options.tariff!, peakShavingTargetKw: options.tariff!.contractedDemandKw, unitPriceBrl: configuration.capex, monthsPerYear: options.financialAssumptions.monthsPerYear, financialAssumptions: options.financialAssumptions, backup: options.backup, solar: options.solar, generator: options.generator,
  });
  const decorate = (candidate: ScenarioCandidate, configuration: typeof configurations[number]) => ({ ...candidate, scenarioId: configuration.id, moduleCount: configuration.composition.batteryCount, composition: {...configuration.composition, items: [...configuration.composition.items.filter(item=>item.productType!=='accessory'), ...(candidate.accessories ?? []).map(item=>({...item,productType:'accessory' as const}))]}, marginalGain: null });
  const grids = configurations.map((configuration) => ({ configuration, grid: buildScenarioGrid(gridInput(configuration)) }));
  const scenarios = grids.map(({ configuration, grid }) => decorate(grid.scenarios[0], configuration));
  const recommendation = recommendScenario(scenarios, options.rankingCriterion, options.financialAssumptions.analysisHorizonYears)!;
  const technicalReference = scenarios.find(scenario => scenario.scenarioId === recommendation.scenarioId) ?? scenarios.find(scenario => scenario.technicalValidity);
  const selectedConfiguration = configurations.find((configuration) => configuration.id === (recommendation.scenarioId ?? technicalReference?.scenarioId)) ?? configurations[0];
  const detail = materializeScenarioDetail(gridInput(selectedConfiguration), 1, null);
  return {
    stsContext, accessoryContext,
    technicalSelection: { scenarioId: technicalReference?.scenarioId ?? null, reason: technicalReference ? 'Composição que atende aos requisitos técnicos, independentemente do retorno financeiro.' : 'Nenhuma composição atende aos requisitos técnicos informados.' },
    engineVersion: 'ci-modular-v4', inputFingerprint: '', baseline: grids[0].grid.baseline, scenarios, recommendation,
    selected: { ...decorate(detail, selectedConfiguration), dispatch: detail.dispatch, cashFlow: detail.cashFlow },
    assumptions: { equipment: { pcs, battery, compatibility: rule, prices }, tariff: options.tariff, financial: options.financialAssumptions, loadCurve: { resolutionMinutes: options.loadCurve.resolutionMinutes, profileBasis: options.loadCurve.profileBasis, periodStart: options.loadCurve.periodStart, periodEnd: options.loadCurve.periodEnd, timezone: options.loadCurve.timezone } },
    warnings: [...new Set(scenarios.flatMap((scenario) => scenario.technicalWarnings))], backup: detail.backupResult,
  };
}
