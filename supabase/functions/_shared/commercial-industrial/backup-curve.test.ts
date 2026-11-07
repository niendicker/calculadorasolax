import { describe, expect, it } from 'vitest';
import { resolveBackupCurve } from './backup-curve';
import { computeBackupRequirements, evaluateCandidateBackup } from './backup';
import { modularOptions } from './modular.test-fixtures';
import { validateCommercialIndustrialOptions } from './validation';
import { calculateModularStudy } from './modular';
import { modularFixture } from './modular.test-fixtures';
import type { CiBackupConfig, CiBackupCurveSelection, LoadCurve } from './types';

const curve:LoadCurve={points:[10,30,20,40].map((powerKw,index)=>({timestamp:new Date(Date.UTC(2026,0,1,0,index*30)).toISOString(),powerKw})),resolutionMinutes:30,timezone:'America/Sao_Paulo',periodStart:'2025-12-31',periodEnd:'2025-12-31',profileBasis:'representative_period',source:'csv'};
const selection:CiBackupCurveSelection={method:'profile',startTimestamp:curve.points[0].timestamp,endTimestampExclusive:'2026-01-01T02:00:00Z'};
const config:CiBackupConfig={enabled:true,inputMode:'simple',targetPowerKw:999,autonomyHours:999,safetyMarginPercent:10,loads:[],curveSelection:selection};

describe('backup defined from current consumption window',()=>{
  it.each([
    ['profile',40,40,50],['average',25,40,50],['maximum',40,40,80],['manual',12,12,24],
  ] as const)('resolves %s without losing the last sample or the observed peak', (method,continuousPowerKw,requiredPeakKw,energyKwh)=>{
    expect(resolveBackupCurve({...selection,method,manualPowerKw:12},curve)).toMatchObject({durationHours:2,continuousPowerKw,requiredPeakKw,energyKwh});
  });
  it('recomputes values after editing consumption instead of using the saved power/autonomy mirrors',()=>{
    expect(computeBackupRequirements(config,curve)).toMatchObject({requiredContinuousPowerKw:44,autonomyHours:2});
    expect(computeBackupRequirements(config,curve)!.requiredEnergyKwh).toBeCloseTo(55);
    const changed={...curve,points:curve.points.map((point,index)=>({...point,powerKw:index===3?80:point.powerKw}))};
    expect(computeBackupRequirements(config,changed)).toMatchObject({requiredContinuousPowerKw:88,autonomyHours:2});
    expect(computeBackupRequirements(config,changed)!.requiredEnergyKwh).toBeCloseTo(77);
  });
  it('preserves an additional explicitly declared starting peak',()=>{
    expect(computeBackupRequirements({...config,targetPeakPowerKw:100},curve)?.requiredPeakPowerKw).toBeCloseTo(110);
  });
  it.each([
    {...curve,points:curve.points.slice(1)},
    {...curve,points:[...curve.points,curve.points[0]]},
    {...curve,points:curve.points.map((point,index)=>({...point,powerKw:index===1?-1:point.powerKw}))},
  ])('rejects incomplete, duplicated or invalid samples',invalid=>{
    expect(()=>resolveBackupCurve(selection,invalid)).toThrow(/intervalo|inválido|duplicados/);
  });
  it('rejects missing curves and invalid manual power',()=>{
    expect(()=>resolveBackupCurve(selection,null)).toThrow('curva de consumo');
    expect(()=>resolveBackupCurve({...selection,method:'manual',manualPowerKw:0},curve)).toThrow('maior que zero');
  });
  it('reports autonomy against selected energy rather than treating a varying profile as a constant peak',()=>{
    const requirements=computeBackupRequirements({...config,safetyMarginPercent:0},curve)!;
    const result=evaluateCandidateBackup(40,50,{modulePowerKw:40,moduleCapacityKwh:50,efficiencyPercent:100,socMinPercent:0,socMaxPercent:100},requirements);
    expect(result.status).toBe('fully_covered');expect(result.effectiveAutonomyHours).toBe(2);
    const insufficient=evaluateCandidateBackup(40,20,{modulePowerKw:40,moduleCapacityKwh:20,efficiencyPercent:100,socMinPercent:0,socMaxPercent:100},requirements);
    expect(insufficient.status).toBe('partially_covered');expect(insufficient.effectiveAutonomyHours).toBe(1);
  });
  it('blocks calculation when a saved selection no longer belongs to the edited curve',()=>{
    const options={...modularOptions(),loadCurve:{...curve,points:curve.points.slice(1)},backup:config};
    expect(validateCommercialIndustrialOptions(options).some(error=>error.includes('intervalo de backup'))).toBe(true);
  });

  it('uses selected energy and peak throughout the real modular study and reserve calculation',()=>{
    const options={...modularOptions(),loadCurve:curve,backup:config};
    const result=calculateModularStudy(options,modularFixture(),{pcsUnitBrl:40000,batteryUnitBrl:30000});
    expect(result.backup?.requiredEnergyKwh).toBeCloseTo(55);
    expect(result.backup?.requiredContinuousPowerKw).toBe(44);
    expect(result.backup?.status).toBe('fully_covered');
    expect(result.selected?.technicalValidity).toBe(true);
  });
});
