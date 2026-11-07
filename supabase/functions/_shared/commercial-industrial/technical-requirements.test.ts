import {it,expect} from 'vitest';
import {modularOptions} from './modular.test-fixtures';
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
