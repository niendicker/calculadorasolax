import { describe, expect, it } from 'vitest';
import type { DesiredFeatureId, GeneratorConfig, MicrogridConfig, PvConfig, WhiteTariffConfig } from '@/lib/types';
import type { InverterCatalogOption } from '../../types';
import { desiredFeatureHasPendingIssue } from './feature-status';

const inverter: InverterCatalogOption = {
  id: 'i1',
  model: 'X1-Hybrid-5.0kW-G4',
  topology: 'HV',
  phases: 1,
  standardPowerKva: 5,
  peakPowerKva: 7,
  maxPowerPerPhaseW: null,
  imageUrl: null,
  documents: [],
  flags: ['external_ats', 'microgrid', 'external_generator'],
};

const inverterNoFlags: InverterCatalogOption = { ...inverter, id: 'i2', model: 'NoFlags', flags: [] };

const baseArgs = {
  microgrid: null as MicrogridConfig | null,
  generator: null as GeneratorConfig | null,
  pv: null as PvConfig | null,
  whiteTariff: null as WhiteTariffConfig | null,
  atsBackupAcknowledged: false,
  gridType: null,
  peakW: 0,
  loadsCount: 0,
  inverterCatalog: [inverter],
  availableInverterModels: null as Set<string> | null,
  selectedInverterModel: null as string | null,
};

function call(id: DesiredFeatureId, value: DesiredFeatureId[], overrides: Partial<typeof baseArgs> = {}) {
  return desiredFeatureHasPendingIssue(id, value, { ...baseArgs, ...overrides });
}

describe('desiredFeatureHasPendingIssue', () => {
  it('returns false when the feature is not selected', () => {
    expect(call('backup', [])).toBe(false);
  });

  it('returns true for backup when there are no loads', () => {
    expect(call('backup', ['backup'], { loadsCount: 0 })).toBe(true);
    expect(call('backup', ['backup'], { loadsCount: 2 })).toBe(false);
  });

  it('returns true for external_ats when unacknowledged, and honors required flag narrowing', () => {
    expect(call('external_ats', ['external_ats'], { atsBackupAcknowledged: true })).toBe(false);
    expect(call('external_ats', ['external_ats'], { atsBackupAcknowledged: false })).toBe(true);
  });

  it('flags a required-flag feature when the narrowed catalog (by selectedInverterModel) has none supporting it', () => {
    expect(
      call('external_ats', ['external_ats'], {
        atsBackupAcknowledged: true,
        inverterCatalog: [inverterNoFlags],
        selectedInverterModel: 'NoFlags',
      })
    ).toBe(true);
  });

  it('flags a required-flag feature when narrowed by availableInverterModels has none supporting it', () => {
    expect(
      call('microgrid', ['microgrid'], {
        microgrid: { voltageV: 220, onGridPhases: 1, onGridApparentPowerVA: 1000, isFundamentalRequirement: true, photoUrl: null, powerNoticeAcknowledged: true },
        inverterCatalog: [inverterNoFlags],
        availableInverterModels: new Set(['NoFlags']),
      })
    ).toBe(true);
  });

  it('does not flag on required-flag narrowing when availableInverterModels is null (unconstrained)', () => {
    expect(
      call('microgrid', ['microgrid'], {
        microgrid: { voltageV: 220, onGridPhases: 1, onGridApparentPowerVA: 1000, isFundamentalRequirement: true, photoUrl: null, powerNoticeAcknowledged: true },
        inverterCatalog: [inverter],
        availableInverterModels: null,
      })
    ).toBe(false);
  });

  it('flags microgrid when power is zero', () => {
    expect(
      call('microgrid', ['microgrid'], {
        microgrid: { voltageV: 220, onGridPhases: 1, onGridApparentPowerVA: 0, isFundamentalRequirement: true, photoUrl: null, powerNoticeAcknowledged: true },
      })
    ).toBe(true);
  });

  it('flags microgrid when phase/voltage incompatible with grid type', () => {
    expect(
      call('microgrid', ['microgrid'], {
        microgrid: { voltageV: 380, onGridPhases: 3, onGridApparentPowerVA: 1000, isFundamentalRequirement: true, photoUrl: null, powerNoticeAcknowledged: true },
        gridType: 'singlePhase_220',
      })
    ).toBe(true);
  });

  it('does not flag microgrid when power set and compatible', () => {
    expect(
      call('microgrid', ['microgrid'], {
        microgrid: { voltageV: 220, onGridPhases: 1, onGridApparentPowerVA: 1000, isFundamentalRequirement: true, photoUrl: null, powerNoticeAcknowledged: true },
        gridType: 'singlePhase_220',
      })
    ).toBe(false);
  });

  it('flags external_generator on insufficient power, unacknowledged ATS, or phase/voltage mismatch', () => {
    const generator: GeneratorConfig = {
      voltageV: 220,
      phases: 1,
      apparentPowerVA: 100,
      powerFactor: 0.8,
      safetyMarginPercent: 20,
      photoUrl: null,
      ownAtsAcknowledged: true,
    };
    expect(call('external_generator', ['external_generator'], { generator, peakW: 5000 })).toBe(true);

    const sufficientGenerator: GeneratorConfig = { ...generator, apparentPowerVA: 100000 };
    expect(call('external_generator', ['external_generator'], { generator: sufficientGenerator, peakW: 100 })).toBe(false);

    const unacknowledged: GeneratorConfig = { ...sufficientGenerator, ownAtsAcknowledged: false };
    expect(call('external_generator', ['external_generator'], { generator: unacknowledged, peakW: 100 })).toBe(true);
  });

  it('flags pv when config incomplete, white_tariff when config incomplete', () => {
    expect(call('pv', ['pv'], { pv: null })).toBe(true);
    expect(call('pv', ['pv'], { pv: { monthlyConsumptionKwh: 100, hsp: 4 } })).toBe(false);

    expect(call('white_tariff', ['white_tariff'], { whiteTariff: null })).toBe(true);
  });

  it('returns false for unknown ids via default branch', () => {
    expect(call('unknown' as DesiredFeatureId, ['unknown' as DesiredFeatureId])).toBe(false);
  });
});
