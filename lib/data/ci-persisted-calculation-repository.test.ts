import {beforeEach,it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {modularFixture,modularOptions} from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import {cabinetFixture} from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions.test-fixtures';
import {generateCiGroupedSolutions} from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions';
import {calculatePersistedCi} from './ci-persisted-calculation-repository';
import {stsBackup,stsFixture} from '@/supabase/functions/_shared/commercial-industrial/sts.test-fixtures';
const mocks=vi.hoisted(()=>({query:vi.fn(),current:vi.fn(),accessories:vi.fn(),sts:vi.fn()}));
vi.mock('./ci-generated-solutions-repository',()=>({queryCiGeneratedSolutions:mocks.query,assertCiGenerationCurrent:mocks.current}));
vi.mock('./ci-accessories-repository',()=>({loadCiAccessoryContext:mocks.accessories}));
vi.mock('./ci-sts-repository',()=>({loadCiStsCatalog:mocks.sts}));
const solutions=()=>generateCiGroupedSolutions(modularFixture(),[cabinetFixture()]).solutions;
function client(priced=true){const where=vi.fn();const q={select:()=>q,eq:(...a:unknown[])=>{where(...a);return q;},in:()=>q,order:()=>q,range:async()=>({data:priced?[{product_type:'ci_pcs',product_model:'PCS teste 100',unit_value:1e8},{product_type:'ci_battery',product_model:'Rack teste 100',unit_value:1e8},{product_type:'ci_bess',product_model:'Gabinete teste',unit_value:1e8}]:[],error:null})};return {where,db:{auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},from:()=>q} as unknown as SupabaseClient};}
beforeEach(()=>{vi.clearAllMocks();mocks.query.mockResolvedValue({generation:{id:'generation',source_revision:'revision'},solutions:solutions()});mocks.accessories.mockResolvedValue({products:[],rules:[],prices:{},selectedIds:[],stsIds:[]});mocks.sts.mockResolvedValue({specs:[],rules:[]});});
function options(){return {...modularOptions(),bessSystem:{kind:'automatic' as const,minPowerKw:0,minEnergyKwh:0}};}
it('rejects an invalid STS configuration', async () => {
 const backup={...stsBackup(),sts:{...stsBackup().sts!,maxGridPassageKw:-10}};
 await expect(calculatePersistedCi(client().db,{...options(),backup})).rejects.toThrow('máxima potência de passagem');
 expect(mocks.query).not.toHaveBeenCalled();
});
it('automatically sets up STS when backup has no explicit transfer selection', async () => {
 const backup={...stsBackup(),sts:undefined,targetPowerKw:20,targetPeakPowerKw:20,autonomyHours:.25};
 mocks.sts.mockResolvedValue(stsFixture().catalog);
 mocks.accessories.mockResolvedValue({products:stsFixture().catalog.specs.map(spec=>({id:spec.accessory_id,model:spec.model,active:true})),rules:[],prices:{},selectedIds:[],stsIds:['small','large']});
 const result=await calculatePersistedCi(client(false).db,{...options(),backup,loadShiftingCoveragePercent:50});
 expect(result.selected?.sts?.status).toBe('selected');
});
it('allows backup calculation on 220 V networks with engineering notice and without blocking STS mismatch', async () => {
 const backup={...stsBackup(),targetPowerKw:20,targetPeakPowerKw:20,autonomyHours:.25};
 const s220 = solutions().map(s => ({ ...s, ac: { ...s.ac, lineVoltagesV: [220, 380] } }));
 mocks.query.mockResolvedValue({ generation: { id: 'g', source_revision: 'r' }, solutions: s220 });
 const result=await calculatePersistedCi(client(false).db,{...options(),lineVoltageV:220,backup,loadShiftingCoveragePercent:50});
 expect(result.warnings.some(w=>w.includes('220 V'))).toBe(true);
 expect(result.selected).not.toBeNull();
 expect(result.selected?.sts).toBeUndefined();
});
it('automatically selects a compatible STS even when a saved project requested a different manual model', async () => {
 const backup=stsBackup();backup.targetPowerKw=20;backup.targetPeakPowerKw=20;backup.autonomyHours=.25;
 backup.sts={...backup.sts!,mode:'manual',accessoryId:'large',gridBusScope:'backup_bus',maxGridPassageKw:20};
 const catalog=modularFixture();
 mocks.query.mockResolvedValue({generation:{id:'g',source_revision:'r'},solutions:generateCiGroupedSolutions(catalog,[]).solutions});
 mocks.sts.mockResolvedValue(stsFixture().catalog);
 mocks.accessories.mockResolvedValue({products:stsFixture().catalog.specs.map(spec=>({id:spec.accessory_id,model:spec.model,active:true})),rules:[],prices:{},selectedIds:[],stsIds:['small','large']});
 const opts=options();opts.loadShiftingCoveragePercent=50;
 const result=await calculatePersistedCi(client(false).db,{...opts,backup});
 expect(result.selected?.sts?.status).toBe('selected');
 expect(result.selected?.sts?.selected?.spec.accessory_id).toBe('small');
 expect(backup.sts.mode).toBe('manual');
});
it('reports missing transfer compatibility as a technical failure without dropping the STS', async () => {
 const result=await calculatePersistedCi(client().db,{...options(),backup:stsBackup(),loadShiftingCoveragePercent:50});
 expect(result.selected).toBeNull();
 expect(result.technicalIssues?.some(issue=>issue.code==='transfer')).toBe(true);
});
it('simulates both sources from one persisted contract and selects technical adequacy despite negative finances',async()=>{
 const {db,where}=client();const result=await calculatePersistedCi(db,options());
 expect(result.engineVersion).toBe('ci-technical-v1');expect(result.solutionGeneration?.id).toBe('generation');expect(result.scenarios).toHaveLength(1);
 expect(result.selected?.group?.source.kind).toBe('assembly');
 expect(result.selected?.technicalValidity).toBe(true);expect(result.selected?.npv).toBeLessThan(0);expect(result.recommendation.scenarioId).toBe(result.selected?.scenarioId);expect(result.selected?.dispatch.length).toBe(672);expect(where).toHaveBeenCalledWith('user_id','owner');
 expect(mocks.query).toHaveBeenCalledWith(db,expect.objectContaining({minPowerKw:0,minEnergyKwh:0,applications:[]}));expect(mocks.current).toHaveBeenCalledWith(db,'generation');
});
it('retains technical results with missing prices and excludes financial recommendation',async()=>{
 const result=await calculatePersistedCi(client(false).db,options());expect(result.selected?.technicalValidity).toBe(true);expect(result.selected?.pricingComplete).toBe(false);expect(result.selected?.missingPrices?.length).toBeGreaterThan(0);expect(result.recommendation.scenarioId).toBe(result.selected?.scenarioId);
});
it('checks real dispatch adequacy beyond nominal power and useful energy',async()=>{
 const first=solutions()[0];mocks.query.mockResolvedValue({generation:{id:'g',source_revision:'r'},solutions:[first]});
 const result=await calculatePersistedCi(client().db,options());expect(result.technicalSelection?.scenarioId).toBeNull();expect(result.selected).toBeNull();expect(result.scenarios).toEqual([]);expect(result.technicalIssues?.length).toBeGreaterThan(0);
});
it('translates legacy selections to stored source/count filters',async()=>{
 const {db}=client();await calculatePersistedCi(db,modularOptions());expect(mocks.query).toHaveBeenCalledWith(db,expect.objectContaining({sourceKind:'assembly',sourceId:modularFixture().rules[0].id,units:{min:1,max:2},ports:{min:1,max:2},series:{min:2,max:2},parallel:{min:1,max:1}}));
});
it('validates fixed generated selections and preserves diagnostics for unsupported applications',async()=>{
 const solution=solutions()[0];mocks.query.mockResolvedValue({generation:{id:'g',source_revision:'r'},solutions:[solution]});
 const opts=options();const fixed={...opts,bessSystem:{kind:'solution' as const,solutionKey:solution.key},solar:{enabled:true,installedPowerKwp:1,inverterPowerKw:1,dailyYieldKwhPerKwp:4.5,prioritizeBessCharging:true}};
 const result=await calculatePersistedCi(client().db,fixed);expect(result.selected).toBeNull();expect(result.scenarios).toEqual([]);expect(result.technicalIssues?.length).toBeGreaterThan(0);expect(result.technicalIssues?.some(issue=>issue.code==='application')).toBe(true);
 await expect(calculatePersistedCi(client().db,{...opts,bessSystem:{kind:'solution',solutionKey:''}})).rejects.toThrow('Selecione');
});
it('fails if the generation changes after simulation',async()=>{
 mocks.current.mockRejectedValueOnce(new Error('catálogo mudou'));await expect(calculatePersistedCi(client().db,options())).rejects.toThrow('mudou');
});
it('counts an approved controller once and merges included accessories with the BOM',async()=>{
 const catalog=modularFixture();catalog.rules[0].controller_accessory_id='control';catalog.accessories.push({id:'control',model:'Controlador',active:true});
 mocks.query.mockResolvedValue({generation:{id:'g',source_revision:'r'},solutions:generateCiGroupedSolutions(catalog,[]).solutions});
 mocks.accessories.mockResolvedValue({products:[{id:'control',model:'Controlador',active:true}],rules:[],prices:{},selectedIds:[],stsIds:[]});
 const result=await calculatePersistedCi(client().db,options());const scenario=result.scenarios[0];expect(scenario.billOfMaterials?.filter(i=>i.productId==='control')).toHaveLength(1);expect(scenario.missingPrices).toContain('Controlador');expect(scenario.capex).toBe(5e8);
});
it('respects partial load-shifting coverage in actual dispatch',async()=>{
 const fixed=solutions()[0];mocks.query.mockResolvedValue({generation:{id:'g',source_revision:'r'},solutions:[fixed]});
 const result=await calculatePersistedCi(client().db,{...options(),loadShiftingCoveragePercent:50});expect(result.selected?.technicalValidity).toBe(true);const peak=result.selected!.dispatch.filter(p=>p.tariffPeriod==='peak');expect(peak.every(p=>Math.abs(p.gridImportKw-50)<1e-6)).toBe(true);
});
it('preserves imported solar values through the common simulator',async()=>{
 const opts=options();const generationCurve={...opts.loadCurve!,points:opts.loadCurve!.points.map(p=>({...p,powerKw:27.5}))};
 const catalog=modularFixture();catalog.rules[0].supports_solar=true;mocks.query.mockResolvedValue({generation:{id:'g',source_revision:'r'},solutions:generateCiGroupedSolutions(catalog,[]).solutions});
 const result=await calculatePersistedCi(client().db,{...opts,solar:{enabled:true,installedPowerKwp:0,inverterPowerKw:0,dailyYieldKwhPerKwp:4.5,prioritizeBessCharging:false,generationCurve}});expect(result.selected!.dispatch.every(p=>p.solarGenerationKw===27.5)).toBe(true);
});

it('keeps a smaller approved BESS eligible when generator peak support meets the remaining demand',async()=>{
 const {DEFAULT_CI_GENERATOR_CONFIG}=await import('@/supabase/functions/_shared/commercial-industrial/types');
 const product={...cabinetFixture(),module_power_kw:50,max_parallel_units:1,supports_generator:true};
 const grouped=generateCiGroupedSolutions({...modularFixture(),rules:[]},[product]).solutions;
 mocks.query.mockResolvedValue({generation:{id:'g',source_revision:'r'},solutions:grouped});
 const opts=options();opts.strategy='PEAK_SHAVING';opts.tariff!.contractedDemandKw=100;
 opts.loadCurve={...opts.loadCurve!,timezone:'UTC',periodEnd:'2026-01-01',points:Array.from({length:96},(_,i)=>({timestamp:new Date(Date.UTC(2026,0,1,0,i*15)).toISOString(),powerKw:i>=72&&i<84?200:100}))};
 const result=await calculatePersistedCi(client().db,{...opts,generator:{...DEFAULT_CI_GENERATOR_CONFIG,enabled:true,ratedPowerKva:100,dispatchMode:'peak_support'}});
 expect(mocks.query).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({minPowerKw:0,minEnergyKwh:0}));
 expect(result.selected?.technicalValidity).toBe(true);expect(result.selected?.dispatch.every(p=>p.gridImportKw<=100+1e-6)).toBe(true);
 expect(result.selected?.dispatch.find(p=>p.tariffPeriod==='peak')?.generatorKw).toBe(50);
});

it('keeps a physically sufficient hybrid solution when PV reduces the future peak requirement',async()=>{
 const product={...cabinetFixture(),max_parallel_units:1,module_capacity_kwh:40,efficiency_percent:100,ac_charge_efficiency_percent:100,ac_discharge_efficiency_percent:100,soc_min_percent:0,soc_max_percent:100,supports_solar:true};
 const grouped=generateCiGroupedSolutions({...modularFixture(),rules:[]},[product]).solutions;
 mocks.query.mockResolvedValue({generation:{id:'g',source_revision:'r'},solutions:grouped});
 const opts=options();opts.strategy='HYBRID';opts.tariff!.contractedDemandKw=50;
 const curve={...opts.loadCurve!,timezone:'UTC',periodEnd:'2026-01-01',points:Array.from({length:96},(_,i)=>({timestamp:new Date(Date.UTC(2026,0,1,0,i*15)).toISOString(),powerKw:i===71?80:i===72||i===73?100:0}))};
 const generationCurve={...curve,points:curve.points.map((p,i)=>({...p,powerKw:i===72||i===73?80:0}))};
 const result=await calculatePersistedCi(client().db,{...opts,loadCurve:curve,solar:{enabled:true,installedPowerKwp:100,inverterPowerKw:100,dailyYieldKwhPerKwp:4.5,prioritizeBessCharging:true,generationCurve}});
 expect(result.selected?.technicalValidity).toBe(true);expect(result.selected?.dispatch[71].gridImportKw).toBe(50);
 expect(result.selected?.dispatch.filter(p=>p.tariffPeriod==='peak').every(p=>p.gridImportKw===0)).toBe(true);
});

it('selects models across every approved rule, without per-port or user quantity filters',async()=>{
 const catalog=modularFixture();catalog.pcs[0].gridTypes=['3P_380V'];
 mocks.query.mockResolvedValue({generation:{id:'g',source_revision:'r'},solutions:generateCiGroupedSolutions(catalog,[]).solutions});
 const opts={...options(),lineVoltageV:380 as const,bessSystem:{kind:'model' as const,sourceKind:'assembly' as const,pcsId:catalog.pcs[0].inverter_id,batteryId:catalog.batteries[0].battery_id}};
 const financial=await import('@/supabase/functions/_shared/commercial-industrial/financial');const cash=vi.spyOn(financial,'buildCashFlow');
 const result=await calculatePersistedCi(client().db,opts);
 expect(result.scenarios).toHaveLength(1);expect(result.selected?.technicalValidity).toBe(true);
 expect(result.scenarios[0]).not.toHaveProperty('dispatch');expect(result.scenarios[0]).not.toHaveProperty('cashFlow');
 expect(result.selected?.group?.ac.lineVoltagesV).toEqual([380]);expect(cash).toHaveBeenCalledTimes(1);
 expect(mocks.query).toHaveBeenCalledWith(expect.anything(),{minPowerKw:0,minEnergyKwh:0,applications:[],sourceKind:'assembly',pcsId:opts.bessSystem.pcsId,batteryId:opts.bessSystem.batteryId});
 const alternate=await calculatePersistedCi(client().db,{...opts,rankingCriterion:'NPV'});expect(alternate.selected?.scenarioId).toBe(result.selected?.scenarioId);
 cash.mockRestore();
});

it('does not compute cash flows or display a fallback for the wrong voltage',async()=>{
 const grouped=generateCiGroupedSolutions({...modularFixture(),rules:[]},[{...cabinetFixture(),ac_voltages_v:[380]}]).solutions;
 mocks.query.mockResolvedValue({generation:{id:'g',source_revision:'r'},solutions:grouped});
 const financial=await import('@/supabase/functions/_shared/commercial-industrial/financial');const cash=vi.spyOn(financial,'buildCashFlow');
 const result=await calculatePersistedCi(client().db,{...options(),lineVoltageV:220,bessSystem:{kind:'model',sourceKind:'cabinet',productId:cabinetFixture().id}});
 expect(result.selected).toBeNull();expect(result.scenarios).toEqual([]);expect(result.recommendation.scenarioId).toBeNull();expect(result.technicalIssues?.[0].code).toBe('voltage');expect(cash).not.toHaveBeenCalled();cash.mockRestore();
});

it('explains failed dispatch despite sufficient nominal power and energy, with no finances',async()=>{
 const product={...cabinetFixture(),max_parallel_units:1,module_capacity_kwh:1000,charge_power_kw:.01};
 mocks.query.mockResolvedValue({generation:{id:'g',source_revision:'r'},solutions:generateCiGroupedSolutions({...modularFixture(),rules:[]},[product]).solutions});
 const financial=await import('@/supabase/functions/_shared/commercial-industrial/financial');const cash=vi.spyOn(financial,'buildCashFlow');
 const result=await calculatePersistedCi(client().db,options());
 expect(result.selected).toBeNull();expect(result.scenarios).toEqual([]);expect(result.technicalIssues?.map(i=>i.code)).toContain('dispatch');expect(cash).not.toHaveBeenCalled();cash.mockRestore();
});

it('persists the study FP without reinterpreting stored active curves, energy or costs', async () => {
 const original=options();
 const unity=await calculatePersistedCi(client().db,{...original,acPowerFactor:1});
 const nonunity=await calculatePersistedCi(client().db,{...original,acPowerFactor:.8});
 expect(nonunity.assumptions.acPowerFactor).toBe(.8);
 expect(nonunity.baseline).toEqual(unity.baseline);
 expect(nonunity.technicalRequirements).toEqual(unity.technicalRequirements);
 expect(nonunity.selected?.annualSavings).toEqual(unity.selected?.annualSavings);
 expect(nonunity.inputFingerprint).not.toBe(unity.inputFingerprint);
 await expect(calculatePersistedCi(client().db,{...original,acPowerFactor:0})).rejects.toThrow('fator de potência');
});

it('persists rechargeWindow in assumptions and applies it during calculation', async () => {
  const rechargeWindow = { start: '02:00', end: '06:00' };
  const result = await calculatePersistedCi(client().db, { ...options(), rechargeWindow });
  expect(result.assumptions.rechargeWindow).toEqual(rechargeWindow);
});
