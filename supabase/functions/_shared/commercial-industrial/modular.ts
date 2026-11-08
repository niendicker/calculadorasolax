import type { CiAccessoryContext } from './accessories.ts';
import type { CiStsContext } from './sts-types.ts';
import type { CiBatteryCatalogEntry, CiCompatibilityRule, CiModularCatalog, CiModularComposition, CiModularPrices, CiModularSelection, CiPcsCatalogEntry, CiPortArrangement, CiModularPortBank } from './modular-types.ts';
import type { CommercialIndustrialOptions, CommercialIndustrialResult, ScenarioCandidate } from './types.ts';
import { buildScenarioGrid, materializeScenarioDetail, type ScenarioGridInput } from './scenarios.ts';
import { recommendScenario } from './ranking.ts';

export const MAX_MODULAR_SCENARIOS = 256;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const integer = (value: unknown): value is number => positive(value) && Number.isSafeInteger(value);

/** Legacy strings-per-PCS selections are migrated to independent occupied ports.
 * Saved results are immutable; only a new calculation uses this normalization. */
export function normalizeCiModularSelection(selection: CiModularSelection) {
  return selection.connectionModel === 'independent_ports'
    ? selection
    : {...selection, connectionModel:'independent_ports' as const, ports:selection.parallel, parallel:{min:1,max:1}};
}

export function validateModularSelection(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return ['Configure a composição PCS + baterias.'];
  const value = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (value.kind !== 'modular' || typeof value.compatibilityId !== 'string' || !value.compatibilityId) errors.push('Selecione uma compatibilidade PCS + bateria.');
  if (value.mode !== 'auto' && value.mode !== 'fixed') errors.push('Escolha dimensionamento fixo ou automático.');
  if (value.connectionModel !== undefined && value.connectionModel !== 'independent_ports') errors.push('Modelo de conexão de baterias inválido.');
  let candidates = 1;
  const keys=value.connectionModel==='independent_ports'?['pcs','ports','series','parallel']:['pcs','series','parallel'];
  for (const key of keys) {
    const range = value[key] as { min?: unknown; max?: unknown } | undefined;
    if (!range || !integer(range.min) || !integer(range.max) || range.min > range.max) {
      errors.push(`Preencha um intervalo inteiro válido para ${key === 'pcs' ? 'PCS' : key === 'ports' ? 'portas por PCS' : key === 'series' ? 'baterias em série' : 'strings em paralelo por porta'}.`);
    } else {
      if (value.mode === 'fixed' && range.min !== range.max && !(Array.isArray(value.portBanks)&&['series','parallel'].includes(key))) errors.push('No modo fixo, mínimo e máximo devem ser iguais.');
      if(!Array.isArray(value.portBanks)||!['series','parallel'].includes(key))candidates *= range.max - range.min + 1;
    }
  }
  if(value.portBanks!==undefined&&!Array.isArray(value.portBanks))errors.push('Bancos por porta inválidos.');
  if(!errors.length&&Array.isArray(value.portBanks)&&value.connectionModel==='independent_ports'){
    const selected=value as unknown as CiModularSelection;
    if(value.portBanks.length<selected.ports!.min||value.portBanks.length>selected.ports!.max||value.portBanks.some(rawBank=>{
      if(!rawBank||typeof rawBank!=='object')return true;
      const bank=rawBank as CiPortArrangement;
      return !integer(bank.series)||!integer(bank.parallelStrings)||bank.series<selected.series.min||bank.series>selected.series.max||bank.parallelStrings<selected.parallel.min||bank.parallelStrings>selected.parallel.max;
    }))errors.push('Bancos explícitos fora das faixas de portas, série e paralelo.');
  }
  if(Array.isArray(value.portBanks)&&value.connectionModel!=='independent_ports')errors.push('Declare o modelo de portas independentes para os bancos explícitos.');
  if(!errors.length&&value.connectionModel==='independent_ports'&&!Array.isArray(value.portBanks)){
    const selected=value as unknown as CiModularSelection;
    const choices=(selected.series.max-selected.series.min+1)*(selected.parallel.max-selected.parallel.min+1);
    candidates=0;
    for(let n=selected.ports!.min;n<=selected.ports!.max;n++){candidates+=countCiPortArrangements(n,choices,MAX_MODULAR_SCENARIOS);if(candidates>MAX_MODULAR_SCENARIOS)break;}
    candidates*=selected.pcs.max-selected.pcs.min+1;
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
  const minPorts=rule.min_ports_per_pcs??1, maxPorts=rule.max_ports_per_pcs??1;
  if (!integer(pcs.batteryPorts)) errors.push('Cadastre a quantidade física de portas de bateria do PCS.');
  if (!integer(minPorts)||!integer(maxPorts)||minPorts>maxPorts||maxPorts>(pcs.batteryPorts??0)) errors.push('As portas utilizadas excedem a quantidade de portas de bateria do PCS ou a faixa é inválida.');
  const stringsPerPort=pcs.max_strings_per_port??1;
  if (!integer(stringsPerPort)||rule.max_parallel_strings>stringsPerPort) errors.push('As strings por porta excedem o paralelo aprovado para cada porta do PCS.');
  const unitsPerPort = rule.max_series * rule.max_parallel_strings;
  if (positive(battery.maxAssociationQty) && unitsPerPort > battery.maxAssociationQty) errors.push('A associação de baterias por porta excede o limite da ficha da bateria.');
  if (![pcs.port_charge_current_a,pcs.port_discharge_current_a].every(positive)) errors.push('Complete as correntes de carga e descarga por porta do PCS.');
  if (positive(pcs.maxCurrentPerPortA) && Math.max(pcs.port_charge_current_a??0,pcs.port_discharge_current_a??0)>pcs.maxCurrentPerPortA) errors.push('A corrente C&I por porta excede o limite por porta da ficha do PCS.');
  for (const limit of [pcs.port_charge_power_kw,pcs.port_discharge_power_kw]) if (limit!==null&&limit!==undefined&&!positive(limit)) errors.push('A potência CC por porta deve ser positiva quando informada.');
  if (![pcs.voltageMinV, pcs.voltageMaxV, battery.voltageMinV, battery.voltageMaxV].every(positive)) errors.push('Complete as tensões DC mínima e máxima nas fichas do inversor e da bateria.');
  else if (pcs.voltageMaxV! < pcs.voltageMinV! || battery.voltageMaxV! < battery.voltageMinV! || battery.voltageMinV! * rule.min_series < pcs.voltageMinV! || battery.voltageMaxV! * rule.max_series > pcs.voltageMaxV!) errors.push('As tensões mínima e máxima do banco não cabem na janela DC do PCS.');
  if (![pcs.charge_power_kw, pcs.discharge_power_kw, battery.capacityKwh, battery.charge_power_kw, battery.discharge_power_kw, battery.charge_current_a, battery.discharge_current_a].every(positive)) errors.push('Complete as potências, correntes contínuas e capacidade dos equipamentos.');
  if (![pcs.chargeEfficiencyPercent, pcs.dischargeEfficiencyPercent, battery.roundTripEfficiencyPercent].every((value) => positive(value) && value <= 100)) errors.push('Complete as eficiências nas fichas do inversor e da bateria (maiores que 0 e até 100%).');
  if (!Number.isFinite(battery.socMinPercent) || battery.socMinPercent < 0 || !positive(battery.soc_max_percent) || battery.soc_max_percent > 100 || battery.socMinPercent >= battery.soc_max_percent) errors.push('A faixa de SOC da bateria é inválida.');
  if (positive(pcs.ratedPowerKw) && pcs.discharge_power_kw > pcs.ratedPowerKw) errors.push('A potência contínua de descarga C&I excede a potência nominal da ficha do inversor.');
  if (positive(battery.maxCurrentA) && Math.max(battery.charge_current_a, battery.discharge_current_a) > battery.maxCurrentA) errors.push('A corrente contínua C&I excede a corrente máxima da ficha da bateria.');
  if (rule.supports_backup && !pcs.supports_backup) errors.push('O PCS não está cadastrado para backup.');
  if (requireApproval && [rule.reference_document, rule.revision, rule.communication_profile, rule.pcs_firmware, rule.battery_firmware].some((value) => !value?.trim())) errors.push('Informe documento, revisão, comunicação/BMS e versões de firmware aprovadas.');
  if (rule.controller_accessory_id && !integer(rule.controller_quantity_per_pcs)) errors.push('Informe a quantidade de controladores por PCS.');
  return errors;
}

export function resolveModularCatalog(catalog: CiModularCatalog, rawSelection: CiModularSelection) {
  const selection=normalizeCiModularSelection(rawSelection);
  const errors = validateModularSelection(selection);
  const rule = catalog.rules.find((item) => item.id === selection.compatibilityId);
  if (!rule) throw new Error('Compatibilidade não encontrada, inativa ou sem aprovação.');
  const pcs = catalog.pcs.find((item) => item.inverter_id === rule.pcs_id);
  const battery = catalog.batteries.find((item) => item.battery_id === rule.battery_id);
  errors.push(...validateCiCompatibility(rule, pcs, battery));
  if (errors.length) throw new Error(errors.join(' '));
  for (const [range, min, max, label] of [[selection.pcs, rule.min_pcs, rule.max_pcs, 'PCS'], [selection.ports!, rule.min_ports_per_pcs??1, rule.max_ports_per_pcs??1, 'portas por PCS'], [selection.series, rule.min_series, rule.max_series, 'baterias em série'], [selection.parallel, rule.min_parallel_strings, rule.max_parallel_strings, 'strings em paralelo']] as const) {
    if (range.min < min || range.max > max) throw new Error(`A quantidade de ${label} deve estar entre ${min} e ${max}, conforme a compatibilidade aprovada.`);
  }
  const controller = rule.controller_accessory_id ? catalog.accessories.find((item) => item.id === rule.controller_accessory_id && item.active) : null;
  if (rule.controller_accessory_id && !controller) throw new Error('O controlador exigido não está ativo no catálogo de acessórios.');
  return { rule, pcs: pcs!, battery: battery!, controller };
}

/** Canonical multisets remove only permutations of identical physical ports.
 * Different bank sizes remain separate physical solutions. */
export function* enumerateCiPortArrangements(ports:number, series:{min:number;max:number}, parallel:{min:number;max:number}):Generator<CiPortArrangement[]> {
  const choices:CiPortArrangement[]=[];
  for(let s=series.min;s<=series.max;s++)for(let p=parallel.min;p<=parallel.max;p++)choices.push({series:s,parallelStrings:p});
  function* visit(bank:CiPortArrangement[],start:number):Generator<CiPortArrangement[]>{
    if(bank.length===ports){yield bank.map(item=>({...item}));return;}
    for(let i=start;i<choices.length;i++)yield*visit([...bank,choices[i]],i);
  }
  yield*visit([],0);
}
export function countCiPortArrangements(ports:number,choices:number,limit=20000):number {
  let count=1;
  for(let i=1;i<=ports;i++){count=count*(choices+i-1)/i;if(count>limit)return limit+1;}
  return Math.round(count);
}

export function buildModularConfigurations(catalog: CiModularCatalog, rawSelection: CiModularSelection, prices: CiModularPrices) {
  const selection=normalizeCiModularSelection(rawSelection);
  const { rule, pcs, battery, controller } = resolveModularCatalog(catalog, selection);
  if (![prices.pcsUnitBrl, prices.batteryUnitBrl, ...(controller ? [prices.controllerUnitBrl] : [])].every((price) => typeof price === 'number' && Number.isFinite(price) && price >= 0)) throw new Error('Preencha no Portfólio os preços do PCS, da bateria e do controlador exigido.');
  const results: { id: string; product: ScenarioGridInput['product']; composition: CiModularComposition; capex: number }[] = [];
  for (let pcsCount = selection.pcs.min; pcsCount <= selection.pcs.max; pcsCount++) {
    for (let ports = selection.ports!.min; ports <= selection.ports!.max; ports++) {
      const arrangements=selection.portBanks?[selection.portBanks]:enumerateCiPortArrangements(ports,selection.series,selection.parallel);
      for(const banks of arrangements){
        if(banks.length!==ports||banks.some(bank=>!integer(bank.series)||!integer(bank.parallelStrings)||bank.series<selection.series.min||bank.series>selection.series.max||bank.parallelStrings<selection.parallel.min||bank.parallelStrings>selection.parallel.max))throw new Error('Arranjo por porta fora das faixas aprovadas.');
        const portBanks:CiModularPortBank[]=banks.map(bank=>{
          const voltageMinV=battery.voltageMinV!*bank.series;
          const chargeCurrentA=Math.min(pcs.port_charge_current_a!,battery.charge_current_a*bank.parallelStrings);
          const dischargeCurrentA=Math.min(pcs.port_discharge_current_a!,battery.discharge_current_a*bank.parallelStrings);
          const batteryCount=bank.series*bank.parallelStrings;
          return {...bank,batteryCount,nominalEnergyKwh:battery.capacityKwh*batteryCount,voltageMinV,voltageMaxV:battery.voltageMaxV!*bank.series,chargeCurrentA,dischargeCurrentA,chargePowerKw:Math.min(pcs.port_charge_power_kw??Infinity,battery.charge_power_kw*batteryCount,voltageMinV*chargeCurrentA/1000),dischargePowerKw:Math.min(pcs.port_discharge_power_kw??Infinity,battery.discharge_power_kw*batteryCount,voltageMinV*dischargeCurrentA/1000)};
        });
        const batteryCount=pcsCount*portBanks.reduce((sum,bank)=>sum+bank.batteryCount,0);
        const chargeEta=pcs.chargeEfficiencyPercent!/100, dischargeEta=pcs.dischargeEfficiencyPercent!/100;
        const batteryLeg=Math.sqrt(battery.roundTripEfficiencyPercent!/100);
        const unitChargePowerKw=Math.min(pcs.charge_power_kw,portBanks.reduce((sum,bank)=>sum+bank.chargePowerKw,0)/chargeEta);
        const unitDischargePowerKw=Math.min(pcs.discharge_power_kw,portBanks.reduce((sum,bank)=>sum+bank.dischargePowerKw,0)*dischargeEta);
        const chargePowerKw=unitChargePowerKw*pcsCount,dischargePowerKw=unitDischargePowerKw*pcsCount;
        const runtimePorts=Array.from({length:pcsCount},(_,unit)=>portBanks.map((bank,index)=>({unit:unit+1,port:index+1,nominalEnergyKwh:bank.nominalEnergyKwh,chargePowerKw:bank.chargePowerKw/chargeEta,dischargePowerKw:bank.dischargePowerKw*dischargeEta,unitChargePowerKw,unitDischargePowerKw}))).flat();
        const items:CiModularComposition['items']=[{productId:pcs.inverter_id,productType:'inverter',model:pcs.model,quantity:pcsCount,unitPriceBrl:prices.pcsUnitBrl,totalBrl:pcsCount*prices.pcsUnitBrl},{productId:battery.battery_id,productType:'battery',model:battery.model,quantity:batteryCount,unitPriceBrl:prices.batteryUnitBrl,totalBrl:batteryCount*prices.batteryUnitBrl}];
        if(controller){const quantity=pcsCount*rule.controller_quantity_per_pcs;items.push({productId:controller.id,productType:'accessory',model:controller.model,quantity,unitPriceBrl:prices.controllerUnitBrl!,totalBrl:quantity*prices.controllerUnitBrl!});}
        if(!Number.isSafeInteger(batteryCount)||![chargePowerKw,dischargePowerKw,battery.capacityKwh*batteryCount,...items.map(item=>item.totalBrl)].every(Number.isFinite))throw new Error('Composição excede os limites numéricos.');
        const id=`pcs-${pcsCount}-ports-${banks.map(bank=>`${bank.series}s${bank.parallelStrings}p`).join('-')}`;
        results.push({id,product:{ports:runtimePorts,modulePowerKw:dischargePowerKw,modulePeakPowerKw:dischargePowerKw,moduleChargePowerKw:chargePowerKw,moduleCapacityKwh:battery.capacityKwh*batteryCount,socMinPercent:battery.socMinPercent,socMaxPercent:battery.soc_max_percent,efficiencyPercent:chargeEta*dischargeEta*battery.roundTripEfficiencyPercent!,chargeEfficiencyPercent:chargeEta*batteryLeg*100,dischargeEfficiencyPercent:dischargeEta*batteryLeg*100},capex:items.reduce((sum,item)=>sum+item.totalBrl,0),composition:{portBanks,compatibilityId:rule.id,compatibilityName:rule.name,revision:rule.revision,referenceDocument:rule.reference_document,communicationProfile:rule.communication_profile,pcsFirmware:rule.pcs_firmware,batteryFirmware:rule.battery_firmware,pcsId:pcs.inverter_id,pcsModel:pcs.model,pcsCount,batteryId:battery.battery_id,batteryModel:battery.model,batteryCount,unitKind:battery.unit_kind,seriesCount:Math.min(...banks.map(bank=>bank.series)),parallelStringsPerPcs:banks.reduce((sum,bank)=>sum+bank.parallelStrings,0),portsPerPcs:ports,parallelStringsPerPort:banks.every(bank=>bank.parallelStrings===banks[0].parallelStrings)?banks[0].parallelStrings:undefined,portChargeCurrentA:Math.min(...portBanks.map(bank=>bank.chargeCurrentA)),portDischargeCurrentA:Math.min(...portBanks.map(bank=>bank.dischargeCurrentA)),portChargePowerKw:Math.min(...portBanks.map(bank=>bank.chargePowerKw)),portDischargePowerKw:Math.min(...portBanks.map(bank=>bank.dischargePowerKw)),chargePowerKw,dischargePowerKw,voltageMinV:Math.min(...portBanks.map(bank=>bank.voltageMinV)),voltageMaxV:Math.max(...portBanks.map(bank=>bank.voltageMaxV)),items}});
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
    engineVersion: 'ci-modular-v5-ports', inputFingerprint: '', baseline: grids[0].grid.baseline, scenarios, recommendation,
    selected: { ...decorate(detail, selectedConfiguration), dispatch: detail.dispatch, cashFlow: detail.cashFlow },
    assumptions: { equipment: { pcs, battery, compatibility: rule, prices }, tariff: options.tariff, financial: options.financialAssumptions, loadCurve: { resolutionMinutes: options.loadCurve.resolutionMinutes, profileBasis: options.loadCurve.profileBasis, periodStart: options.loadCurve.periodStart, periodEnd: options.loadCurve.periodEnd, timezone: options.loadCurve.timezone } },
    warnings: [...new Set(scenarios.flatMap((scenario) => scenario.technicalWarnings))], backup: detail.backupResult,
  };
}
