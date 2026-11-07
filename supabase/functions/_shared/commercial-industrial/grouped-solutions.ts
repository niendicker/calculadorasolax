import type { CiAccessoryTarget } from './accessories.ts';
import { buildModularConfigurations, validateCiCompatibility } from './modular.ts';
import type { CiModularCatalog, CiModularComposition } from './modular-types.ts';
import type { CiStsContext } from './sts-types.ts';
import type { BessProductSpec } from './scenarios.ts';

export type CiApplication = 'peak_shaving' | 'load_shifting' | 'backup' | 'solar' | 'generator';
export interface CiGroupedComponent {
  productId:string;model:string;quantity:number;
  productType:'ci_pcs'|'ci_battery'|'ci_bess'|'ci_accessory';
}
/** One complete physical arrangement. Prices and project settings never belong to this contract. */
export interface CiGroupedSolution {
  contractVersion:'ci-grouped-v1';key:string;label:string;
  source:{kind:'cabinet'|'assembly';id:string;reference:string;revision:string};
  counts:{units:number;series:number;parallel:number;pcs:number;batteries:number;bess:number};
  components:CiGroupedComponent[];
  applications:CiApplication[];
  ac:{chargePowerKw:number;dischargePowerKw:number;chargeEfficiencyPercent:number;dischargeEfficiencyPercent:number};
  dc:{buses:number;voltageMinV:number;voltageMaxV:number;chargeCurrentPerBusA:number;dischargeCurrentPerBusA:number;chargePowerPerBusKw:number;dischargePowerPerBusKw:number};
  storage:{nominalEnergyKwh:number;usableEnergyKwh:number;socMinPercent:number;socMaxPercent:number;chargeEfficiencyPercent:number;dischargeEfficiencyPercent:number};
  accessoryTarget:Pick<CiAccessoryTarget,'pcsId'|'batteryId'|'bessProductId'|'compatibilityId'|'pcs'|'battery'|'string'|'bess'>;
  transferTarget:CiStsContext['target'];
  controllerAccessoryId:string|null;
  composition?:Omit<CiModularComposition,'items'>;
}

export interface CiCabinetSource {
  id:string;model:string;active:boolean;max_parallel_units?:number;
  module_power_kw:number;module_capacity_kwh:number;efficiency_percent:number;soc_min_percent:number;soc_max_percent:number;
  ac_charge_efficiency_percent?:number|null;ac_discharge_efficiency_percent?:number|null;
  charge_power_kw?:number|null;dc_voltage_min_v?:number|null;dc_voltage_max_v?:number|null;
  dc_charge_current_a?:number|null;dc_discharge_current_a?:number|null;
  dc_charge_power_kw?:number|null;dc_discharge_power_kw?:number|null;
  electrical_reference?:string;supports_backup?:boolean;supports_solar?:boolean;supports_generator?:boolean;
}
const positive=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0;

export function assertCiGroupedSolution(solution:CiGroupedSolution):void {
  if(!solution || solution.contractVersion!=='ci-grouped-v1'||!solution.key||!solution.label||!['cabinet','assembly'].includes(solution.source?.kind)||!solution.source?.id||!solution.source?.reference?.trim()) throw new Error('Contrato de solução agrupada inválido ou sem referência documental.');
  const {ac,dc,storage:s}=solution;
  if(!ac||!dc||!s||![ac.chargePowerKw,ac.dischargePowerKw,ac.chargeEfficiencyPercent,ac.dischargeEfficiencyPercent,dc.buses,dc.voltageMinV,dc.voltageMaxV,dc.chargeCurrentPerBusA,dc.dischargeCurrentPerBusA,dc.chargePowerPerBusKw,dc.dischargePowerPerBusKw,s.nominalEnergyKwh,s.usableEnergyKwh,s.chargeEfficiencyPercent,s.dischargeEfficiencyPercent].every(positive))throw new Error('Complete os limites CC/CA, a capacidade e as eficiências da solução.');
  if(dc.voltageMaxV<dc.voltageMinV||!Number.isSafeInteger(dc.buses)||s.socMinPercent<0||s.socMaxPercent>100||s.socMinPercent>=s.socMaxPercent||s.chargeEfficiencyPercent>100||s.dischargeEfficiencyPercent>100||ac.chargeEfficiencyPercent>100||ac.dischargeEfficiencyPercent>100||!Number.isFinite(s.socMinPercent)||!Number.isFinite(s.socMaxPercent))throw new Error('Faixas elétricas ou de SOC inválidas na solução.');
  if(Math.abs(s.usableEnergyKwh-s.nominalEnergyKwh*(s.socMaxPercent-s.socMinPercent)/100)>1e-6*Math.max(1,s.usableEnergyKwh))throw new Error('Energia útil não corresponde à capacidade e à faixa de SOC.');
  if(dc.chargePowerPerBusKw>dc.voltageMinV*dc.chargeCurrentPerBusA/1000+1e-6||dc.dischargePowerPerBusKw>dc.voltageMinV*dc.dischargeCurrentPerBusA/1000+1e-6)throw new Error('A potência CC excede o limite de corrente do barramento.');
  if(!solution.counts||!Number.isSafeInteger(solution.counts.units)||solution.counts.units!==dc.buses||!['units','series','parallel'].every(key=>Number.isSafeInteger(solution.counts[key as 'units'])&&solution.counts[key as 'units']>0))throw new Error('Quantidades do agrupamento inválidas.');
  if(!Array.isArray(solution.applications)||!solution.applications.length||solution.applications.some(app=>!['peak_shaving','load_shifting','backup','solar','generator'].includes(app)))throw new Error('Aplicações da solução inválidas.');
  if(ac.dischargePowerKw>dc.dischargePowerPerBusKw*dc.buses*ac.dischargeEfficiencyPercent/100+1e-6||ac.chargePowerKw>dc.chargePowerPerBusKw*dc.buses/(ac.chargeEfficiencyPercent/100)+1e-6)throw new Error('Os limites CA excedem o envelope CC documentado.');
  if(!solution.components?.length||solution.components.some(c=>!['ci_pcs','ci_battery','ci_bess','ci_accessory'].includes(c.productType)||!c.productId||!c.model||!Number.isSafeInteger(c.quantity)||c.quantity<=0))throw new Error('Composição comercial inválida.');
}

export function groupedSolutionSpec(solution:CiGroupedSolution):BessProductSpec {
  assertCiGroupedSolution(solution);
  return {modulePowerKw:solution.ac.dischargePowerKw,moduleChargePowerKw:solution.ac.chargePowerKw,moduleCapacityKwh:solution.storage.nominalEnergyKwh,socMinPercent:solution.storage.socMinPercent,socMaxPercent:solution.storage.socMaxPercent,efficiencyPercent:solution.storage.chargeEfficiencyPercent*solution.storage.dischargeEfficiencyPercent/100,chargeEfficiencyPercent:solution.storage.chargeEfficiencyPercent,dischargeEfficiencyPercent:solution.storage.dischargeEfficiencyPercent};
}

export function generateCiGroupedSolutions(catalog:CiModularCatalog,products:CiCabinetSource[],limit=20000) {
  const solutions:CiGroupedSolution[]=[];
  const diagnostics:string[]=[];
  const push=(solution:CiGroupedSolution)=>{assertCiGroupedSolution(solution);if(solutions.length>=limit)throw new Error(`A geração excede ${limit} soluções. Nenhuma geração parcial deve ser publicada.`);solutions.push(solution);};
  for(const rule of [...catalog.rules].sort((a,b)=>a.id.localeCompare(b.id))){
    if(!rule.active||rule.approval_status!=='approved')continue;
    const pcs=catalog.pcs.find(p=>p.inverter_id===rule.pcs_id),battery=catalog.batteries.find(b=>b.battery_id===rule.battery_id);
    const errors=validateCiCompatibility(rule,pcs,battery);
    if(rule.controller_accessory_id&&!catalog.accessories.some(a=>a.id===rule.controller_accessory_id&&a.active))errors.push('Controlador obrigatório indisponível.');
    if(errors.length){diagnostics.push(`${rule.name}: ${errors.join(' ')}`);continue;}
    const count=(rule.max_pcs-rule.min_pcs+1)*(rule.max_series-rule.min_series+1)*(rule.max_parallel_strings-rule.min_parallel_strings+1);
    if(count>limit-solutions.length)throw new Error(`A geração excede ${limit} soluções. Revise as faixas aprovadas.`);
    for(let units=rule.min_pcs;units<=rule.max_pcs;units++)for(let series=rule.min_series;series<=rule.max_series;series++)for(let parallel=rule.min_parallel_strings;parallel<=rule.max_parallel_strings;parallel++){
      const config=buildModularConfigurations(catalog,{kind:'modular',compatibilityId:rule.id,mode:'fixed',pcs:{min:units,max:units},series:{min:series,max:series},parallel:{min:parallel,max:parallel}},{pcsUnitBrl:0,batteryUnitBrl:0,controllerUnitBrl:0})[0];
      const bankMin=battery!.voltageMinV!*series;
      const batteryLeg=Math.sqrt(battery!.roundTripEfficiencyPercent!/100);
      const {items,...composition}=config.composition;
      push({contractVersion:'ci-grouped-v1',key:`assembly:${rule.id}:${units}:${series}:${parallel}`,label:`${pcs!.model} + ${battery!.model} · ${units} PCS · ${config.composition.batteryCount} baterias`,source:{kind:'assembly',id:rule.id,reference:rule.reference_document,revision:rule.revision},counts:{units,series,parallel,pcs:units,batteries:config.composition.batteryCount,bess:0},components:items.map(item=>({productId:item.productId,model:item.model,quantity:item.quantity,productType:item.productType==='inverter'?'ci_pcs':item.productType==='battery'?'ci_battery':'ci_accessory'})),applications:['peak_shaving','load_shifting',...(rule.supports_backup?['backup' as const]:[]),...(rule.supports_solar?['solar' as const]:[]),...(rule.supports_generator?['generator' as const]:[])],ac:{chargePowerKw:config.composition.chargePowerKw,dischargePowerKw:config.composition.dischargePowerKw,chargeEfficiencyPercent:pcs!.chargeEfficiencyPercent!,dischargeEfficiencyPercent:pcs!.dischargeEfficiencyPercent!},dc:{buses:units,voltageMinV:bankMin,voltageMaxV:battery!.voltageMaxV!*series,chargeCurrentPerBusA:Math.min(pcs!.charge_current_a,battery!.charge_current_a*parallel),dischargeCurrentPerBusA:Math.min(pcs!.discharge_current_a,battery!.discharge_current_a*parallel),chargePowerPerBusKw:Math.min(battery!.charge_power_kw*series*parallel,bankMin*Math.min(pcs!.charge_current_a,battery!.charge_current_a*parallel)/1000),dischargePowerPerBusKw:Math.min(battery!.discharge_power_kw*series*parallel,bankMin*Math.min(pcs!.discharge_current_a,battery!.discharge_current_a*parallel)/1000)},storage:{nominalEnergyKwh:config.product.moduleCapacityKwh,usableEnergyKwh:config.product.moduleCapacityKwh*(battery!.soc_max_percent-battery!.socMinPercent)/100,socMinPercent:battery!.socMinPercent,socMaxPercent:battery!.soc_max_percent,chargeEfficiencyPercent:pcs!.chargeEfficiencyPercent!*batteryLeg,dischargeEfficiencyPercent:pcs!.dischargeEfficiencyPercent!*batteryLeg},accessoryTarget:{pcsId:pcs!.inverter_id,batteryId:battery!.battery_id,compatibilityId:rule.id,pcs:units,battery:config.composition.batteryCount,string:units*parallel,bess:0},transferTarget:{pcsId:pcs!.inverter_id,unitsPerModule:units},controllerAccessoryId:rule.controller_accessory_id,composition});
    }
  }
  for(const product of [...products].sort((a,b)=>a.id.localeCompare(b.id))){
    if(!product.active)continue;
    if(!product.electrical_reference?.trim()||![product.ac_charge_efficiency_percent,product.ac_discharge_efficiency_percent,product.charge_power_kw,product.dc_voltage_min_v,product.dc_voltage_max_v,product.dc_charge_current_a,product.dc_discharge_current_a,product.dc_charge_power_kw,product.dc_discharge_power_kw,product.module_power_kw,product.module_capacity_kwh,product.efficiency_percent].every(positive)||product.dc_voltage_max_v!<product.dc_voltage_min_v!||product.ac_charge_efficiency_percent!>100||product.ac_discharge_efficiency_percent!>100||product.efficiency_percent>product.ac_charge_efficiency_percent!*product.ac_discharge_efficiency_percent!/100+1e-6||product.soc_min_percent<0||product.soc_max_percent>100||product.soc_min_percent>=product.soc_max_percent){diagnostics.push(`${product.model}: complete a referência e os limites CC/CA documentados do gabinete.`);continue;}
    const max=product.max_parallel_units??1;
    if(!Number.isSafeInteger(max)||max<1||max>limit-solutions.length)throw new Error(`Paralelismo ou limite de geração inválido para ${product.model}.`);
    const chargeEta=product.ac_charge_efficiency_percent!/100;
    const dischargeEta=product.ac_discharge_efficiency_percent!/100;
    // As in assemblies, distribute only storage round-trip losses symmetrically.
    const storageLeg=Math.sqrt((product.efficiency_percent/100)/(chargeEta*dischargeEta));
    const chargeDc=Math.min(product.dc_charge_power_kw!,product.dc_voltage_min_v!*product.dc_charge_current_a!/1000);
    const dischargeDc=Math.min(product.dc_discharge_power_kw!,product.dc_voltage_min_v!*product.dc_discharge_current_a!/1000);
    for(let units=1;units<=max;units++)push({contractVersion:'ci-grouped-v1',key:`cabinet:${product.id}:${units}`,label:`${product.model} · ${units} unidade(s)`,source:{kind:'cabinet',id:product.id,reference:product.electrical_reference,revision:'cadastro'},counts:{units,series:1,parallel:1,pcs:0,batteries:0,bess:units},components:[{productId:product.id,model:product.model,quantity:units,productType:'ci_bess'}],applications:['peak_shaving','load_shifting',...(product.supports_backup?['backup' as const]:[]),...(product.supports_solar?['solar' as const]:[]),...(product.supports_generator?['generator' as const]:[])],ac:{chargePowerKw:Math.min(product.charge_power_kw!,chargeDc/chargeEta)*units,dischargePowerKw:Math.min(product.module_power_kw,dischargeDc*dischargeEta)*units,chargeEfficiencyPercent:chargeEta*100,dischargeEfficiencyPercent:dischargeEta*100},dc:{buses:units,voltageMinV:product.dc_voltage_min_v!,voltageMaxV:product.dc_voltage_max_v!,chargeCurrentPerBusA:product.dc_charge_current_a!,dischargeCurrentPerBusA:product.dc_discharge_current_a!,chargePowerPerBusKw:chargeDc,dischargePowerPerBusKw:dischargeDc},storage:{nominalEnergyKwh:product.module_capacity_kwh*units,usableEnergyKwh:product.module_capacity_kwh*units*(product.soc_max_percent-product.soc_min_percent)/100,socMinPercent:product.soc_min_percent,socMaxPercent:product.soc_max_percent,chargeEfficiencyPercent:chargeEta*storageLeg*100,dischargeEfficiencyPercent:dischargeEta*storageLeg*100},accessoryTarget:{bessProductId:product.id,pcs:0,battery:0,string:0,bess:units},transferTarget:{bessProductId:product.id,unitsPerModule:units},controllerAccessoryId:null});
  }
  return {solutions,diagnostics};
}
