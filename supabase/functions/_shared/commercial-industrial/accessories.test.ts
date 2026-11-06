import { describe, expect, it } from 'vitest';
import { evaluateCiAccessories, type CiAccessoryContext, type CiAccessoryItem, type CiAccessoryRule, type CiAccessoryTarget } from './accessories';
import { calculateModularStudy } from './modular';
import { modularFixture, modularOptions } from './modular.test-fixtures';
import { buildScenarioGrid, materializeScenarioDetail } from './scenarios';

const target: CiAccessoryTarget = {pcsId:'pcs',batteryId:'battery',compatibilityId:'pair',pcs:3,battery:12,string:6,bess:0,backup:true,generator:false,lineVoltageV:380};
function rule(overrides: Partial<CiAccessoryRule> = {}): CiAccessoryRule {
 return {id:'rule',name:'Controle documentado',accessory_id:'ems',active:true,pcs_id:null,battery_id:null,bess_product_id:null,compatibility_id:null,backup:null,generator:null,line_voltage_v:null,inclusion:'required',metric:'system',min_count:1,max_count:null,quantity:1,divisor:1,requires_ids:[],excludes_ids:[],reference_document:'Ficha / revisão 1',...overrides};
}
function context(rules: CiAccessoryRule[] = [rule()]): CiAccessoryContext {
 return {products:[{id:'ems',model:'EMS',active:true},{id:'meter',model:'Medidor',active:true},{id:'sts',model:'STS',active:true}],rules,prices:{ems:1000,meter:200,sts:5000},selectedIds:[],stsIds:['sts']};
}
const existing: CiAccessoryItem = {productId:'ems',model:'EMS',quantity:3,unitPriceBrl:1000,totalBrl:3000,bundled:false,reasons:['Compatibilidade'],ruleIds:[]};
describe('C&I accessory rules',()=>{
 it.each([['system',1],['pcs',3],['battery',12],['string',6],['bess',0]] as const)('scales %s per actual composition count', (metric,count)=>{
  const result=evaluateCiAccessories(context([rule({metric})]),target);
  expect(result.items[0]?.quantity ?? 0).toBe(count);
 });
 it('uses quantity bands and rounds groups upward',()=>{
  const result=evaluateCiAccessories(context([rule({metric:'battery',min_count:10,max_count:12,divisor:5,quantity:2})]),target);
  expect(result.items[0]).toMatchObject({quantity:6,totalBrl:6000,ruleIds:['rule']});
  expect(evaluateCiAccessories(context([rule({metric:'battery',max_count:11})]),target).items).toEqual([]);
 });
 it('requires all product and project conditions to match',()=>{
  for(const condition of [{pcs_id:'other'},{battery_id:'other'},{bess_product_id:'other'},{compatibility_id:'other'},{backup:false},{generator:true},{line_voltage_v:400},{active:false}]) expect(evaluateCiAccessories(context([rule(condition)]),target).items).toEqual([]);
  expect(evaluateCiAccessories(context([rule({pcs_id:'pcs',battery_id:'battery',compatibility_id:'pair',backup:true,generator:false,line_voltage_v:380})]),target).items).toHaveLength(1);
 });
 it('requires explicit optional selection and never disables required rules',()=>{
  const data=context([rule({inclusion:'optional'})]);
  expect(evaluateCiAccessories(data,target).items).toEqual([]);
  data.selectedIds=['ems'];expect(evaluateCiAccessories(data,target).additionalCostBrl).toBe(1000);
  expect(evaluateCiAccessories(context(),target).items).toHaveLength(1);
 });
 it('deduplicates overlapping rules and legacy controllers using maximum quantities',()=>{
  const data=context([rule({metric:'pcs'}),rule({id:'other',quantity:2})]);
  const result=evaluateCiAccessories(data,target,[existing]);
  expect(result.items).toHaveLength(1);expect(result.items[0].quantity).toBe(3);expect(result.additionalCostBrl).toBe(0);
  expect(result.items[0].reasons).toHaveLength(3);
 });
 it('waives explicitly bundled controller cost independently of rule ordering and without requiring a price',()=>{
  const rules=[rule(),rule({id:'included',inclusion:'bundled',requires_ids:['sts']})];
  const sts={...existing,productId:'sts',model:'STS',quantity:1,unitPriceBrl:5000,totalBrl:5000};
  for(const ordered of [rules,[...rules].reverse()]) {
   const data=context(ordered);delete data.prices.ems;
   const result=evaluateCiAccessories(data,target,[existing,sts]);
   expect(result.valid).toBe(true);expect(result.additionalCostBrl).toBe(-3000);expect(result.items.find(item=>item.productId==='ems')).toMatchObject({bundled:true,totalBrl:0});
  }
 });
 it('rejects missing dependencies, exclusions and inactive products',()=>{
  expect(evaluateCiAccessories(context([rule({requires_ids:['meter']})]),target).valid).toBe(false);
  expect(evaluateCiAccessories(context([rule({excludes_ids:['meter']}),rule({id:'meter-rule',accessory_id:'meter'})]),target).valid).toBe(false);
  const data=context();data.products[0].active=false;
  expect(evaluateCiAccessories(data,target).valid).toBe(false);
 });
 it('keeps missing price distinct from a deliberately registered zero',()=>{
  const data=context();delete data.prices.ems;
  expect(()=>evaluateCiAccessories(data,target)).toThrow('Portfólio');
  data.prices.ems=0;expect(evaluateCiAccessories(data,target).additionalCostBrl).toBe(0);
 });
 it('cannot instantiate or bundle a STS through a generic rule',()=>{
  expect(evaluateCiAccessories(context([rule({accessory_id:'sts'})]),target).valid).toBe(false);
  const sts={...existing,productId:'sts',model:'STS',quantity:1,unitPriceBrl:5000,totalBrl:5000};
  expect(evaluateCiAccessories(context([rule({accessory_id:'sts',inclusion:'bundled'})]),target,[sts]).valid).toBe(false);
 });
 it('changes modular CAPEX, cash flow and BOM per actual PCS count',()=>{
  const catalog=modularFixture();
  const result=calculateModularStudy(modularOptions(),catalog,{pcsUnitBrl:40000,batteryUnitBrl:30000},undefined,context([rule({metric:'pcs'})]));
  for(const scenario of result.scenarios){
   const items=scenario.composition!.items;
   expect(scenario.capex).toBe(items.reduce((sum,item)=>sum+item.totalBrl,0));
   expect(scenario.accessories![0].quantity).toBe(scenario.composition!.pcsCount);
  }
  expect(result.selected!.cashFlow[0].nominalCashFlow).toBe(-result.selected!.capex);
 });
 it('includes integrated accessory costs in every candidate and materialized financial result',()=>{
  const options=modularOptions();
  const input={curve:options.loadCurve!,tariff:options.tariff!,strategy:options.strategy,tariffWindow:{peakStart:'18:00',peakEnd:'21:00'},sizing:{mode:'auto' as const,moduleCount:null,minModules:1,maxModules:3},peakShavingTargetKw:300,unitPriceBrl:10000,monthsPerYear:12,financialAssumptions:options.financialAssumptions,product:{modulePowerKw:100,moduleCapacityKwh:200,efficiencyPercent:95,socMinPercent:10,socMaxPercent:95},accessoryContext:context([rule({bess_product_id:'integrated',metric:'bess'})]),accessoryTarget:{...target,pcs:0,battery:0,string:0,bess:1,bessProductId:'integrated'}};
  const result=buildScenarioGrid(input);
  expect(result.scenarios.map(item=>item.capex)).toEqual([11000,22000,33000]);
  const detail=materializeScenarioDetail(input,3,null);expect(detail.cashFlow[0].nominalCashFlow).toBe(-33000);
 });
 it('makes a candidate technically invalid when accessory dependencies cannot be met',()=>{
  const result=calculateModularStudy(modularOptions(),modularFixture(),{pcsUnitBrl:40000,batteryUnitBrl:30000},undefined,context([rule({requires_ids:['meter']})]));
  expect(result.scenarios.every(item=>!item.technicalValidity)).toBe(true);expect(result.recommendation.scenarioId).toBeNull();
 });
});
