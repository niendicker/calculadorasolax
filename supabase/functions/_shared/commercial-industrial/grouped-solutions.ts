import type { CiAccessoryTarget } from './accessories.ts';
import { buildModularConfigurations, validateCiCompatibility, enumerateCiPortArrangements, countCiPortArrangements } from './modular.ts';
import type { CiModularCatalog, CiModularComposition } from './modular-types.ts';
import type { CiStsContext } from './sts-types.ts';
import type { BessProductSpec } from './scenarios.ts';

export const CI_GROUPED_SOLUTION_VERSION='ci-grouped-v2' as const;
export interface CiGroupedDcPort {unit:number;port:number;series:number;parallelStrings:number;batteryCount:number;nominalEnergyKwh:number;voltageMinV:number;voltageMaxV:number;chargeCurrentA:number;dischargeCurrentA:number;chargePowerKw:number;dischargePowerKw:number}
export type CiApplication = 'peak_shaving' | 'load_shifting' | 'backup' | 'solar' | 'generator';
export interface CiGroupedComponent {
  productId:string;model:string;quantity:number;
  productType:'ci_pcs'|'ci_battery'|'ci_bess'|'ci_accessory';
}
/** One complete physical arrangement. Prices and project settings never belong to this contract. */
export interface CiGroupedSolution {
  contractVersion:'ci-grouped-v1'|'ci-grouped-v2';key:string;label:string;
  source:{kind:'cabinet'|'assembly';id:string;reference:string;revision:string};
  counts:{ports?:number;units:number;series:number;parallel:number;pcs:number;batteries:number;bess:number};
  components:CiGroupedComponent[];
  applications:CiApplication[];
  ac:{lineVoltagesV?:(220|380)[];chargePowerKw:number;dischargePowerKw:number;chargeEfficiencyPercent:number;dischargeEfficiencyPercent:number};
  dc:{ports?:CiGroupedDcPort[];buses:number;voltageMinV:number;voltageMaxV:number;chargeCurrentPerBusA:number;dischargeCurrentPerBusA:number;chargePowerPerBusKw:number;dischargePowerPerBusKw:number};
  storage:{nominalEnergyKwh:number;usableEnergyKwh:number;socMinPercent:number;socMaxPercent:number;chargeEfficiencyPercent:number;dischargeEfficiencyPercent:number};
  accessoryTarget:Pick<CiAccessoryTarget,'pcsId'|'batteryId'|'bessProductId'|'compatibilityId'|'pcs'|'battery'|'string'|'bess'>;
  transferTarget:CiStsContext['target'];
  controllerAccessoryId:string|null;
  composition?:Omit<CiModularComposition,'items'>;
}

export interface CiCabinetSource {
  id:string;model:string;active:boolean;max_parallel_units?:number;ac_voltages_v?:number[];
  module_power_kw:number;module_capacity_kwh:number;efficiency_percent:number;soc_min_percent:number;soc_max_percent:number;
  ac_charge_efficiency_percent?:number|null;ac_discharge_efficiency_percent?:number|null;
  charge_power_kw?:number|null;dc_voltage_min_v?:number|null;dc_voltage_max_v?:number|null;
  dc_charge_current_a?:number|null;dc_discharge_current_a?:number|null;
  dc_charge_power_kw?:number|null;dc_discharge_power_kw?:number|null;
  electrical_reference?:string;supports_backup?:boolean;supports_solar?:boolean;supports_generator?:boolean;
}
const positive=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0;

export function assertCiGroupedSolution(solution:CiGroupedSolution):void {
  if(!solution || !['ci-grouped-v1','ci-grouped-v2'].includes(solution.contractVersion)||!solution.key||!solution.label||!['cabinet','assembly'].includes(solution.source?.kind)||!solution.source?.id||!solution.source?.reference?.trim()) throw new Error('Contrato de solução agrupada inválido ou sem referência documental.');
  const {ac,dc,storage:s}=solution;
  if(ac?.lineVoltagesV!==undefined&&(!Array.isArray(ac.lineVoltagesV)||ac.lineVoltagesV.some(voltage=>voltage!==220&&voltage!==380)))throw new Error('Tensões CA entre fases inválidas na solução.');
  if(!ac||!dc||!s||![ac.chargePowerKw,ac.dischargePowerKw,ac.chargeEfficiencyPercent,ac.dischargeEfficiencyPercent,dc.buses,dc.voltageMinV,dc.voltageMaxV,dc.chargeCurrentPerBusA,dc.dischargeCurrentPerBusA,dc.chargePowerPerBusKw,dc.dischargePowerPerBusKw,s.nominalEnergyKwh,s.usableEnergyKwh,s.chargeEfficiencyPercent,s.dischargeEfficiencyPercent].every(positive))throw new Error('Complete os limites CC/CA, a capacidade e as eficiências da solução.');
  if(dc.voltageMaxV<dc.voltageMinV||!Number.isSafeInteger(dc.buses)||s.socMinPercent<0||s.socMaxPercent>100||s.socMinPercent>=s.socMaxPercent||s.chargeEfficiencyPercent>100||s.dischargeEfficiencyPercent>100||ac.chargeEfficiencyPercent>100||ac.dischargeEfficiencyPercent>100||!Number.isFinite(s.socMinPercent)||!Number.isFinite(s.socMaxPercent))throw new Error('Faixas elétricas ou de SOC inválidas na solução.');
  if(Math.abs(s.usableEnergyKwh-s.nominalEnergyKwh*(s.socMaxPercent-s.socMinPercent)/100)>1e-6*Math.max(1,s.usableEnergyKwh))throw new Error('Energia útil não corresponde à capacidade e à faixa de SOC.');
  if(solution.contractVersion==='ci-grouped-v1'&&(dc.chargePowerPerBusKw>dc.voltageMinV*dc.chargeCurrentPerBusA/1000+1e-6||dc.dischargePowerPerBusKw>dc.voltageMinV*dc.dischargeCurrentPerBusA/1000+1e-6))throw new Error('A potência CC excede o limite de corrente do barramento.');
  if(!solution.counts||!['units','series','parallel'].every(key=>Number.isSafeInteger(solution.counts[key as 'units'])&&solution.counts[key as 'units']>0))throw new Error('Quantidades do agrupamento inválidas.');
  if(solution.contractVersion==='ci-grouped-v1'){
    if(solution.counts.units!==dc.buses)throw new Error('Quantidades do agrupamento inválidas.');
  }else{
    const ports=dc.ports;
    if(!ports?.length||ports.length!==dc.buses||!Number.isSafeInteger(solution.counts.ports)||solution.counts.ports!<1||solution.counts.units*solution.counts.ports! !== dc.buses)throw new Error('Topologia de portas independentes inválida.');
    const seen=new Set<string>();
    for(const port of ports){
      const key=`${port.unit}:${port.port}`;
      if(seen.has(key)||!Number.isSafeInteger(port.unit)||port.unit<1||port.unit>solution.counts.units||!Number.isSafeInteger(port.port)||port.port<1||port.port>solution.counts.ports!||![port.voltageMinV,port.voltageMaxV,port.nominalEnergyKwh,port.chargeCurrentA,port.dischargeCurrentA,port.chargePowerKw,port.dischargePowerKw].every(positive)||port.voltageMaxV<port.voltageMinV)throw new Error('Limites elétricos por porta inválidos.');
      seen.add(key);
      if(port.chargePowerKw>port.voltageMinV*port.chargeCurrentA/1000+1e-6||port.dischargePowerKw>port.voltageMinV*port.dischargeCurrentA/1000+1e-6)throw new Error('A potência CC excede a corrente de uma porta.');
      if(!Number.isSafeInteger(port.series)||port.series<1||!Number.isSafeInteger(port.parallelStrings)||port.parallelStrings<1||!Number.isSafeInteger(port.batteryCount)||port.batteryCount<0)throw new Error('Arranjo por porta inválido.');
    }
    if(Math.abs(ports.reduce((sum,port)=>sum+port.nominalEnergyKwh,0)-s.nominalEnergyKwh)>1e-6*Math.max(1,s.nominalEnergyKwh))throw new Error('A energia total não corresponde aos bancos das portas.');
    if(Math.abs(Math.min(...ports.map(port=>port.voltageMinV))-dc.voltageMinV)>1e-6||Math.abs(Math.max(...ports.map(port=>port.voltageMaxV))-dc.voltageMaxV)>1e-6)throw new Error('A faixa CC não corresponde às portas.');
    if(solution.source.kind==='assembly'&&ports.reduce((sum,port)=>sum+port.batteryCount,0)!==solution.counts.batteries)throw new Error('Quantidade de baterias não corresponde às portas.');
  }
  if(!Array.isArray(solution.applications)||!solution.applications.length||solution.applications.some(app=>!['peak_shaving','load_shifting','backup','solar','generator'].includes(app)))throw new Error('Aplicações da solução inválidas.');
  const chargeDc=solution.contractVersion==='ci-grouped-v2'?dc.ports!.reduce((sum,port)=>sum+port.chargePowerKw,0):dc.chargePowerPerBusKw*dc.buses;
  const dischargeDc=solution.contractVersion==='ci-grouped-v2'?dc.ports!.reduce((sum,port)=>sum+port.dischargePowerKw,0):dc.dischargePowerPerBusKw*dc.buses;
  if(ac.dischargePowerKw>dischargeDc*ac.dischargeEfficiencyPercent/100+1e-6||ac.chargePowerKw>chargeDc/(ac.chargeEfficiencyPercent/100)+1e-6)throw new Error('Os limites CA excedem o envelope CC documentado.');
  if(!solution.components?.length||solution.components.some(c=>!['ci_pcs','ci_battery','ci_bess','ci_accessory'].includes(c.productType)||!c.productId||!c.model||!Number.isSafeInteger(c.quantity)||c.quantity<=0))throw new Error('Composição comercial inválida.');
}

export function groupedSolutionSpec(solution:CiGroupedSolution):BessProductSpec {
  assertCiGroupedSolution(solution);
  return {ports:solution.contractVersion==='ci-grouped-v2'?solution.dc.ports!.map(port=>({unit:port.unit,port:port.port,nominalEnergyKwh:port.nominalEnergyKwh,chargePowerKw:port.chargePowerKw/(solution.ac.chargeEfficiencyPercent/100),dischargePowerKw:port.dischargePowerKw*solution.ac.dischargeEfficiencyPercent/100,unitChargePowerKw:solution.ac.chargePowerKw/solution.counts.units,unitDischargePowerKw:solution.ac.dischargePowerKw/solution.counts.units})):undefined,modulePowerKw:solution.ac.dischargePowerKw,moduleChargePowerKw:solution.ac.chargePowerKw,moduleCapacityKwh:solution.storage.nominalEnergyKwh,socMinPercent:solution.storage.socMinPercent,socMaxPercent:solution.storage.socMaxPercent,efficiencyPercent:solution.storage.chargeEfficiencyPercent*solution.storage.dischargeEfficiencyPercent/100,chargeEfficiencyPercent:solution.storage.chargeEfficiencyPercent,dischargeEfficiencyPercent:solution.storage.dischargeEfficiencyPercent};
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
    const minPorts=rule.min_ports_per_pcs??1,maxPorts=rule.max_ports_per_pcs??1;
    const seriesRange={min:rule.min_series,max:rule.max_series},parallelRange={min:rule.min_parallel_strings,max:rule.max_parallel_strings};
    const choices=(seriesRange.max-seriesRange.min+1)*(parallelRange.max-parallelRange.min+1);
    let count=0;
    for(let ports=minPorts;ports<=maxPorts;ports++){count+=countCiPortArrangements(ports,choices,limit);if(count>limit)break;}
    count*=rule.max_pcs-rule.min_pcs+1;
    if(count>limit-solutions.length)throw new Error(`A geração excede ${limit} soluções. Revise as faixas aprovadas.`);
    for(let units=rule.min_pcs;units<=rule.max_pcs;units++)for(let ports=minPorts;ports<=maxPorts;ports++)for(const banks of enumerateCiPortArrangements(ports,seriesRange,parallelRange)){
      const config=buildModularConfigurations(catalog,{kind:'modular',connectionModel:'independent_ports',portBanks:banks,ports:{min:ports,max:ports},compatibilityId:rule.id,mode:'fixed',pcs:{min:units,max:units},series:seriesRange,parallel:parallelRange},{pcsUnitBrl:0,batteryUnitBrl:0,controllerUnitBrl:0})[0];
      const c=config.composition;
      const batteryLeg=Math.sqrt(battery!.roundTripEfficiencyPercent!/100);
      const dcPorts:CiGroupedDcPort[]=Array.from({length:units},(_,unit)=>c.portBanks!.map((bank,index)=>({unit:unit+1,port:index+1,series:bank.series,parallelStrings:bank.parallelStrings,batteryCount:bank.batteryCount,nominalEnergyKwh:bank.nominalEnergyKwh,voltageMinV:bank.voltageMinV,voltageMaxV:bank.voltageMaxV,chargeCurrentA:bank.chargeCurrentA,dischargeCurrentA:bank.dischargeCurrentA,chargePowerKw:bank.chargePowerKw,dischargePowerKw:bank.dischargePowerKw}))).flat();
      const {items,...composition}=c;
      const pattern=banks.map(bank=>`${bank.series}s${bank.parallelStrings}p`).join('-');
      push({contractVersion:CI_GROUPED_SOLUTION_VERSION,key:`assembly:${rule.id}:${units}:${pattern}`,label:`${pcs!.model} + ${battery!.model} · ${units} PCS · ${banks.map((bank,i)=>`porta ${i+1}: ${bank.series}S × ${bank.parallelStrings}P`).join(' / ')}`,source:{kind:'assembly',id:rule.id,reference:rule.reference_document,revision:rule.revision},counts:{units,ports,series:Math.min(...banks.map(bank=>bank.series)),parallel:Math.min(...banks.map(bank=>bank.parallelStrings)),pcs:units,batteries:c.batteryCount,bess:0},components:items.map(item=>({productId:item.productId,model:item.model,quantity:item.quantity,productType:item.productType==='inverter'?'ci_pcs':item.productType==='battery'?'ci_battery':'ci_accessory'})),applications:['peak_shaving','load_shifting',...(rule.supports_backup?['backup' as const]:[]),...(rule.supports_solar?['solar' as const]:[]),...(rule.supports_generator?['generator' as const]:[])],ac:{lineVoltagesV:([220,380] as const).filter(voltage=>pcs!.gridTypes?.some(type=>[`3P_${voltage}V`,`3p_${voltage}V`,`threePhase_${voltage}`].includes(type))),chargePowerKw:c.chargePowerKw,dischargePowerKw:c.dischargePowerKw,chargeEfficiencyPercent:pcs!.chargeEfficiencyPercent!,dischargeEfficiencyPercent:pcs!.dischargeEfficiencyPercent!},dc:{ports:dcPorts,buses:units*ports,voltageMinV:c.voltageMinV,voltageMaxV:c.voltageMaxV,chargeCurrentPerBusA:c.portChargeCurrentA!,dischargeCurrentPerBusA:c.portDischargeCurrentA!,chargePowerPerBusKw:c.portChargePowerKw!,dischargePowerPerBusKw:c.portDischargePowerKw!},storage:{nominalEnergyKwh:config.product.moduleCapacityKwh,usableEnergyKwh:config.product.moduleCapacityKwh*(battery!.soc_max_percent-battery!.socMinPercent)/100,socMinPercent:battery!.socMinPercent,socMaxPercent:battery!.soc_max_percent,chargeEfficiencyPercent:pcs!.chargeEfficiencyPercent!*batteryLeg,dischargeEfficiencyPercent:pcs!.dischargeEfficiencyPercent!*batteryLeg},accessoryTarget:{pcsId:pcs!.inverter_id,batteryId:battery!.battery_id,compatibilityId:rule.id,pcs:units,battery:c.batteryCount,string:units*banks.reduce((sum,bank)=>sum+bank.parallelStrings,0),bess:0},transferTarget:{pcsId:pcs!.inverter_id,unitsPerModule:units},controllerAccessoryId:rule.controller_accessory_id,composition});
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
    for(let units=1;units<=max;units++)push({contractVersion:CI_GROUPED_SOLUTION_VERSION,key:`cabinet:${product.id}:${units}`,label:`${product.model} · ${units} unidade(s)`,source:{kind:'cabinet',id:product.id,reference:product.electrical_reference,revision:'cadastro'},counts:{units,ports:1,series:1,parallel:1,pcs:0,batteries:0,bess:units},components:[{productId:product.id,model:product.model,quantity:units,productType:'ci_bess'}],applications:['peak_shaving','load_shifting',...(product.supports_backup?['backup' as const]:[]),...(product.supports_solar?['solar' as const]:[]),...(product.supports_generator?['generator' as const]:[])],ac:{lineVoltagesV:([220,380] as const).filter(voltage=>product.ac_voltages_v?.includes(voltage)),chargePowerKw:Math.min(product.charge_power_kw!,chargeDc/chargeEta)*units,dischargePowerKw:Math.min(product.module_power_kw,dischargeDc*dischargeEta)*units,chargeEfficiencyPercent:chargeEta*100,dischargeEfficiencyPercent:dischargeEta*100},dc:{ports:Array.from({length:units},(_,index)=>({unit:index+1,port:1,series:1,parallelStrings:1,batteryCount:0,nominalEnergyKwh:product.module_capacity_kwh,voltageMinV:product.dc_voltage_min_v!,voltageMaxV:product.dc_voltage_max_v!,chargeCurrentA:product.dc_charge_current_a!,dischargeCurrentA:product.dc_discharge_current_a!,chargePowerKw:chargeDc,dischargePowerKw:dischargeDc})),buses:units,voltageMinV:product.dc_voltage_min_v!,voltageMaxV:product.dc_voltage_max_v!,chargeCurrentPerBusA:product.dc_charge_current_a!,dischargeCurrentPerBusA:product.dc_discharge_current_a!,chargePowerPerBusKw:chargeDc,dischargePowerPerBusKw:dischargeDc},storage:{nominalEnergyKwh:product.module_capacity_kwh*units,usableEnergyKwh:product.module_capacity_kwh*units*(product.soc_max_percent-product.soc_min_percent)/100,socMinPercent:product.soc_min_percent,socMaxPercent:product.soc_max_percent,chargeEfficiencyPercent:chargeEta*storageLeg*100,dischargeEfficiencyPercent:dischargeEta*storageLeg*100},accessoryTarget:{bessProductId:product.id,pcs:0,battery:0,string:0,bess:units},transferTarget:{bessProductId:product.id,unitsPerModule:units},controllerAccessoryId:null});
  }
  return {solutions,diagnostics};
}
