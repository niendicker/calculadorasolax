import { describe, it, expect } from 'vitest';
import { computeBackupRequirements, evaluateCandidateBackup } from './backup';
import type { CiBackupConfig, CiBessProduct } from './types';
import type { BessProductSpec } from './scenarios';

const mockProductSpec: BessProductSpec = {
  modulePowerKw: 50,
  moduleCapacityKwh: 100,
  efficiencyPercent: 90,
  socMinPercent: 10,
  socMaxPercent: 90,
};

describe('computeBackupRequirements', () => {
  it('returns null when backup is disabled or null', () => {
    expect(computeBackupRequirements(null)).toBeNull();
    expect(
      computeBackupRequirements({
        enabled: false,
        inputMode: 'simple',
        targetPowerKw: 50,
        autonomyHours: 4,
        loads: [],
        safetyMarginPercent: 10,
      })
    ).toBeNull();
  });

  it('computes requirements accurately in simple mode', () => {
    const config: CiBackupConfig = {
      enabled: true,
      inputMode: 'simple',
      targetPowerKw: 40,
      targetPeakPowerKw: 60,
      autonomyHours: 3,
      loads: [],
      safetyMarginPercent: 10,
    };
    const req = computeBackupRequirements(config);
    expect(req).not.toBeNull();
    // 40 kW + 10% = 44 kW
    expect(req!.requiredContinuousPowerKw).toBeCloseTo(44);
    // 60 kW + 10% = 66 kW
    expect(req!.requiredPeakPowerKw).toBeCloseTo(66);
    // 44 kW * 3h = 132 kWh
    expect(req!.requiredEnergyKwh).toBeCloseTo(132);
    expect(req!.autonomyHours).toBe(3);
  });

  it('computes requirements accurately in detailed mode from load list', () => {
    const config: CiBackupConfig = {
      enabled: true,
      inputMode: 'detailed',
      targetPowerKw: 0,
      autonomyHours: 5,
      safetyMarginPercent: 10,
      loads: [
        { id: '1', name: 'Servidores', powerW: 10000, quantity: 2, usageFactor: 1 }, // 20 kW
        { id: '2', name: 'Iluminação', powerW: 5000, quantity: 1, usageFactor: 0.8 }, // 4 kW
      ],
    };
    const req = computeBackupRequirements(config);
    expect(req).not.toBeNull();
    // base continuous: 24 kW * 1.1 = 26.4 kW
    expect(req!.requiredContinuousPowerKw).toBeCloseTo(26.4);
    // base peak: (20 + 5) * 1.1 = 27.5 kW
    expect(req!.requiredPeakPowerKw).toBeCloseTo(27.5);
    // 26.4 * 5h = 132 kWh
    expect(req!.requiredEnergyKwh).toBeCloseTo(132);
  });
});

describe('evaluateCandidateBackup', () => {
  it('returns disabled status when requirements are null', () => {
    const res = evaluateCandidateBackup(100, 200, mockProductSpec, null);
    expect(res.status).toBe('disabled');
    expect(res.meetsPower).toBe(true);
  });

  it('detects insufficient power when BESS cannot meet critical power', () => {
    const requirements = {
      requiredContinuousPowerKw: 120,
      requiredPeakPowerKw: 150,
      requiredEnergyKwh: 200,
      autonomyHours: 4,
    };
    // 2 modules of 50kW = 100kW (insufficient for 120kW)
    const res = evaluateCandidateBackup(100, 200, mockProductSpec, requirements);
    expect(res.status).toBe('insufficient_power');
    expect(res.meetsPower).toBe(false);
    expect(res.warningMessage).toContain('Potência do BESS (100.0 kW) insuficiente');
  });

  it('detects partial coverage when power is met but autonomy is lower than required', () => {
    const requirements = {
      requiredContinuousPowerKw: 40,
      requiredPeakPowerKw: 50,
      requiredEnergyKwh: 160,
      autonomyHours: 4,
    };
    // 1 module of 50kW / 100kWh.
    // Useful deliverable energy: 100kWh * (0.9 - 0.1) * 0.9 = 72 kWh
    // 72 kWh < 160 kWh -> partially covered
    const res = evaluateCandidateBackup(50, 100, mockProductSpec, requirements);
    expect(res.status).toBe('partially_covered');
    expect(res.meetsPower).toBe(true);
    expect(res.meetsEnergy).toBe(false);
    expect(res.effectiveAutonomyHours).toBeCloseTo(72 / 40); // 1.8h
    expect(res.minModulesForBackup).toBe(Math.ceil(160 / 72)); // 3 modules
  });

  it('marks as fully covered when power and energy requirements are met', () => {
    const requirements = {
      requiredContinuousPowerKw: 40,
      requiredPeakPowerKw: 50,
      requiredEnergyKwh: 140,
      autonomyHours: 3.5,
    };
    // 3 modules = 150kW / 300kWh
    // Useful deliverable: 300 * 0.8 * 0.9 = 216 kWh > 140 kWh
    const res = evaluateCandidateBackup(150, 300, mockProductSpec, requirements);
    expect(res.status).toBe('fully_covered');
    expect(res.meetsPower).toBe(true);
    expect(res.meetsEnergy).toBe(true);
    expect(res.effectiveAutonomyHours).toBeGreaterThanOrEqual(3.5);
    expect(res.recommendedSocReservePercent).toBeGreaterThan(mockProductSpec.socMinPercent);
    expect(res.warningMessage).toBeUndefined();
  });
});
