import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCiModularCatalog } from './ci-modular-catalog-repository';
import { loadCiAccessoryContext } from './ci-accessories-repository';
import { loadCiStsCatalog } from './ci-sts-repository';
import { calculateModularStudy, validateCiCompatibility } from '@/supabase/functions/_shared/commercial-industrial/modular';
import { buildScenarioGrid, materializeScenarioDetail, type ScenarioGridInput } from '@/supabase/functions/_shared/commercial-industrial/scenarios';
import { recommendScenario } from '@/supabase/functions/_shared/commercial-industrial/ranking';
import type { CommercialIndustrialOptions, CommercialIndustrialResult, ScenarioCandidate } from '@/supabase/functions/_shared/commercial-industrial/types';
import type { CiStsContext } from '@/supabase/functions/_shared/commercial-industrial/sts-types';
import type { CiBessProductRecord } from './ci-bess-products-repository';
export const MAX_AUTOMATIC_CANDIDATES = 4096;
/** Search all approved equipment first. Missing prices never stand in for technical inadequacy. */
export async function calculateAutomaticCi(supabase: SupabaseClient, options: CommercialIndustrialOptions): Promise<CommercialIndustrialResult> {
  const selection = options.bessSystem;
  if (selection?.kind !== 'automatic' || !options.loadCurve || !options.tariff)
    throw new Error('Preencha os requisitos, a curva e a tarifa antes de buscar soluções.');
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user)
    throw new Error('Sua sessão expirou. Entre novamente para calcular.');
  const [catalog, accessoryContext, stsCatalog, productsResult, stockResult] = await Promise.all([
    loadCiModularCatalog(supabase), loadCiAccessoryContext(supabase, options.selectedAccessoryIds), loadCiStsCatalog(supabase),
    supabase.from('ci_bess_products').select('*').eq('active', true).order('id'),
    supabase.from('user_stock_items').select('product_type,product_model,unit_value').eq('user_id', auth.user.id),
  ]);
  if (productsResult.error)
    throw new Error(productsResult.error.message);
  if (stockResult.error)
    throw new Error(stockResult.error.message);
  const products = (productsResult.data ?? []) as unknown as CiBessProductRecord[];
  const priceMap = new Map((stockResult.data ?? []).map(row => [`${row.product_type}:${row.product_model}`, row.unit_value === null ? NaN : Number(row.unit_value)]));
  const price = (type: string, model: string) => {
    const value = priceMap.get(`${type}:${model}`);
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  const diagnostics: string[] = [];
  // Zero is used only for an internal technical simulation. Results explicitly mark pending prices;
  // financial ranking and UI must exclude them until personal prices are supplied.
  const technicalAccessories = { ...accessoryContext, prices: Object.fromEntries(accessoryContext.products.map(p => [p.id, price('ci_accessory', p.model) ?? 0])) };
  const stsContext = (target: CiStsContext['target'], controllerAccessoryId?: string | null): CiStsContext | undefined => options.backup?.enabled && options.backup.sts ? {
    catalog: stsCatalog, target, controllerAccessoryId,
    prices: Object.fromEntries(stsCatalog.specs.map(spec => [spec.accessory_id, price('ci_accessory', spec.model) ?? 0])),
  } : undefined;
  type Branch = {
    result: CommercialIndustrialResult;
    detail: (candidate: ScenarioCandidate) => CommercialIndustrialResult;
  };
  const branches: Branch[] = [];
  let count = 0;
  const reserve = (amount: number) => {
    count += amount;
    if (count > MAX_AUTOMATIC_CANDIDATES)
      throw new Error(`O catálogo gera mais de ${MAX_AUTOMATIC_CANDIDATES} composições. Revise as faixas aprovadas antes de executar a busca; nenhum resultado parcial foi recomendado.`);
  };
  const eligibleRules = catalog.rules.filter(rule => {
    if (!rule.active || rule.approval_status !== 'approved')
      return false;
    const errors = validateCiCompatibility(rule, catalog.pcs.find(p => p.inverter_id === rule.pcs_id), catalog.batteries.find(b => b.battery_id === rule.battery_id));
    if (rule.controller_accessory_id && !catalog.accessories.some(a => a.id === rule.controller_accessory_id && a.active))
      errors.push('Controlador obrigatório indisponível.');
    if (options.backup?.enabled && !rule.supports_backup)
      errors.push('Sem aprovação para backup.');
    if (errors.length) {
      diagnostics.push(`${rule.name}: ${errors.join(' ')}`);
      return false;
    }
    reserve((rule.max_pcs - rule.min_pcs + 1) * (rule.max_series - rule.min_series + 1) * (rule.max_parallel_strings - rule.min_parallel_strings + 1));
    return true;
  }).sort((a, b) => a.id.localeCompare(b.id));
  for (const product of products)
    reserve(product.max_parallel_units ?? 1);
  for (const rule of eligibleRules) {
    const pcs = catalog.pcs.find(p => p.inverter_id === rule.pcs_id)!;
    const battery = catalog.batteries.find(b => b.battery_id === rule.battery_id)!;
    const controller = catalog.accessories.find(a => a.id === rule.controller_accessory_id);
    const prices = { pcsUnitBrl: price('ci_pcs', pcs.model) ?? 0, batteryUnitBrl: price('ci_battery', battery.model) ?? 0, controllerUnitBrl: controller ? price('ci_accessory', controller.model) ?? 0 : undefined };
    const sts = stsContext({ pcsId: pcs.inverter_id, unitsPerModule: 1 }, rule.controller_accessory_id);
    // Each branch remains within the manual engine's 256-candidate guard.
    for (let pcsCount = rule.min_pcs; pcsCount <= rule.max_pcs; pcsCount++) {
      for (let series = rule.min_series; series <= rule.max_series; series++) {
        for (let parallel = rule.min_parallel_strings; parallel <= rule.max_parallel_strings; parallel += 256) {
          const branchOptions: CommercialIndustrialOptions = { ...options, bessProductId: null, bessSystem: { kind: 'modular', compatibilityId: rule.id, mode: 'auto', pcs: { min: pcsCount, max: pcsCount }, series: { min: series, max: series }, parallel: { min: parallel, max: Math.min(parallel + 255, rule.max_parallel_strings) } } };
          const run = (opts: CommercialIndustrialOptions) => calculateModularStudy(opts, catalog, prices, sts, technicalAccessories);
          const result = run(branchOptions);
          result.scenarios.forEach(candidate => { candidate.equipmentLabel = `${pcs.model} + ${battery.model}`; });
          result.selected = null; // Materialize only the final selected composition, without retaining every dispatch trace.
          branches.push({ result, detail: candidate => run({ ...branchOptions, bessSystem: { ...(branchOptions.bessSystem as Extract<CommercialIndustrialOptions['bessSystem'], {
                  kind: 'modular';
                }>), mode: 'fixed', parallel: { min: candidate.composition!.parallelStringsPerPcs, max: candidate.composition!.parallelStringsPerPcs } } }) });
        }
      }
    }
  }
  for (const product of products) {
    const productSpec = { modulePowerKw: product.module_power_kw, moduleCapacityKwh: product.module_capacity_kwh, efficiencyPercent: product.efficiency_percent, socMinPercent: product.soc_min_percent, socMaxPercent: product.soc_max_percent };
    const input: ScenarioGridInput = { curve: options.loadCurve, product: productSpec, strategy: options.strategy, sizing: { mode: 'auto', moduleCount: null, minModules: 1, maxModules: product.max_parallel_units ?? 1 }, tariff: options.tariff, tariffWindow: { peakStart: options.tariff.peakStart, peakEnd: options.tariff.peakEnd }, peakShavingTargetKw: options.tariff.contractedDemandKw, unitPriceBrl: price('ci_bess', product.model) ?? 0, monthsPerYear: options.financialAssumptions.monthsPerYear, financialAssumptions: options.financialAssumptions, backup: options.backup, solar: options.solar, generator: options.generator, accessoryContext: technicalAccessories, accessoryTarget: { bessProductId: product.id, bess: 1, pcs: 0, battery: 0, string: 0, backup: Boolean(options.backup?.enabled), generator: Boolean(options.generator?.enabled), lineVoltageV: options.backup?.sts?.lineVoltageV }, stsContext: stsContext({ bessProductId: product.id, unitsPerModule: 1 }) };
    const grid = buildScenarioGrid(input);
    const result: CommercialIndustrialResult = { engineVersion: 'ci-auto-v1', inputFingerprint: '', baseline: grid.baseline, scenarios: grid.scenarios, recommendation: { scenarioId: null, reason: '' }, selected: null, assumptions: { tariff: options.tariff, financial: options.financialAssumptions, loadCurve: options.loadCurve }, warnings: [], stsContext: input.stsContext, accessoryContext };
    result.scenarios.forEach(candidate => { candidate.equipmentLabel = product.model; });
    branches.push({ result, detail: candidate => ({ ...result, selected: materializeScenarioDetail(input, candidate.moduleCount, null) }) });
  }
  if (!branches.length)
    throw new Error(`Nenhum equipamento ativo com compatibilidade aprovada e fichas completas. ${diagnostics.join(' ')}`);
  const entries = branches.flatMap((branch, index) => branch.result.scenarios.map(candidate => {
    const missing: string[] = [];
    if (candidate.composition) {
      for (const item of candidate.composition.items) {
        const bundled = candidate.accessories?.find(a => a.productId === item.productId)?.bundled;
        const type = item.productType === 'inverter' ? 'ci_pcs' : item.productType === 'battery' ? 'ci_battery' : 'ci_accessory';
        if (!bundled && price(type, item.model) === undefined)
          missing.push(item.model);
      }
    }
    else if (price('ci_bess', candidate.equipmentLabel!) === undefined)
      missing.push(candidate.equipmentLabel!);
    for (const item of candidate.accessories ?? [])
      if (!item.bundled && price('ci_accessory', item.model) === undefined)
        missing.push(item.model);
    const meetsMinimum = candidate.totalPowerKw + 1e-6 >= selection.minPowerKw && candidate.usefulCapacityKwh + 1e-6 >= selection.minEnergyKwh;
    const scenario = { ...candidate, scenarioId: `auto-${index}-${candidate.scenarioId}`, pricingComplete: missing.length === 0, missingPrices: [...new Set(missing)], technicalValidity: candidate.technicalValidity && meetsMinimum, technicalWarnings: [...candidate.technicalWarnings, ...(!meetsMinimum ? ['Não atende aos mínimos de potência e energia útil informados.'] : [])] };
    return { branch, candidate, scenario };
  }));
  const technical = entries.filter(e => e.scenario.technicalValidity).sort((a, b) => a.scenario.totalPowerKw - b.scenario.totalPowerKw || a.scenario.totalCapacityKwh - b.scenario.totalCapacityKwh || a.scenario.scenarioId.localeCompare(b.scenario.scenarioId));
  const chosen = technical[0] ?? entries[0];
  const detail = chosen.branch.detail(chosen.candidate);
  const selected = { ...detail.selected!, ...chosen.scenario, dispatch: detail.selected!.dispatch, cashFlow: detail.selected!.cashFlow };
  const recommendation = recommendScenario(entries.map(e => e.scenario), options.rankingCriterion, options.financialAssumptions.analysisHorizonYears)!;
  if (technical.length && !technical.some(entry => entry.scenario.pricingComplete))
    recommendation.reason = 'Análise financeira pendente: cadastre os preços dos equipamentos e acessórios no Portfólio.';
  const payload = { options, catalog, products, accessoryContext, stsCatalog, prices: [...priceMap] };
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  return { ...detail, engineVersion: 'ci-auto-v1', inputFingerprint: Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join(''), scenarios: entries.map(e => e.scenario), recommendation, selected, technicalSelection: { scenarioId: technical[0]?.scenario.scenarioId ?? null, reason: technical.length ? `${technical.length} de ${entries.length} composições atendem aos requisitos técnicos. Selecionada a menor potência e, no desempate, a menor capacidade nominal; o retorno financeiro é avaliado separadamente.` : 'Nenhuma composição do catálogo atende aos requisitos técnicos informados.' }, searchDiagnostics: diagnostics, warnings: [...new Set([...diagnostics, ...(technical.length ? [] : ['Nenhuma solução técnica encontrada dentro das faixas cadastradas.']), ...(selected.missingPrices?.length ? [`Preços pendentes no Portfólio: ${selected.missingPrices.join(', ')}. Indicadores financeiros indisponíveis.`] : [])])], accessoryContext, backup: selected.backupResult };
}
