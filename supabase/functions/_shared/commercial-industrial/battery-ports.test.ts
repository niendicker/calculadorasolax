import {describe,it,expect} from 'vitest';
import {createPortStates,dispatchPorts,portBackupDuration} from './battery-ports';
import {runDispatch} from './dispatch';
import {evaluateCandidateBackup} from './backup';
import {generateCiGroupedSolutions,groupedSolutionSpec} from './grouped-solutions';
import {modularOptions} from './modular.test-fixtures';
import type {CiRuntimePort} from './types';

import {aelioPortFixture} from './battery-ports.test-fixtures';

const port=(unit:number,index:number,energy:number,cap=10):CiRuntimePort=>({unit,port:index,nominalEnergyKwh:energy,chargePowerKw:cap,dischargePowerKw:cap,unitChargePowerKw:20,unitDischargePowerKw:20});
describe('independent battery ports',()=>{
 it('generates asymmetric banks and removes only permutations of identical ports',()=>{
  const result=generateCiGroupedSolutions(aelioPortFixture(),[]);expect(result.diagnostics).toEqual([]);expect(result.solutions).toHaveLength(44);
  const mixed=result.solutions.find(s=>s.dc.ports?.map(p=>p.series).join(',')==='7,14')!;
  expect(mixed.storage.nominalEnergyKwh).toBeCloseTo(300.3);expect(mixed.counts.batteries).toBe(21);expect(mixed.ac.dischargePowerKw).toBe(60);
  expect(mixed.dc.ports?.map(p=>p.voltageMinV)).toEqual([280,560]);
  expect(result.solutions.some(s=>s.dc.ports?.map(p=>p.series).join(',')==='14,7')).toBe(false);
  const full=result.solutions.find(s=>s.dc.ports?.map(p=>p.series).join(',')==='14,14')!;expect(full.counts.batteries).toBe(28);expect(full.ac.dischargePowerKw).toBe(60);
  expect(result.solutions.find(s=>s.dc.ports?.map(p=>p.series).join(',')==='14')?.ac.dischargePowerKw).toBeCloseTo(43.456);
 });
 it('rejects extra ports and excessive association inside one port',()=>{
  const catalog=aelioPortFixture();catalog.rules[0].max_ports_per_pcs=3;expect(generateCiGroupedSolutions(catalog,[]).diagnostics[0]).toContain('portas');
  catalog.rules[0].max_ports_per_pcs=2;catalog.rules[0].max_series=15;expect(generateCiGroupedSolutions(catalog,[]).diagnostics[0]).toContain('associação');
 });
 it('never borrows energy or power from another port and honors each parent PCS cap',()=>{
  const ports=[port(1,1,1),port(1,2,100)];const states=createPortStates(ports,100);
  const actual=dispatchPorts(states,'discharge',20,1,0,100,1);expect(actual.powerKw).toBe(11);expect(states.map(p=>p.socKwh)).toEqual([0,90]);
  const limited=createPortStates(ports.map(p=>({...p,unitDischargePowerKw:8})),100);expect(dispatchPorts(limited,'discharge',20,1,0,100,1).powerKw).toBeCloseTo(8);
  const charged=createPortStates(ports,0);expect(dispatchPorts(charged,'charge',20,1,0,100,1).powerKw).toBe(11);expect(charged.map(p=>p.socKwh)).toEqual([1,10]);
 });
 it('keeps per-port SOC and flow in the same on-grid dispatch',()=>{
  const curve={...modularOptions().loadCurve!,timezone:'UTC',resolutionMinutes:60 as const,points:[{timestamp:'2026-01-01T18:00:00Z',powerKw:20},{timestamp:'2026-01-01T19:00:00Z',powerKw:20}]};
  const trace=runDispatch({curve,bess:{ports:[port(1,1,1),port(1,2,100)],totalPowerKw:20,totalCapacityKwh:101,socMinPercent:0,socMaxPercent:100,efficiencyPercent:100},strategy:'LOAD_SHIFTING',tariffWindow:{peakStart:'18:00',peakEnd:'21:00'},peakShavingTargetKw:100,contractedDemandKw:100});
  expect(trace.map(p=>p.dischargeKw)).toEqual([11,10]);expect(trace.map(p=>p.socKwh)).toEqual([90,80]);expect(trace[1].portFlows?.[0].socKwh).toBe(0);
 });
 it('does not certify backup solely from aggregate energy when a port cannot supply its share',()=>{
  const ports=[port(1,1,1),port(1,2,100)];expect(portBackupDuration(ports,100,0,100,1,20,[{powerKw:20,durationHours:1}]).complete).toBe(false);
  const product={ports,modulePowerKw:20,moduleCapacityKwh:101,socMinPercent:0,socMaxPercent:100,efficiencyPercent:100,dischargeEfficiencyPercent:100};
  const result=evaluateCandidateBackup(20,101,product,{requiredContinuousPowerKw:20,requiredPeakPowerKw:20,requiredEnergyKwh:20,autonomyHours:1});
  expect(result.meetsPower).toBe(true);expect(result.meetsEnergy).toBe(false);expect(result.minModulesForBackup).toBe(2);expect(result.effectiveAutonomyHours).toBeCloseTo(.1,5);
 });
 it('decomposes the aggregate AELIO power into individually valid port flows',()=>{
  const solution=generateCiGroupedSolutions(aelioPortFixture(),[]).solutions.find(s=>s.dc.ports?.map(p=>p.series).join(',')==='7,14')!;
  const product=groupedSolutionSpec(solution),curve=modularOptions().loadCurve!;
  const trace=runDispatch({curve,bess:{ports:product.ports,totalPowerKw:product.modulePowerKw,maxChargePowerKw:product.moduleChargePowerKw,totalCapacityKwh:product.moduleCapacityKwh,socMinPercent:product.socMinPercent,socMaxPercent:product.socMaxPercent,efficiencyPercent:product.efficiencyPercent,chargeEfficiencyPercent:product.chargeEfficiencyPercent,dischargeEfficiencyPercent:product.dischargeEfficiencyPercent},strategy:'LOAD_SHIFTING',tariffWindow:{peakStart:'18:00',peakEnd:'21:00'},peakShavingTargetKw:300,contractedDemandKw:300});
  for(const point of trace){expect(point.dischargeKw).toBeLessThanOrEqual(60+1e-6);expect(point.chargeKw).toBeLessThanOrEqual(60+1e-6);for(const flow of point.portFlows!){const limit=product.ports!.find(p=>p.unit===flow.unit&&p.port===flow.port)!;expect(flow.dischargeKw).toBeLessThanOrEqual(limit.dischargePowerKw+1e-6);expect(flow.chargeKw).toBeLessThanOrEqual(limit.chargePowerKw+1e-6);expect(flow.socKwh).toBeGreaterThanOrEqual(limit.nominalEnergyKwh*.1-1e-6);}}
 });
});
it('preserves enough reserve in every bank for the actual backup profile',()=>{
 const ports=[port(1,1,1),port(1,2,100)];const profile=[{powerKw:8,durationHours:.25},{powerKw:15,durationHours:.1}];
 const result=evaluateCandidateBackup(20,101,{ports,modulePowerKw:20,moduleCapacityKwh:101,socMinPercent:0,socMaxPercent:100,efficiencyPercent:100,dischargeEfficiencyPercent:100},{requiredContinuousPowerKw:15,requiredPeakPowerKw:15,requiredEnergyKwh:3.5,autonomyHours:.35,powerProfile:profile});
 expect(result.status).toBe('fully_covered');expect(result.recommendedSocReservePercent).toBeGreaterThan(50);
 expect(portBackupDuration(ports,result.recommendedSocReservePercent,0,100,1,20,profile).complete).toBe(true);
});
