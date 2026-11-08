import {expect,it} from 'vitest';
import {assertCiGroupedSolution,generateCiGroupedSolutions} from './grouped-solutions';
import {modularFixture} from './modular.test-fixtures';
import {cabinetFixture} from './grouped-solutions.test-fixtures';
import {diagnoseCiSolutionFailure,orderCiTechnicalSolutions} from './solution-selection';
import type {ScenarioCandidate} from './types';
const base=()=>generateCiGroupedSolutions(modularFixture(),[{...cabinetFixture(),ac_voltages_v:[380]}]).solutions.find(s=>s.source.kind==='cabinet')!;
const req={minPowerKw:150,minEnergyKwh:300,applications:[]};
it('rejects malformed voltage declarations while retaining historical contracts without the field',()=>{
 const solution=base();solution.ac.lineVoltagesV=undefined;expect(()=>assertCiGroupedSolution(solution)).not.toThrow();
 solution.ac.lineVoltagesV=[400 as 380];expect(()=>assertCiGroupedSolution(solution)).toThrow('Tensões CA');
});
it('reports isolated power and energy shortfalls with proven maxima',()=>{
 const issues=diagnoseCiSolutionFailure([base()],[],req,380);
 expect(issues).toEqual([expect.objectContaining({code:'power',required:150,available:100}),expect.objectContaining({code:'energy',required:300,available:170})]);
});
it('does not claim isolated shortfalls when different configurations meet each bound',()=>{
 const a=base(),b=base();a.ac.dischargePowerKw=200;b.storage.usableEnergyKwh=400;
 expect(diagnoseCiSolutionFailure([a,b],[],req,380).map(i=>i.code)).toEqual(['combined']);
});
it('excludes the wrong voltage before reporting available limits',()=>{
 const a=base(),b=base();b.ac.lineVoltagesV=[220];b.ac.dischargePowerKw=1000;b.storage.usableEnergyKwh=2000;
 expect(diagnoseCiSolutionFailure([a,b],[],req,380).map(i=>i.code)).toEqual(['power','energy']);
 expect(diagnoseCiSolutionFailure([b],[],req,380)[0].code).toBe('voltage');
});
it('reports unapproved applications and distinguishes split approvals',()=>{
 const a=base(),b=base();a.applications=['backup'];b.applications=['solar'];
 expect(diagnoseCiSolutionFailure([a],[],{...req,applications:['generator']},380)[0].code).toBe('application');
 expect(diagnoseCiSolutionFailure([a,b],[],{...req,applications:['backup','solar']},380)[0].code).toBe('combined');
});
it('attributes dynamic failures only if every eligible simulation fails that check',()=>{
 const product=base(),requirements={minPowerKw:1,minEnergyKwh:1,applications:[]};
 const candidate=(checks:Partial<NonNullable<ScenarioCandidate['technicalChecks']>>)=>({technicalChecks:{backup:true,transfer:true,accessories:true,dispatch:true,demand:true,...checks}} as ScenarioCandidate);
 expect(diagnoseCiSolutionFailure([product],[candidate({backup:false}),candidate({backup:false})],requirements,380).map(i=>i.code)).toEqual(['backup']);
 expect(diagnoseCiSolutionFailure([product],[candidate({backup:false}),candidate({dispatch:false})],requirements,380).map(i=>i.code)).toEqual(['combined']);
 expect(diagnoseCiSolutionFailure([product],[candidate({transfer:false})],requirements,380)[0].code).toBe('transfer');
 expect(diagnoseCiSolutionFailure([product],[candidate({accessories:false})],requirements,380)[0].code).toBe('accessories');
 expect(diagnoseCiSolutionFailure([],[],requirements,380)[0].code).toBe('catalog');
});
it('uses unit count, then nominal energy and a stable key; ignores financial rankings',()=>{
 const a=base(),b=base(),c=base();a.key='a';b.key='b';c.key='c';a.counts.units=2;b.storage.nominalEnergyKwh=400;c.storage.nominalEnergyKwh=300;
 expect(orderCiTechnicalSolutions([a,b,c]).map(s=>s.key)).toEqual(['c','b','a']);
});
