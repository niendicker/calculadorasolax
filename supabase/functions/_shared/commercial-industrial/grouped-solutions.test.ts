import { describe,it,expect } from 'vitest';
import { generateCiGroupedSolutions,groupedSolutionSpec,assertCiGroupedSolution } from './grouped-solutions';
import { modularFixture } from './modular.test-fixtures';
import { cabinetFixture } from './grouped-solutions.test-fixtures';

describe('grouped solution generation',()=>{
 it('generates all physical quantities with unique stable identities and no prices',()=>{
  const first=generateCiGroupedSolutions(modularFixture(),[cabinetFixture()]);
  expect(first.diagnostics).toEqual([]);expect(first.solutions).toHaveLength(7);
  expect(new Set(first.solutions.map(s=>s.key)).size).toBe(7);
  expect(first.solutions).toEqual(generateCiGroupedSolutions(modularFixture(),[cabinetFixture()]).solutions);
  expect(first.solutions.find(s=>s.counts.pcs===2&&s.counts.ports===2)).toMatchObject({storage:{nominalEnergyKwh:800,usableEnergyKwh:680},ac:{dischargePowerKw:200},dc:{buses:4}});
  expect(JSON.stringify(first.solutions)).not.toContain('unitPriceBrl');
 });
 it('scales cabinet energy and power while retaining independent documented DC buses',()=>{
  const solution=generateCiGroupedSolutions({...modularFixture(),rules:[]},[cabinetFixture()]).solutions[2];
  expect(solution.counts.bess).toBe(3);expect(solution.storage.usableEnergyKwh).toBe(510);expect(solution.ac.dischargePowerKw).toBe(300);expect(solution.dc.buses).toBe(3);
  expect(groupedSolutionSpec(solution)).toMatchObject({moduleCapacityKwh:600,modulePowerKw:300,moduleChargePowerKw:240});
 });
 it('uses the same simulator contract for cabinet and assembly',()=>{
  const solutions=generateCiGroupedSolutions(modularFixture(),[cabinetFixture()]).solutions;
  for(const s of solutions){assertCiGroupedSolution(s);const spec=groupedSolutionSpec(s);expect(spec.modulePowerKw).toBe(s.ac.dischargePowerKw);expect(spec.moduleCapacityKwh).toBe(s.storage.nominalEnergyKwh);expect(spec.chargeEfficiencyPercent).toBe(s.storage.chargeEfficiencyPercent);}
 });
 it('excludes incomplete cabinet limits and requires explicit application approvals',()=>{
  const product=cabinetFixture();delete product.dc_charge_current_a;
  const result=generateCiGroupedSolutions(modularFixture(),[product]);expect(result.solutions).toHaveLength(4);expect(result.diagnostics[0]).toContain('limites CC/CA');
  expect(result.solutions[0].applications).toEqual(['peak_shaving','load_shifting','backup']);
 });
 it('caps AC power at minimum-voltage current limits',()=>{
  const product=cabinetFixture();product.dc_discharge_current_a=50;
  const solution=generateCiGroupedSolutions({...modularFixture(),rules:[]},[product]).solutions[0];
  expect(solution.ac.dischargePowerKw).toBeCloseTo(40*.95);
 });
 it('refuses truncation and impossible contract envelopes',()=>{
  expect(()=>generateCiGroupedSolutions(modularFixture(),[],3)).toThrow('excede');
  const solution=generateCiGroupedSolutions(modularFixture(),[]).solutions[0];solution.ac.dischargePowerKw=1e9;
  expect(()=>assertCiGroupedSolution(solution)).toThrow('envelope CC');
 });
 it('skips unapproved rules and missing required controllers',()=>{
  const catalog=modularFixture();catalog.rules[0].approval_status='draft';expect(generateCiGroupedSolutions(catalog,[]).solutions).toEqual([]);
  catalog.rules[0].approval_status='approved';catalog.rules[0].controller_accessory_id='missing';expect(generateCiGroupedSolutions(catalog,[]).diagnostics[0]).toContain('Controlador');
 });
});
it('uses documented converter efficiency, rather than total cycle efficiency, to bound charging current',()=>{
 const product=cabinetFixture();product.charge_power_kw=150;product.dc_charge_current_a=100;product.dc_charge_power_kw=150;
 const solution=generateCiGroupedSolutions({...modularFixture(),rules:[]},[product]).solutions[0];
 expect(solution.ac.chargePowerKw).toBeCloseTo(80/.96);expect(solution.ac.chargePowerKw*.96).toBeLessThanOrEqual(80+1e-6);
 expect(solution.storage.chargeEfficiencyPercent*solution.storage.dischargeEfficiencyPercent/100).toBeCloseTo(90);
});
it('excludes cabinets with missing conversion efficiency or inconsistent cycle losses',()=>{
 const product=cabinetFixture();delete product.ac_charge_efficiency_percent;
 expect(generateCiGroupedSolutions(modularFixture(),[product]).solutions).toHaveLength(4);
 product.ac_charge_efficiency_percent=90;expect(generateCiGroupedSolutions(modularFixture(),[product]).diagnostics).toHaveLength(1);
});
