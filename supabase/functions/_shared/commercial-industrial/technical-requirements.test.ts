import {it,expect} from 'vitest';
import {modularOptions} from './modular.test-fixtures';
import { DEFAULT_CI_GENERATOR_CONFIG } from './types';
import {deriveCiTechnicalRequirements} from './technical-requirements';
it('derives peak-window power and energy from the curve and coverage',()=>{
 const options=modularOptions();options.bessSystem={kind:'automatic',minPowerKw:0,minEnergyKwh:0};
 const full=deriveCiTechnicalRequirements(options);expect(full.minPowerKw).toBe(100);expect(full.operatingEnergyAcKwh).toBe(300);expect(full.minEnergyKwh).toBe(300);
 options.loadShiftingCoveragePercent=50;const half=deriveCiTechnicalRequirements(options);expect(half.minPowerKw).toBe(50);expect(half.minEnergyKwh).toBe(150);
});
it('uses demand excess for peak shaving and combines limits for hybrid',()=>{
 const options=modularOptions();options.tariff!.contractedDemandKw=80;options.strategy='PEAK_SHAVING';
 expect(deriveCiTechnicalRequirements(options).minPowerKw).toBe(20);
 options.strategy='HYBRID';expect(deriveCiTechnicalRequirements(options).minPowerKw).toBe(100);
});
it('honors additional minimums and validates coverage',()=>{
 const options=modularOptions();options.bessSystem={kind:'automatic',minPowerKw:200,minEnergyKwh:500};
 expect(deriveCiTechnicalRequirements(options)).toMatchObject({minPowerKw:200,minEnergyKwh:500});
 options.loadShiftingCoveragePercent=101;expect(()=>deriveCiTechnicalRequirements(options)).toThrow('0 e 100');
});
it('does not filter out a smaller BESS when peak support from a generator can meet demand',()=>{
 const options=modularOptions();options.strategy='PEAK_SHAVING';options.tariff!.contractedDemandKw=100;
 options.loadCurve={...options.loadCurve!,timezone:'UTC',points:[{timestamp:'2026-01-01T18:00:00Z',powerKw:200}]};
 options.generator={...DEFAULT_CI_GENERATOR_CONFIG,enabled:true,ratedPowerKva:100,powerFactor:.8,dispatchMode:'peak_support'};
 expect(deriveCiTechnicalRequirements(options)).toMatchObject({minPowerKw:20,minEnergyKwh:5});
});

it('does not credit blackout-only generators, off-peak generation, or support below contracted demand',()=>{
 const options=modularOptions();options.strategy='PEAK_SHAVING';options.tariff!.contractedDemandKw=100;
 options.loadCurve={...options.loadCurve!,timezone:'UTC',points:[{timestamp:'2026-01-01T18:00:00Z',powerKw:200}]};
 options.generator={...DEFAULT_CI_GENERATOR_CONFIG,enabled:true,ratedPowerKva:100,dispatchMode:'blackout_only'};
 expect(deriveCiTechnicalRequirements(options).minPowerKw).toBe(100);
 options.generator.dispatchMode='peak_support';options.loadCurve.points[0].timestamp='2026-01-01T17:00:00Z';
 expect(deriveCiTechnicalRequirements(options).minPowerKw).toBe(100);
 options.loadCurve.points[0].timestamp='2026-01-01T18:00:00Z';options.strategy='LOAD_SHIFTING';
 expect(deriveCiTechnicalRequirements(options)).toMatchObject({minPowerKw:200,minEnergyKwh:50});
});
