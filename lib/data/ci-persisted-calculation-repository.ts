import { withAutomaticBackupSts } from '@/supabase/functions/_shared/commercial-industrial/automatic-sts';
import { validateStsSelection } from '@/supabase/functions/_shared/commercial-industrial/sts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { queryCiGeneratedSolutions, assertCiGenerationCurrent, type CiSolutionQuery } from './ci-generated-solutions-repository';
import { loadCiAccessoryContext } from './ci-accessories-repository';
import { loadCiStsCatalog } from './ci-sts-repository';
import { deriveCiTechnicalRequirements } from '@/supabase/functions/_shared/commercial-industrial/technical-requirements';
import { CI_GROUPED_SOLUTION_VERSION, groupedSolutionSpec, type CiGroupedSolution } from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions';
import { evaluateScenarioTechnical, materializeScenarioDetail, prepareScenarioBaseline, type ScenarioGridInput } from '@/supabase/functions/_shared/commercial-industrial/scenarios';
import {diagnoseCiSolutionFailure,meetsCiStaticRequirements,orderCiTechnicalSolutions} from '@/supabase/functions/_shared/commercial-industrial/solution-selection';
import { normalizeCiModularSelection, validateModularSelection } from '@/supabase/functions/_shared/commercial-industrial/modular';
import type { CommercialIndustrialOptions, CommercialIndustrialResult, ScenarioCandidate } from '@/supabase/functions/_shared/commercial-industrial/types';

export async function calculatePersistedCi(db:SupabaseClient,options:CommercialIndustrialOptions):Promise<CommercialIndustrialResult>{
  options = { ...options, backup: withAutomaticBackupSts(options.backup) };
  if(options.backup?.enabled){
    const errors=validateStsSelection(options.backup.sts);
    if(errors.length)throw new Error(errors.join(' '));
  }
  if(!options.loadCurve||!options.tariff)throw new Error('Configure a curva de carga e a tarifa.');
  const {data:auth,error:authError}=await db.auth.getUser();
  if(authError||!auth.user)throw new Error('Sua sessão expirou. Entre novamente para calcular.');
  const userId=auth.user.id;
  const baseline=prepareScenarioBaseline({curve:options.loadCurve,tariffWindow:{peakStart:options.tariff.peakStart,peakEnd:options.tariff.peakEnd},tariff:options.tariff,monthsPerYear:options.financialAssumptions.monthsPerYear,solar:options.solar,generator:options.generator});
  const requirements=deriveCiTechnicalRequirements(options,baseline.trace);
  const mode=options.bessSystem;
  const filter:CiSolutionQuery={minPowerKw:requirements.minPowerKw,minEnergyKwh:requirements.minEnergyKwh,applications:requirements.applications};
  if(mode?.kind==='model'){
    if(![220,380].includes(options.lineVoltageV!))throw new Error('Selecione a tensão CA entre fases: 220 V ou 380 V.');
    Object.assign(filter,{minPowerKw:0,minEnergyKwh:0,applications:[],sourceKind:mode.sourceKind});
    if(mode.sourceKind==='cabinet'){
      if(!mode.productId?.trim())throw new Error('Selecione o modelo do BESS integrado.');
      filter.sourceId=mode.productId;
    }else if(mode.sourceKind==='assembly'){
      if(!mode.pcsId?.trim()||!mode.batteryId?.trim())throw new Error('Selecione os modelos de PCS/Inversor e bateria.');
      Object.assign(filter,{pcsId:mode.pcsId,batteryId:mode.batteryId});
    }else throw new Error('Selecione o tipo de produto BESS.');
  }else if(mode?.kind==='modular'){
    const errors=validateModularSelection(mode);if(errors.length)throw new Error(errors.join(' '));
    const normalized=normalizeCiModularSelection(mode);
    Object.assign(filter,{minPowerKw:0,minEnergyKwh:0,applications:[],sourceKind:'assembly',sourceId:mode.compatibilityId,units:normalized.pcs,ports:normalized.ports,bankPattern:normalized.portBanks,series:normalized.series,parallel:normalized.parallel});
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
  Object.assign(filter,{minPowerKw:0,minEnergyKwh:0,applications:[]});
  const [{generation,solutions},accessoryContext,stsCatalog]=await Promise.all([queryCiGeneratedSolutions(db,filter),loadCiAccessoryContext(db,options.selectedAccessoryIds),loadCiStsCatalog(db)]);
  const prices=new Map<string,number>();
  async function loadPrices(){
  for(let offset=0;;offset+=500){
    const {data,error}=await db.from('user_stock_items').select('id,product_type,product_model,unit_value').eq('user_id',userId).in('product_type',['ci_pcs','ci_battery','ci_accessory','ci_bess']).order('id').range(offset,offset+499);
    if(error)throw new Error(error.message);
    for(const row of data??[]){const value=row.unit_value===null?NaN:Number(row.unit_value);if(Number.isFinite(value)&&value>=0)prices.set(`${row.product_type}:${row.product_model}`,value);}
    if((data??[]).length<500)break;
  }
  }
  const price=(type:string,model:string)=>prices.get(`${type}:${model}`);
  const accessories=()=>({...accessoryContext,prices:Object.fromEntries(accessoryContext.products.map(item=>[item.id,price('ci_accessory',item.model)??0]))});
  const transferPrices=()=>Object.fromEntries(stsCatalog.specs.map(item=>[item.accessory_id,price('ci_accessory',item.model)??0]));

  // Both cabinet and assembly enter exactly this same physical/financial pipeline.
  const inputFor=(solution:CiGroupedSolution):ScenarioGridInput=>{
    const componentItems=solution.components.map(item=>({...item,unitPriceBrl:price(item.productType,item.model)??0,totalBrl:item.quantity*(price(item.productType,item.model)??0)}));
    return {preparedBaseline:baseline,gridImportLimitsKw:requirements.gridImportLimitsKw,curve:options.loadCurve!,product:groupedSolutionSpec(solution),strategy:options.strategy,sizing:{mode:'fixed',moduleCount:1,minModules:null,maxModules:null},tariff:options.tariff!,tariffWindow:{peakStart:options.tariff!.peakStart,peakEnd:options.tariff!.peakEnd},peakShavingTargetKw:options.tariff!.contractedDemandKw,unitPriceBrl:componentItems.reduce((sum,item)=>sum+item.totalBrl,0),monthsPerYear:options.financialAssumptions.monthsPerYear,financialAssumptions:options.financialAssumptions,backup:options.backup,solar:options.solar,generator:options.generator,accessoryContext:accessories(),accessoryTarget:{...solution.accessoryTarget,backup:Boolean(options.backup?.enabled),generator:Boolean(options.generator?.enabled),lineVoltageV:options.lineVoltageV??options.backup?.sts?.lineVoltageV},baseAccessories:componentItems.filter(item=>item.productType==='ci_accessory').map(item=>({...item,bundled:false,reasons:['Componente obrigatório do agrupamento aprovado'],ruleIds:[]})),stsContext:options.backup?.enabled&&options.backup.sts?{catalog:stsCatalog,target:solution.transferTarget,prices:transferPrices(),controllerAccessoryId:solution.controllerAccessoryId}:undefined};
  };
  const decorate=(candidate:ScenarioCandidate,solution:CiGroupedSolution):ScenarioCandidate=>{
    const base=solution.components.filter(item=>item.productType!=='ci_accessory').map(item=>({...item,unitPriceBrl:price(item.productType,item.model)??0,totalBrl:item.quantity*(price(item.productType,item.model)??0)}));
    const items=[...base,...(candidate.accessories??[])];
    const missing=[...base.filter(item=>price(item.productType,item.model)===undefined).map(item=>item.model),...(candidate.accessories??[]).filter(item=>!item.bundled&&price('ci_accessory',item.model)===undefined).map(item=>item.model)];
    const missingApplications=requirements.applications.filter(app=>!solution.applications.includes(app));
    const meetsMin=solution.ac.dischargePowerKw+1e-6>=requirements.minPowerKw&&solution.storage.usableEnergyKwh+1e-6>=requirements.minEnergyKwh;
    return {...candidate,scenarioId:solution.key,moduleCount:solution.counts.units,equipmentLabel:solution.label,group:solution,billOfMaterials:items,pricingComplete:missing.length===0,missingPrices:[...new Set(missing)],technicalValidity:candidate.technicalValidity&&meetsMin&&!missingApplications.length,technicalWarnings:[...candidate.technicalWarnings,...(!meetsMin?['Não atende aos requisitos derivados da curva, estratégia e reserva de backup.']:[]),...(missingApplications.length?[`Aplicações sem aprovação: ${missingApplications.join(', ')}.`]:[])]};
  };
  const compatible=solutions.filter(solution=>!options.lineVoltageV||solution.ac.lineVoltagesV?.includes(options.lineVoltageV));
  const evaluated:ScenarioCandidate[]=[];
  let chosen:CiGroupedSolution|undefined;
  const transferVoltageMismatch=Boolean(options.backup?.enabled&&options.backup.sts&&options.lineVoltageV&&options.backup.sts.lineVoltageV!==options.lineVoltageV);
  if(!transferVoltageMismatch){
    for(const solution of orderCiTechnicalSolutions(compatible.filter(s=>meetsCiStaticRequirements(s,requirements)))){
      const candidate=evaluateScenarioTechnical(inputFor(solution));
      evaluated.push(candidate);
      if(candidate.technicalValidity){chosen=solution;break;}
    }
  }
  const technicalIssues=chosen?[]:transferVoltageMismatch?[{code:'voltage' as const,message:`A transferência está configurada em ${options.backup!.sts!.lineVoltageV} V, diferente da operação do projeto em ${options.lineVoltageV} V. Configure uma transferência aprovada para a tensão do projeto.`}]:diagnoseCiSolutionFailure(solutions,evaluated,requirements,options.lineVoltageV);
  let selected:CommercialIndustrialResult['selected']=null;
  if(chosen){
    await loadPrices();
    const detail=materializeScenarioDetail(inputFor(chosen),1,null);
    // A price lookup cannot alter the technical arrangement or make a failed
    // materialization appear as a successful solution.
    if(!detail.technicalValidity)throw new Error('A solução deixou de atender aos requisitos durante a avaliação. Calcule novamente.');
    selected={...detail,...decorate(detail,chosen)};
  }
  const scenarios:ScenarioCandidate[]=[];
  if(selected){
    // Keep the potentially annual trace and cash flow in selected only.
    const {dispatch,cashFlow,...candidate}=selected;
    void dispatch;void cashFlow;
    scenarios.push(candidate);
  }
  const reason=chosen?'Selecionada a menor quantidade de PCS/gabinetes que atende a todos os requisitos técnicos e, no desempate, a menor energia nominal suficiente. O financeiro é calculado a partir desta solução.':'Nenhuma solução atende a todos os requisitos técnicos do projeto.';
  const recommendation={scenarioId:chosen?.key??null,reason:chosen?(selected?.pricingComplete?'Indicadores financeiros da solução tecnicamente selecionada; Payback, ROI e VPL não alteram a escolha.':'Análise financeira pendente: cadastre os preços no Portfólio.'):reason};
  const snapshot={options,generation:generation.id,sourceRevision:generation.source_revision,solutionKeys:solutions.map(solution=>solution.key),accessoryContext,stsCatalog,prices:[...prices]};
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)));
  await assertCiGenerationCurrent(db,generation.id);
  return {engineVersion:'ci-technical-v1',inputFingerprint:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''),solutionGeneration:{id:generation.id,sourceRevision:generation.source_revision,contractVersion:CI_GROUPED_SOLUTION_VERSION},technicalRequirements:{minPowerKw:requirements.minPowerKw,minEnergyKwh:requirements.minEnergyKwh,operatingEnergyAcKwh:requirements.operatingEnergyAcKwh,backupEnergyAcKwh:requirements.backupEnergyAcKwh,coveragePercent:requirements.coveragePercent},baseline:baseline.result,scenarios,recommendation,selected,technicalSelection:{scenarioId:chosen?.key??null,reason},technicalIssues,assumptions:{lineVoltageV:options.lineVoltageV,tariff:options.tariff,financial:options.financialAssumptions,loadCurve:options.loadCurve},warnings:[...(selected?.missingPrices?.length?[`Preços pendentes: ${selected.missingPrices.join(', ')}.`]:[])],backup:selected?.backupResult,accessoryContext,stsContext:chosen?inputFor(chosen).stsContext:undefined};
}
