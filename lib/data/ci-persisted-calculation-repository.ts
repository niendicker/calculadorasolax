import type { SupabaseClient } from '@supabase/supabase-js';
import { queryCiGeneratedSolutions, assertCiGenerationCurrent, type CiSolutionQuery } from './ci-generated-solutions-repository';
import { loadCiAccessoryContext } from './ci-accessories-repository';
import { loadCiStsCatalog } from './ci-sts-repository';
import { deriveCiTechnicalRequirements } from '@/supabase/functions/_shared/commercial-industrial/technical-requirements';
import { groupedSolutionSpec, type CiGroupedSolution } from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions';
import { buildScenarioGrid, materializeScenarioDetail, prepareScenarioBaseline, type ScenarioGridInput } from '@/supabase/functions/_shared/commercial-industrial/scenarios';
import { recommendScenario } from '@/supabase/functions/_shared/commercial-industrial/ranking';
import { validateModularSelection } from '@/supabase/functions/_shared/commercial-industrial/modular';
import type { CommercialIndustrialOptions, CommercialIndustrialResult, ScenarioCandidate } from '@/supabase/functions/_shared/commercial-industrial/types';

export async function calculatePersistedCi(db:SupabaseClient,options:CommercialIndustrialOptions):Promise<CommercialIndustrialResult>{
  if(!options.loadCurve||!options.tariff)throw new Error('Configure a curva de carga e a tarifa.');
  const {data:auth,error:authError}=await db.auth.getUser();
  if(authError||!auth.user)throw new Error('Sua sessão expirou. Entre novamente para calcular.');
  const baseline=prepareScenarioBaseline({curve:options.loadCurve,tariffWindow:{peakStart:options.tariff.peakStart,peakEnd:options.tariff.peakEnd},tariff:options.tariff,monthsPerYear:options.financialAssumptions.monthsPerYear,solar:options.solar,generator:options.generator});
  const requirements=deriveCiTechnicalRequirements(options,baseline.trace);
  const mode=options.bessSystem;
  const filter:CiSolutionQuery={minPowerKw:requirements.minPowerKw,minEnergyKwh:requirements.minEnergyKwh,applications:requirements.applications};
  if(mode?.kind==='modular'){
    const errors=validateModularSelection(mode);if(errors.length)throw new Error(errors.join(' '));
    Object.assign(filter,{minPowerKw:0,minEnergyKwh:0,applications:[],sourceKind:'assembly',sourceId:mode.compatibilityId,units:mode.pcs,series:mode.series,parallel:mode.parallel});
  }else if(mode?.kind==='solution'){
    if(!mode.solutionKey?.trim())throw new Error('Selecione uma solução gerada.');
    Object.assign(filter,{minPowerKw:0,minEnergyKwh:0,applications:[],solutionKey:mode.solutionKey});
  }else if(mode?.kind!=='automatic'){
    if(!options.bessProductId)throw new Error('Selecione uma solução gerada ou use a busca automática.');
    const min=options.sizing.mode==='fixed'?options.sizing.moduleCount:options.sizing.minModules;
    const max=options.sizing.mode==='fixed'?options.sizing.moduleCount:options.sizing.maxModules;
    if(!min||!max||min>max)throw new Error('Configure as quantidades da solução.');
    Object.assign(filter,{minPowerKw:0,minEnergyKwh:0,applications:[],sourceKind:'cabinet',sourceId:options.bessProductId,units:{min,max}});
  }
  const [{generation,solutions},accessoryContext,stsCatalog]=await Promise.all([queryCiGeneratedSolutions(db,filter),loadCiAccessoryContext(db,options.selectedAccessoryIds),loadCiStsCatalog(db)]);
  const prices=new Map<string,number>();
  for(let offset=0;;offset+=500){
    const {data,error}=await db.from('user_stock_items').select('id,product_type,product_model,unit_value').eq('user_id',auth.user.id).in('product_type',['ci_pcs','ci_battery','ci_accessory','ci_bess']).order('id').range(offset,offset+499);
    if(error)throw new Error(error.message);
    for(const row of data??[]){const value=row.unit_value===null?NaN:Number(row.unit_value);if(Number.isFinite(value)&&value>=0)prices.set(`${row.product_type}:${row.product_model}`,value);}
    if((data??[]).length<500)break;
  }
  const price=(type:string,model:string)=>prices.get(`${type}:${model}`);
  const accessories={...accessoryContext,prices:Object.fromEntries(accessoryContext.products.map(item=>[item.id,price('ci_accessory',item.model)??0]))};
  const transferPrices=Object.fromEntries(stsCatalog.specs.map(item=>[item.accessory_id,price('ci_accessory',item.model)??0]));

  // Both cabinet and assembly enter exactly this same physical/financial pipeline.
  const inputFor=(solution:CiGroupedSolution):ScenarioGridInput=>{
    const componentItems=solution.components.map(item=>({...item,unitPriceBrl:price(item.productType,item.model)??0,totalBrl:item.quantity*(price(item.productType,item.model)??0)}));
    return {preparedBaseline:baseline,gridImportLimitsKw:requirements.gridImportLimitsKw,curve:options.loadCurve!,product:groupedSolutionSpec(solution),strategy:options.strategy,sizing:{mode:'fixed',moduleCount:1,minModules:null,maxModules:null},tariff:options.tariff!,tariffWindow:{peakStart:options.tariff!.peakStart,peakEnd:options.tariff!.peakEnd},peakShavingTargetKw:options.tariff!.contractedDemandKw,unitPriceBrl:componentItems.reduce((sum,item)=>sum+item.totalBrl,0),monthsPerYear:options.financialAssumptions.monthsPerYear,financialAssumptions:options.financialAssumptions,backup:options.backup,solar:options.solar,generator:options.generator,accessoryContext:accessories,accessoryTarget:{...solution.accessoryTarget,backup:Boolean(options.backup?.enabled),generator:Boolean(options.generator?.enabled),lineVoltageV:options.backup?.sts?.lineVoltageV},baseAccessories:componentItems.filter(item=>item.productType==='ci_accessory').map(item=>({...item,bundled:false,reasons:['Componente obrigatório do agrupamento aprovado'],ruleIds:[]})),stsContext:options.backup?.enabled&&options.backup.sts?{catalog:stsCatalog,target:solution.transferTarget,prices:transferPrices,controllerAccessoryId:solution.controllerAccessoryId}:undefined};
  };
  const decorate=(candidate:ScenarioCandidate,solution:CiGroupedSolution):ScenarioCandidate=>{
    const base=solution.components.filter(item=>item.productType!=='ci_accessory').map(item=>({...item,unitPriceBrl:price(item.productType,item.model)??0,totalBrl:item.quantity*(price(item.productType,item.model)??0)}));
    const items=[...base,...(candidate.accessories??[])];
    const missing=[...base.filter(item=>price(item.productType,item.model)===undefined).map(item=>item.model),...(candidate.accessories??[]).filter(item=>!item.bundled&&price('ci_accessory',item.model)===undefined).map(item=>item.model)];
    const missingApplications=requirements.applications.filter(app=>!solution.applications.includes(app));
    const meetsMin=solution.ac.dischargePowerKw+1e-6>=requirements.minPowerKw&&solution.storage.usableEnergyKwh+1e-6>=requirements.minEnergyKwh;
    return {...candidate,scenarioId:solution.key,moduleCount:solution.counts.units,equipmentLabel:solution.label,group:solution,billOfMaterials:items,pricingComplete:missing.length===0,missingPrices:[...new Set(missing)],technicalValidity:candidate.technicalValidity&&meetsMin&&!missingApplications.length,technicalWarnings:[...candidate.technicalWarnings,...(!meetsMin?['Não atende aos requisitos derivados da curva, estratégia e reserva de backup.']:[]),...(missingApplications.length?[`Aplicações sem aprovação: ${missingApplications.join(', ')}.`]:[])]};
  };
  const scenarios=solutions.map(solution=>decorate(buildScenarioGrid(inputFor(solution)).scenarios[0],solution));
  const technical=scenarios.filter(s=>s.technicalValidity).sort((a,b)=>a.totalPowerKw-b.totalPowerKw||a.totalCapacityKwh-b.totalCapacityKwh||a.scenarioId.localeCompare(b.scenarioId));
  const selectedCandidate=technical[0]??scenarios[0];
  const chosen=solutions.find(s=>s.key===selectedCandidate?.scenarioId);
  const selected=chosen?{...materializeScenarioDetail(inputFor(chosen),1,null),...selectedCandidate!}:null;
  const recommendation=recommendScenario(scenarios,options.rankingCriterion,options.financialAssumptions.analysisHorizonYears)??{scenarioId:null,reason:'Nenhuma solução gerada atende aos filtros técnicos do projeto.'};
  if(technical.length&&!technical.some(s=>s.pricingComplete))recommendation.reason='Análise financeira pendente: cadastre os preços no Portfólio.';
  const snapshot={options,generation:generation.id,sourceRevision:generation.source_revision,solutionKeys:solutions.map(solution=>solution.key),accessoryContext,stsCatalog,prices:[...prices]};
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)));
  await assertCiGenerationCurrent(db,generation.id);
  return {engineVersion:'ci-grouped-v1',inputFingerprint:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''),solutionGeneration:{id:generation.id,sourceRevision:generation.source_revision,contractVersion:'ci-grouped-v1'},technicalRequirements:{minPowerKw:requirements.minPowerKw,minEnergyKwh:requirements.minEnergyKwh,operatingEnergyAcKwh:requirements.operatingEnergyAcKwh,backupEnergyAcKwh:requirements.backupEnergyAcKwh,coveragePercent:requirements.coveragePercent},baseline:baseline.result,scenarios,recommendation,selected,technicalSelection:{scenarioId:technical[0]?.scenarioId??null,reason:technical.length?`${technical.length} de ${scenarios.length} soluções consultadas atendem tecnicamente. Selecionada a menor potência e, no desempate, a menor energia nominal. O retorno financeiro é analisado separadamente.`:'Nenhuma solução da geração publicada atende à curva, à estratégia e às aplicações do projeto.'},assumptions:{tariff:options.tariff,financial:options.financialAssumptions,loadCurve:options.loadCurve},warnings:[...(technical.length?[]:['Nenhuma solução técnica encontrada. Revise requisitos, aplicações e o catálogo gerado.']),...(selected?.missingPrices?.length?[`Preços pendentes: ${selected.missingPrices.join(', ')}.`]:[])],backup:selected?.backupResult,accessoryContext,stsContext:chosen?inputFor(chosen).stsContext:undefined};
}
