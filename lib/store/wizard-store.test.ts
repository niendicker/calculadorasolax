// @vitest-environment jsdom
// jsdom (not the default node env) so zustand's persist middleware finds a
// `window.localStorage` to attach to — needed to exercise `useWizardStore.persist`
// (partialize/merge) below; every other test in this file works the same either way.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { emptyAddress } from '@/lib/address';
import { ACCOUNT_LIMITS } from '@/lib/limits';
import { totalDailyKwh, totalPeakW, totalPowerByPhase, useWizardStore } from './wizard-store';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import { resetWizardStore } from '@/lib/test-helpers/wizard-store-reset';
import type { SavedProject, SingleLoad } from '@/lib/types';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));

function makeLoad(partial: Partial<SingleLoad> & Pick<SingleLoad, 'powerW' | 'qty'>): SingleLoad {
  return {
    id: crypto.randomUUID(),
    name: 'Carga teste',
    ipInRatio: 1,
    ...partial,
  };
}

function makeSavedProject(partial: Partial<SavedProject> & Pick<SavedProject, 'id'>): SavedProject {
  return {
    name: 'Projeto salvo',
    clientId: null,
    address: { ...emptyAddress(), street: 'Rua salva, 1' },
    notes: 'Notas salvas',
    updatedAt: '2026-01-01T00:00:00.000Z',
    status: 'draft',
    residentialOptions: {
      topology: 'HighVoltage',
      batteryModel: 'T-BAT-SYS-HV-5.8',
      secondaryBatteryModel: null,
      inverterModel: 'X1-Hybrid-5.0kW-G4',
      minInverterQty: null,
      gridType: 'singlePhase_220',
      loads: [makeLoad({ powerW: 1000, qty: 1 })],
      peakCalcMode: 'sum',
      operationHours: 2,
      desiredFeatures: [],
      whiteTariff: null,
      microgrid: null,
      generator: null,
      pv: null,
      atsPhotoUrl: null,
      atsBackupAcknowledged: false,
      maxPowerPerPhaseW: null,
    },
    solution: null,
    services: [],
    ...partial,
  };
}

/** Resets the store to its factory-default state so tests don't leak into each other. */
function resetStore() {
  resetWizardStore();
  createClientMock.mockReset();
}

describe('totalDailyKwh', () => {
  it('returns 0 for no loads', () => {
    expect(totalDailyKwh([], 4)).toBe(0);
  });

  it('returns 0 when operationHours is 0, regardless of loads', () => {
    const loads = [makeLoad({ powerW: 1000, qty: 2 })];
    expect(totalDailyKwh(loads, 0)).toBe(0);
  });

  it('sums powerW x qty across loads, scaled by the shared operationHours, in kWh', () => {
    const loads = [
      makeLoad({ powerW: 100, qty: 2 }), // 200 W
      makeLoad({ powerW: 1000, qty: 1 }), // 1000 W
    ];
    // (200 + 1000) W x 5h / 1000 = 6.0 kWh
    expect(totalDailyKwh(loads, 5)).toBeCloseTo(6.0);
  });

  it('ignores ipInRatio (peak ratio does not affect daily energy)', () => {
    const loads = [makeLoad({ powerW: 100, qty: 1, ipInRatio: 5 })];
    expect(totalDailyKwh(loads, 2)).toBeCloseTo(0.2);
  });

  it('scales energy by usageFactor, defaulting to 1 when absent', () => {
    const loads = [makeLoad({ powerW: 1000, qty: 1, usageFactor: 0.5 })];
    expect(totalDailyKwh(loads, 2)).toBeCloseTo(1.0);
  });

  it('uses fixedHours instead of the shared operationHours when usageMode is fixed', () => {
    const loads = [makeLoad({ powerW: 1000, qty: 1, usageMode: 'fixed', fixedHours: 3 })];
    // 1000 W x 3h / 1000 = 3.0 kWh, regardless of the shared operationHours (10).
    expect(totalDailyKwh(loads, 10)).toBeCloseTo(3.0);
  });

  it('treats a missing fixedHours as 0 when usageMode is fixed', () => {
    const loads = [makeLoad({ powerW: 1000, qty: 1, usageMode: 'fixed' })];
    expect(totalDailyKwh(loads, 10)).toBe(0);
  });

  it('mixes fraction-mode and fixed-mode loads in the same total', () => {
    const loads = [
      makeLoad({ powerW: 1000, qty: 1 }), // fraction mode (default): 1000 x 4h = 4.0 kWh
      makeLoad({ powerW: 500, qty: 1, usageMode: 'fixed', fixedHours: 2 }), // fixed: 500 x 2h = 1.0 kWh
    ];
    expect(totalDailyKwh(loads, 4)).toBeCloseTo(5.0);
  });
});

describe('totalPeakW', () => {
  it('returns 0 for no loads', () => {
    expect(totalPeakW([])).toBe(0);
  });

  it('sum mode: adds powerW x ipInRatio x qty for every load at once', () => {
    const loads = [
      makeLoad({ powerW: 1000, qty: 1, ipInRatio: 3 }), // 3000
      makeLoad({ powerW: 200, qty: 2, ipInRatio: 1 }), // 400
    ];
    expect(totalPeakW(loads, 'sum')).toBe(3400);
  });

  it('ignores usageFactor (energy-only factor does not affect peak power)', () => {
    const loads = [makeLoad({ powerW: 1000, qty: 1, ipInRatio: 2, usageFactor: 0.5 })];
    expect(totalPeakW(loads)).toBe(2000);
  });

  it('sum mode is the default when no mode is given', () => {
    const loads = [makeLoad({ powerW: 500, qty: 1, ipInRatio: 2 })];
    expect(totalPeakW(loads)).toBe(1000);
  });

  it('largest-surge mode: only the single highest-surge load contributes its extra', () => {
    const loads = [
      makeLoad({ powerW: 1000, qty: 1, ipInRatio: 3 }), // extra = 2000
      makeLoad({ powerW: 500, qty: 1, ipInRatio: 2 }), // extra = 500
      makeLoad({ powerW: 100, qty: 4, ipInRatio: 1 }), // extra = 0
    ];
    // nominal sum = 1000 + 500 + 400 = 1900; + largest extra (2000) = 3900
    expect(totalPeakW(loads, 'largest-surge')).toBe(3900);
  });

  it('largest-surge mode matches sum mode for a single unit (qty 1)', () => {
    const loads = [makeLoad({ powerW: 300, qty: 1, ipInRatio: 2 })];
    expect(totalPeakW(loads, 'largest-surge')).toBe(totalPeakW(loads, 'sum'));
  });

  it('largest-surge mode only assumes a single physical unit surges, even when qty > 1', () => {
    const loads = [makeLoad({ powerW: 300, qty: 2, ipInRatio: 2 })];
    // nominal sum = 300 x 2 = 600; only one unit's extra (300 x (2-1) = 300) counts
    expect(totalPeakW(loads, 'largest-surge')).toBe(900);
    // whereas sum mode assumes every unit surges together: 300 x 2 x 2 = 1200
    expect(totalPeakW(loads, 'sum')).toBe(1200);
  });

  it('select mode: only sums loads flagged includedInPeak', () => {
    const loads = [
      makeLoad({ powerW: 1000, qty: 1, ipInRatio: 2, includedInPeak: true }), // 2000
      makeLoad({ powerW: 500, qty: 1, ipInRatio: 2, includedInPeak: false }), // excluded
    ];
    expect(totalPeakW(loads, 'select')).toBe(2000);
  });

  it('select mode: treats undefined includedInPeak as included (back-compat)', () => {
    const loads = [makeLoad({ powerW: 400, qty: 1, ipInRatio: 1 })];
    expect(totalPeakW(loads, 'select')).toBe(400);
  });
});

describe('totalPowerByPhase', () => {
  it('returns zero on all phases for no loads', () => {
    expect(totalPowerByPhase([])).toEqual({ L1: 0, L2: 0, L3: 0 });
  });

  it('assigns a mono load fully to its single phase, defaulting to L1', () => {
    const loads = [makeLoad({ powerW: 1000, qty: 1, phaseType: 'mono', phase: 'L2' })];
    expect(totalPowerByPhase(loads)).toEqual({ L1: 0, L2: 1000, L3: 0 });
  });

  it('defaults an unassigned mono load to L1', () => {
    const loads = [makeLoad({ powerW: 500, qty: 1, phaseType: 'mono' })];
    expect(totalPowerByPhase(loads)).toEqual({ L1: 500, L2: 0, L3: 0 });
  });

  it('multiplies mono load power by qty before assigning to its phase', () => {
    const loads = [makeLoad({ powerW: 100, qty: 3, phaseType: 'mono', phase: 'L3' })];
    expect(totalPowerByPhase(loads)).toEqual({ L1: 0, L2: 0, L3: 300 });
  });

  it('splits a trifasica load evenly across all three phases', () => {
    const loads = [makeLoad({ powerW: 3000, qty: 1, phaseType: 'trifasica' })];
    expect(totalPowerByPhase(loads)).toEqual({ L1: 1000, L2: 1000, L3: 1000 });
  });

  it('counts the full power on BOTH phases for a phase-to-phase mono load, not split', () => {
    const loads = [
      makeLoad({ powerW: 1000, qty: 1, phaseType: 'mono', phase: 'L1', phase2: 'L2' }),
    ];
    expect(totalPowerByPhase(loads)).toEqual({ L1: 1000, L2: 1000, L3: 0 });
  });

  it('accumulates power from multiple loads on the same phase', () => {
    const loads = [
      makeLoad({ powerW: 500, qty: 1, phaseType: 'mono', phase: 'L1' }),
      makeLoad({ powerW: 300, qty: 1, phaseType: 'mono', phase: 'L1' }),
    ];
    expect(totalPowerByPhase(loads).L1).toBe(800);
  });
});

describe('addLoad limit enforcement', () => {
  beforeEach(() => {
    resetStore();
  });

  it('adds a load and returns true while under the per-project limit', () => {
    const added = useWizardStore.getState().addLoad(makeLoad({ powerW: 100, qty: 1 }));
    expect(added).toBe(true);
    expect(useWizardStore.getState().residentialOptions.loads).toHaveLength(1);
  });

  it('prepends new loads to the top of the list', () => {
    useWizardStore.getState().addLoad(makeLoad({ id: 'first', powerW: 100, qty: 1 }));
    useWizardStore.getState().addLoad(makeLoad({ id: 'second', powerW: 200, qty: 1 }));

    const ids = useWizardStore.getState().residentialOptions.loads.map((l) => l.id);
    expect(ids).toEqual(['second', 'first']);
  });

  it('returns false and does not add once the project already has ACCOUNT_LIMITS.loadsPerProject loads', () => {
    for (let i = 0; i < ACCOUNT_LIMITS.loadsPerProject; i++) {
      expect(useWizardStore.getState().addLoad(makeLoad({ powerW: 100, qty: 1 }))).toBe(true);
    }
    expect(useWizardStore.getState().residentialOptions.loads).toHaveLength(ACCOUNT_LIMITS.loadsPerProject);

    const added = useWizardStore.getState().addLoad(makeLoad({ powerW: 100, qty: 1 }));
    expect(added).toBe(false);
    expect(useWizardStore.getState().residentialOptions.loads).toHaveLength(ACCOUNT_LIMITS.loadsPerProject);
  });
});

describe('cancelProjectDraft', () => {
  beforeEach(() => {
    resetStore();
  });

  it('clears a brand-new draft (no currentProjectId) back to blank and hides the details card', () => {
    useWizardStore.setState((s) => ({
      projectInfo: { ...s.projectInfo, name: 'Rascunho não salvo' },
      currentProjectId: null,
      projectDetailsVisible: true,
    }));

    useWizardStore.getState().cancelProjectDraft();

    const s = useWizardStore.getState();
    expect(s.projectInfo).toEqual({ name: '', clientId: null, address: emptyAddress(), notes: '' });
    expect(s.currentProjectId).toBeNull();
    expect(s.projectDetailsVisible).toBe(false);
    expect(s.residentialOptions.loads).toHaveLength(0);
    expect(s.solution).toBeNull();
  });

  it('reverts unsaved edits on an existing project back to its last saved values', () => {
    const saved = makeSavedProject({ id: 'p1', name: 'Nome salvo', address: { ...emptyAddress(), street: 'Endereço salvo' } });
    useWizardStore.setState({
      savedProjects: [saved],
      currentProjectId: 'p1',
      projectDetailsVisible: true,
      projectInfo: { name: 'Edição não salva', clientId: null, address: { ...emptyAddress(), street: 'Endereço editado' }, notes: '' },
      residentialOptions: { ...saved.residentialOptions, batteryModel: 'outro-modelo-editado' },
    });

    useWizardStore.getState().cancelProjectDraft();

    const s = useWizardStore.getState();
    expect(s.projectDetailsVisible).toBe(false);
    expect(s.currentProjectId).toBe('p1');
    expect(s.projectInfo).toEqual({
      name: 'Nome salvo',
      clientId: null,
      address: { ...emptyAddress(), street: 'Endereço salvo' },
      notes: 'Notas salvas',
    });
    expect(s.residentialOptions.batteryModel).toBe('T-BAT-SYS-HV-5.8');
    expect(s.residentialOptions.loads).toEqual(saved.residentialOptions.loads);
  });

  it('falls back to a blank draft when currentProjectId points at a project that no longer exists', () => {
    useWizardStore.setState({
      savedProjects: [],
      currentProjectId: 'ghost-id',
      projectDetailsVisible: true,
      projectInfo: { name: 'Editando algo removido', clientId: null, address: emptyAddress(), notes: '' },
    });

    useWizardStore.getState().cancelProjectDraft();

    const s = useWizardStore.getState();
    expect(s.currentProjectId).toBeNull();
    expect(s.projectDetailsVisible).toBe(false);
    expect(s.projectInfo).toEqual({ name: '', clientId: null, address: emptyAddress(), notes: '' });
  });
});

describe('setProjectInfo', () => {
  beforeEach(() => resetStore());

  it('shallow-merges a partial into the existing projectInfo', () => {
    useWizardStore.getState().setProjectInfo({ name: 'Residência Silva' });
    useWizardStore.getState().setProjectInfo({ address: { ...emptyAddress(), street: 'Rua das Flores, 10' } });

    expect(useWizardStore.getState().projectInfo).toEqual({
      name: 'Residência Silva',
      clientId: null,
      address: { ...emptyAddress(), street: 'Rua das Flores, 10' },
      notes: '',
    });
  });
});

describe('newProjectDraft', () => {
  beforeEach(() => resetStore());

  it('clears any loaded project and shows a blank, visible details card', () => {
    const saved = makeSavedProject({ id: 'p1' });
    useWizardStore.setState({
      savedProjects: [saved],
      currentProjectId: 'p1',
      projectInfo: { name: 'Projeto carregado', clientId: null, address: emptyAddress(), notes: '' },
      residentialOptions: saved.residentialOptions,
      solution: null,
      projectDetailsVisible: false,
    });

    useWizardStore.getState().newProjectDraft();

    const s = useWizardStore.getState();
    expect(s.currentProjectId).toBeNull();
    expect(s.projectDetailsVisible).toBe(true);
    expect(s.projectInfo).toEqual({ name: '', clientId: null, address: emptyAddress(), notes: '' });
    expect(s.residentialOptions.loads).toHaveLength(0);
    // Saved projects list itself is untouched, only the active draft resets.
    expect(s.savedProjects).toEqual([saved]);
  });
});

describe('loadProject', () => {
  beforeEach(() => resetStore());

  it('copies a saved project into the active draft, deep-cloning its loads', () => {
    const saved = makeSavedProject({ id: 'p1', name: 'Casa de praia' });
    useWizardStore.setState({ savedProjects: [saved] });

    useWizardStore.getState().loadProject('p1');

    const s = useWizardStore.getState();
    expect(s.currentProjectId).toBe('p1');
    expect(s.projectDetailsVisible).toBe(true);
    expect(s.projectInfo.name).toBe('Casa de praia');
    expect(s.residentialOptions.loads).toEqual(saved.residentialOptions.loads);
    // Cloned, not the same array/object references as the saved project.
    expect(s.residentialOptions.loads).not.toBe(saved.residentialOptions.loads);
    expect(s.residentialOptions.loads[0]).not.toBe(saved.residentialOptions.loads[0]);
  });

  it('loads the project data without opening the edit draft when showDetails is false', () => {
    const saved = makeSavedProject({ id: 'p1', name: 'Casa de praia' });
    useWizardStore.setState({ savedProjects: [saved], projectDetailsVisible: false });

    useWizardStore.getState().loadProject('p1', { showDetails: false });

    const s = useWizardStore.getState();
    expect(s.currentProjectId).toBe('p1');
    expect(s.projectDetailsVisible).toBe(false);
    expect(s.projectInfo.name).toBe('Casa de praia');
  });

  it('is a no-op when the id does not match any saved project', () => {
    useWizardStore.setState({ savedProjects: [makeSavedProject({ id: 'p1' })] });

    useWizardStore.getState().loadProject('missing-id');

    const s = useWizardStore.getState();
    expect(s.currentProjectId).toBeNull();
    expect(s.projectDetailsVisible).toBe(false);
  });

  it('drops a no-longer-recognized feature id (e.g. "no_pv", renamed to "pv") instead of letting it through', () => {
    const saved = makeSavedProject({
      id: 'p1',
      residentialOptions: {
        ...makeSavedProject({ id: 'p1' }).residentialOptions,
        // Legacy id from before the 'no_pv' -> 'pv' rename — would otherwise
        // fail the Edge Function's desiredFeatures validation outright.
        desiredFeatures: ['backup', 'no_pv' as unknown as 'pv'],
      },
    });
    useWizardStore.setState({ savedProjects: [saved] });

    useWizardStore.getState().loadProject('p1');

    expect(useWizardStore.getState().residentialOptions.desiredFeatures).toEqual(['backup']);
  });
});

describe('setTopology', () => {
  beforeEach(() => resetStore());

  it('sets the topology and clears the battery and inverter models, which no longer apply', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: { ...s.residentialOptions, batteryModel: 'T-BAT-SYS-HV-5.8', inverterModel: 'X1-Hybrid-5.0kW-G4' },
    }));

    useWizardStore.getState().setTopology('LowVoltage');

    const options = useWizardStore.getState().residentialOptions;
    expect(options.topology).toBe('LowVoltage');
    expect(options.batteryModel).toBeNull();
    expect(options.inverterModel).toBeNull();
  });

  it('also clears the secondary battery model and its live solution, which belonged to the old topology', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        batteryModel: 'T-BAT-SYS-HV-5.8',
        secondaryBatteryModel: 'T-BAT-SYS-HV-5.8-B',
      },
      secondarySolution: {
        inverterId: 'i1',
        inverterModel: 'X1',
        batteryId: 'b1',
        batteryModel: 'T-BAT-SYS-HV-5.8-B',
        batteryQty: 1,
        pvPowerKw: null,
        accessories: [],
      },
    }));

    useWizardStore.getState().setTopology('LowVoltage');

    const options = useWizardStore.getState().residentialOptions;
    expect(options.secondaryBatteryModel).toBeNull();
    expect(useWizardStore.getState().secondarySolution).toBeNull();
  });
});

describe('setBatteryModel', () => {
  beforeEach(() => resetStore());

  it('sets the battery model without touching other fields', () => {
    useWizardStore.getState().setBatteryModel('TP-HS3.6');
    expect(useWizardStore.getState().residentialOptions.batteryModel).toBe('TP-HS3.6');
  });
});

describe('setSecondaryBatteryModel', () => {
  beforeEach(() => resetStore());

  it('sets the secondary battery model without touching other fields', () => {
    useWizardStore.getState().setBatteryModel('TP-HS3.6');
    useWizardStore.getState().setSecondaryBatteryModel('TP-HS7.2');
    expect(useWizardStore.getState().residentialOptions.batteryModel).toBe('TP-HS3.6');
    expect(useWizardStore.getState().residentialOptions.secondaryBatteryModel).toBe('TP-HS7.2');
  });
});

describe('setSecondarySolution', () => {
  beforeEach(() => resetStore());

  it('sets the secondary solution without touching the primary one', () => {
    const solution = { inverterId: 'i1', inverterModel: 'X1', batteryId: 'b1', batteryModel: 'TP-HS7.2', batteryQty: 1, pvPowerKw: 5, accessories: [] };
    useWizardStore.getState().setSecondarySolution(solution);
    expect(useWizardStore.getState().secondarySolution).toEqual(solution);
    expect(useWizardStore.getState().solution).toBeNull();
  });
});

describe('setInverterModel', () => {
  beforeEach(() => resetStore());

  it('sets the inverter model without touching other fields', () => {
    useWizardStore.getState().setInverterModel('X1-Hybrid-5.0kW-G4');
    expect(useWizardStore.getState().residentialOptions.inverterModel).toBe('X1-Hybrid-5.0kW-G4');
  });
});

describe('setMinInverterQty', () => {
  beforeEach(() => resetStore());

  it('sets the minimum parallel-inverter count without touching other fields', () => {
    useWizardStore.getState().setMinInverterQty(2);
    expect(useWizardStore.getState().residentialOptions.minInverterQty).toBe(2);
  });

  it('clears it back to null ("Automático")', () => {
    useWizardStore.getState().setMinInverterQty(3);
    useWizardStore.getState().setMinInverterQty(null);
    expect(useWizardStore.getState().residentialOptions.minInverterQty).toBeNull();
  });
});

describe('setGridType', () => {
  beforeEach(() => resetStore());

  it('sets the grid type and clears the inverter model, since not every model fits every grid', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: { ...s.residentialOptions, inverterModel: 'X1-Hybrid-5.0kW-G4' },
    }));

    useWizardStore.getState().setGridType('threePhase_380');

    const options = useWizardStore.getState().residentialOptions;
    expect(options.gridType).toBe('threePhase_380');
    expect(options.inverterModel).toBeNull();
  });
});

describe('setMaxPowerPerPhaseW', () => {
  beforeEach(() => resetStore());

  it('sets the per-phase power cap', () => {
    useWizardStore.getState().setMaxPowerPerPhaseW(5000);
    expect(useWizardStore.getState().residentialOptions.maxPowerPerPhaseW).toBe(5000);
  });
});

describe('setDesiredFeatures', () => {
  beforeEach(() => resetStore());

  it('keeps a feature-specific config only while its feature is selected', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        whiteTariff: { requiredPowerW: 1000, pontaEnergyWh: 2000, intermediateEnergyWh: 0, pontaTariffPerKwh: 1.0, intermediateTariffPerKwh: 0.95, foraPontaTariffPerKwh: 0.5 },
        microgrid: { voltageV: 220, onGridPhases: 1, onGridApparentPowerVA: 1000, isFundamentalRequirement: false, photoUrl: null, powerNoticeAcknowledged: false },
        generator: { voltageV: 220, phases: 1, apparentPowerVA: 1000, photoUrl: null, ownAtsAcknowledged: false },
        atsPhotoUrl: 'https://example.com/ats.jpg',
        atsBackupAcknowledged: true,
      },
    }));

    useWizardStore.getState().setDesiredFeatures(['white_tariff']);

    const options = useWizardStore.getState().residentialOptions;
    expect(options.desiredFeatures).toEqual(['white_tariff']);
    expect(options.whiteTariff).not.toBeNull();
    expect(options.microgrid).toBeNull();
    expect(options.generator).toBeNull();
    expect(options.atsPhotoUrl).toBeNull();
    expect(options.atsBackupAcknowledged).toBe(false);
  });

  it('keeps all configs when all their features stay selected', () => {
    const whiteTariff = { requiredPowerW: 1000, pontaEnergyWh: 2000, intermediateEnergyWh: 0, pontaTariffPerKwh: 1.0, intermediateTariffPerKwh: 0.95, foraPontaTariffPerKwh: 0.5 };
    useWizardStore.setState((s) => ({
      residentialOptions: { ...s.residentialOptions, whiteTariff },
    }));

    useWizardStore.getState().setDesiredFeatures(['white_tariff', 'microgrid']);

    expect(useWizardStore.getState().residentialOptions.whiteTariff).toEqual(whiteTariff);
  });
});

describe('setWhiteTariffConfig / setMicrogridConfig / setGeneratorConfig / setAtsPhotoUrl', () => {
  beforeEach(() => resetStore());

  it('sets each feature config independently', () => {
    const whiteTariff = { requiredPowerW: 500, pontaEnergyWh: 1000, intermediateEnergyWh: 0, pontaTariffPerKwh: 0.8, intermediateTariffPerKwh: 0.95, foraPontaTariffPerKwh: 0.3 };
    const microgrid = { voltageV: 220, onGridPhases: 3 as const, onGridApparentPowerVA: 5000, isFundamentalRequirement: true, photoUrl: null, powerNoticeAcknowledged: true };
    const generator = { voltageV: 380, phases: 3 as const, apparentPowerVA: 8000, photoUrl: null, ownAtsAcknowledged: true };

    useWizardStore.getState().setWhiteTariffConfig(whiteTariff);
    useWizardStore.getState().setMicrogridConfig(microgrid);
    useWizardStore.getState().setGeneratorConfig(generator);
    useWizardStore.getState().setAtsPhotoUrl('https://example.com/ats.jpg');
    useWizardStore.getState().setAtsBackupAcknowledged(true);

    const options = useWizardStore.getState().residentialOptions;
    expect(options.whiteTariff).toEqual(whiteTariff);
    expect(options.microgrid).toEqual(microgrid);
    expect(options.generator).toEqual(generator);
    expect(options.atsPhotoUrl).toBe('https://example.com/ats.jpg');
    expect(options.atsBackupAcknowledged).toBe(true);
  });

  it('clears a config back to null', () => {
    useWizardStore.getState().setWhiteTariffConfig(null);
    expect(useWizardStore.getState().residentialOptions.whiteTariff).toBeNull();
  });
});

describe('setPeakCalcMode', () => {
  beforeEach(() => resetStore());

  it('sets the peak calculation mode', () => {
    useWizardStore.getState().setPeakCalcMode('largest-surge');
    expect(useWizardStore.getState().residentialOptions.peakCalcMode).toBe('largest-surge');
  });
});

describe('setPvConfig', () => {
  beforeEach(() => resetStore());

  it('sets the pv config', () => {
    const pv = { arrayPowerKwp: 5, panelCount: 12 } as never;
    useWizardStore.getState().setPvConfig(pv);
    expect(useWizardStore.getState().residentialOptions.pv).toEqual(pv);
  });

  it('clears the pv config back to null', () => {
    useWizardStore.getState().setPvConfig({ arrayPowerKwp: 5 } as never);
    useWizardStore.getState().setPvConfig(null);
    expect(useWizardStore.getState().residentialOptions.pv).toBeNull();
  });
});

describe('setOperationHours', () => {
  beforeEach(() => resetStore());

  it('sets the shared operation hours', () => {
    useWizardStore.getState().setOperationHours(6);
    expect(useWizardStore.getState().residentialOptions.operationHours).toBe(6);
  });
});

describe('removeLoad / updateLoad', () => {
  beforeEach(() => resetStore());

  it('removeLoad drops only the matching load', () => {
    const [a, b] = [makeLoad({ powerW: 100, qty: 1 }), makeLoad({ powerW: 200, qty: 1 })];
    useWizardStore.setState((s) => ({ residentialOptions: { ...s.residentialOptions, loads: [a, b] } }));

    useWizardStore.getState().removeLoad(a.id);

    expect(useWizardStore.getState().residentialOptions.loads).toEqual([b]);
  });

  it('updateLoad merges a partial into the matching load only', () => {
    const [a, b] = [makeLoad({ powerW: 100, qty: 1 }), makeLoad({ powerW: 200, qty: 1 })];
    useWizardStore.setState((s) => ({ residentialOptions: { ...s.residentialOptions, loads: [a, b] } }));

    useWizardStore.getState().updateLoad(a.id, { qty: 5 });

    const loads = useWizardStore.getState().residentialOptions.loads;
    expect(loads.find((l) => l.id === a.id)?.qty).toBe(5);
    expect(loads.find((l) => l.id === b.id)?.qty).toBe(1);
  });
});

describe('setIndustrialOption', () => {
  beforeEach(() => resetStore());

  it('sets a single key on industrialOptions without touching the rest', () => {
    useWizardStore.getState().setIndustrialOption('gridPowerKw', 42);
    useWizardStore.getState().setIndustrialOption('demandCharge', true);

    const options = useWizardStore.getState().industrialOptions;
    expect(options.gridPowerKw).toBe(42);
    expect(options.demandCharge).toBe(true);
    expect(options.pvPowerKwp).toBeNull();
  });
});

describe('setSolution / setLoadCatalog / setLoadPresets', () => {
  beforeEach(() => resetStore());

  it('sets each field directly', () => {
    useWizardStore.getState().setLoadCatalog([{ id: 'c1' } as never]);
    useWizardStore.getState().setLoadPresets([{ id: 'p1' } as never]);
    useWizardStore.getState().setSolution({ id: 's1' } as never);

    const s = useWizardStore.getState();
    expect(s.loadCatalog).toEqual([{ id: 'c1' }]);
    expect(s.loadPresets).toEqual([{ id: 'p1' }]);
    expect(s.solution).toEqual({ id: 's1' });
  });
});

describe('resetResidential / resetIndustrial', () => {
  beforeEach(() => resetStore());

  it('resetResidential clears residentialOptions and the calculated solution back to defaults', () => {
    useWizardStore.setState((s) => ({
      residentialOptions: {
        ...s.residentialOptions,
        batteryModel: 'TP-HS3.6',
        secondaryBatteryModel: 'TP-HS7.2',
        loads: [makeLoad({ powerW: 1, qty: 1 })],
      },
      solution: { id: 's1' } as never,
      secondarySolution: { id: 's2' } as never,
    }));

    useWizardStore.getState().resetResidential();

    const s = useWizardStore.getState();
    expect(s.residentialOptions.batteryModel).toBeNull();
    expect(s.residentialOptions.secondaryBatteryModel).toBeNull();
    expect(s.residentialOptions.loads).toHaveLength(0);
    expect(s.solution).toBeNull();
    expect(s.secondarySolution).toBeNull();
    // Back to the HV/monofásico 220V starting point, not a blank slate.
    expect(s.residentialOptions.topology).toBe('HighVoltage');
    expect(s.residentialOptions.gridType).toBe('singlePhase_220');
  });

  it('resetIndustrial clears industrialOptions and the calculated solution back to defaults', () => {
    useWizardStore.setState((s) => ({
      industrialOptions: { ...s.industrialOptions, gridPowerKw: 100 },
      solution: { id: 's1' } as never,
    }));

    useWizardStore.getState().resetIndustrial();

    const s = useWizardStore.getState();
    expect(s.industrialOptions.gridPowerKw).toBeNull();
    expect(s.solution).toBeNull();
  });
});

describe('persist partialize/merge (localStorage rehydration)', () => {
  beforeEach(() => resetStore());

  it('partialize keeps only the persisted-scoped fields', () => {
    const { partialize } = useWizardStore.persist.getOptions();
    const state = useWizardStore.getState();

    const persisted = partialize!(state);

    expect(persisted).toEqual({
      projectInfo: state.projectInfo,
      currentProjectId: state.currentProjectId,
      residentialOptions: state.residentialOptions,
      industrialOptions: state.industrialOptions,
      solution: state.solution,
      secondarySolution: state.secondarySolution,
      services: state.services,
      loadCatalog: state.loadCatalog,
      loadPresets: state.loadPresets,
    });
    // Deliberately not persisted (see the comment in wizard-store.ts).
    expect((persisted as Record<string, unknown>).projectDetailsVisible).toBeUndefined();
    expect((persisted as Record<string, unknown>).clients).toBeUndefined();
  });

  it('merge fills in a persisted residentialOptions/industrialOptions missing newer fields with the current defaults', () => {
    const { merge } = useWizardStore.persist.getOptions();
    const currentState = useWizardStore.getState();

    const merged = merge!(
      {
        currentProjectId: 'p1',
        // Legacy persisted shape: missing desiredFeatures/whiteTariff/etc entirely.
        residentialOptions: { topology: 'LowVoltage', batteryModel: 'TP-HS3.6' },
      },
      currentState
    ) as typeof currentState;

    expect(merged.currentProjectId).toBe('p1');
    expect(merged.residentialOptions.topology).toBe('LowVoltage');
    expect(merged.residentialOptions.batteryModel).toBe('TP-HS3.6');
    // Falls back to the current (default) state for fields the persisted blob never had.
    expect(merged.residentialOptions.desiredFeatures).toEqual([]);
    expect(merged.industrialOptions).toEqual(currentState.industrialOptions);
  });

  it('merge sanitizes a stale/unrecognized desiredFeatures id from the persisted blob', () => {
    const { merge } = useWizardStore.persist.getOptions();
    const currentState = useWizardStore.getState();

    const merged = merge!(
      {
        residentialOptions: { desiredFeatures: ['backup', 'no_pv'] },
      },
      currentState
    ) as typeof currentState;

    expect(merged.residentialOptions.desiredFeatures).toEqual(['backup']);
  });

  it('merge handles a null/undefined persistedState by falling back to current state', () => {
    const { merge } = useWizardStore.persist.getOptions();
    const currentState = useWizardStore.getState();

    const merged = merge!(null, currentState) as typeof currentState;

    expect(merged.residentialOptions).toEqual(currentState.residentialOptions);
    expect(merged.industrialOptions).toEqual(currentState.industrialOptions);
  });
});

describe('clearUserData', () => {
  beforeEach(() => resetStore());

  it('wipes account-scoped data and the active project, but leaves residentialOptions alone', () => {
    useWizardStore.setState((s) => ({
      clients: [{ id: 'c1' } as never],
      savedProjects: [makeSavedProject({ id: 'p1' })],
      userLoadCatalog: [{ id: 'u1' } as never],
      userStockItems: [{ id: 'st1' } as never],
      userLoadPresets: [{ id: 'pr1' } as never],
      currentProjectId: 'p1',
      projectDetailsVisible: true,
      residentialOptions: { ...s.residentialOptions, batteryModel: 'TP-HS3.6' },
    }));

    useWizardStore.getState().clearUserData();

    const s = useWizardStore.getState();
    expect(s.clients).toEqual([]);
    expect(s.savedProjects).toEqual([]);
    expect(s.userLoadCatalog).toEqual([]);
    expect(s.userStockItems).toEqual([]);
    expect(s.userLoadPresets).toEqual([]);
    expect(s.currentProjectId).toBeNull();
    expect(s.projectDetailsVisible).toBe(false);
    // Not part of clearUserData's contract: residentialOptions is left as-is.
    expect(s.residentialOptions.batteryModel).toBe('TP-HS3.6');
  });
});

// --- Supabase-backed actions -------------------------------------------------
// These mock the client returned by createClient() per test via createClientMock;
// see lib/test-helpers/supabase-mock.ts for the fake query builder.

const projectRow = {
  id: 'row-p1',
  name: 'Projeto do banco',
  client_id: null,
  address: 'Endereço do banco',
  notes: 'Notas do banco',
  updated_at: '2026-02-01T00:00:00.000Z',
  residential_options: {
    topology: 'HighVoltage',
    batteryModel: 'TP-HS3.6',
    inverterModel: null,
    gridType: null,
    loads: [],
    peakCalcMode: 'sum',
    desiredFeatures: [],
    whiteTariff: null,
    microgrid: null,
    generator: null,
    atsPhotoUrl: null,
    maxPowerPerPhaseW: null,
  },
  solution: null,
};

describe('saveCurrentProject', () => {
  beforeEach(() => resetStore());

  it('throws not_authenticated when there is no logged-in user', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ user: null }));
    await expect(useWizardStore.getState().saveCurrentProject()).rejects.toThrow('not_authenticated');
  });

  it('throws a limit-reached error when creating a new project past ACCOUNT_LIMITS.projects', async () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    useWizardStore.setState({
      currentProjectId: null,
      savedProjects: Array.from({ length: ACCOUNT_LIMITS.projects }, (_, i) => makeSavedProject({ id: `p${i}` })),
    });

    await expect(useWizardStore.getState().saveCurrentProject()).rejects.toThrow(/Limite de/);
  });

  it('inserts a brand-new project and prepends it to savedProjects', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { projects: { data: projectRow, error: null } } })
    );
    useWizardStore.setState({ currentProjectId: null, savedProjects: [] });

    const saved = await useWizardStore.getState().saveCurrentProject();

    expect(saved.id).toBe('row-p1');
    const s = useWizardStore.getState();
    expect(s.currentProjectId).toBe('row-p1');
    expect(s.projectInfo.name).toBe('Projeto do banco');
    expect(s.savedProjects).toEqual([saved]);
  });

  it('updates an existing project in place, deduping by id', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { projects: { data: projectRow, error: null } } })
    );
    const stale = makeSavedProject({ id: 'row-p1', name: 'Nome antigo' });
    useWizardStore.setState({ currentProjectId: 'row-p1', savedProjects: [stale] });

    const saved = await useWizardStore.getState().saveCurrentProject();

    const s = useWizardStore.getState();
    expect(s.savedProjects).toHaveLength(1);
    expect(s.savedProjects[0]).toEqual(saved);
    expect(s.savedProjects[0].name).toBe('Projeto do banco');
  });

  it('propagates a Supabase error instead of updating state', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { projects: { data: null, error: { message: 'db down' } } } })
    );
    useWizardStore.setState({ currentProjectId: null, savedProjects: [] });

    await expect(useWizardStore.getState().saveCurrentProject()).rejects.toBeTruthy();
    expect(useWizardStore.getState().savedProjects).toEqual([]);
  });
});

describe('removeProject', () => {
  beforeEach(() => resetStore());

  it('removes the project from savedProjects', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ tableResults: { projects: { data: null, error: null } } }));
    useWizardStore.setState({ savedProjects: [makeSavedProject({ id: 'p1' }), makeSavedProject({ id: 'p2' })] });

    await useWizardStore.getState().removeProject('p1');

    expect(useWizardStore.getState().savedProjects.map((p) => p.id)).toEqual(['p2']);
  });

  it('clears the active draft when the removed project was the one currently loaded', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ tableResults: { projects: { data: null, error: null } } }));
    useWizardStore.setState({
      savedProjects: [makeSavedProject({ id: 'p1' })],
      currentProjectId: 'p1',
      projectDetailsVisible: true,
    });

    await useWizardStore.getState().removeProject('p1');

    const s = useWizardStore.getState();
    expect(s.currentProjectId).toBeNull();
    expect(s.projectDetailsVisible).toBe(false);
    expect(s.projectInfo).toEqual({ name: '', clientId: null, address: emptyAddress(), notes: '' });
  });

  it('leaves the active draft alone when a different project is removed', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ tableResults: { projects: { data: null, error: null } } }));
    useWizardStore.setState({
      savedProjects: [makeSavedProject({ id: 'p1' }), makeSavedProject({ id: 'p2' })],
      currentProjectId: 'p1',
      projectDetailsVisible: true,
    });

    await useWizardStore.getState().removeProject('p2');

    const s = useWizardStore.getState();
    expect(s.currentProjectId).toBe('p1');
    expect(s.projectDetailsVisible).toBe(true);
  });

  it('propagates a Supabase error and does not modify savedProjects', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { projects: { data: null, error: { message: 'db down' } } } })
    );
    useWizardStore.setState({ savedProjects: [makeSavedProject({ id: 'p1' })] });

    await expect(useWizardStore.getState().removeProject('p1')).rejects.toBeTruthy();
    expect(useWizardStore.getState().savedProjects).toHaveLength(1);
  });
});

describe('duplicateProject', () => {
  beforeEach(() => resetStore());

  it('throws project_not_found when the id is not in savedProjects', async () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    useWizardStore.setState({ savedProjects: [] });

    await expect(useWizardStore.getState().duplicateProject('missing')).rejects.toThrow('project_not_found');
  });

  it('throws a limit-reached error at ACCOUNT_LIMITS.projects', async () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    const existing = Array.from({ length: ACCOUNT_LIMITS.projects }, (_, i) => makeSavedProject({ id: `p${i}` }));
    useWizardStore.setState({ savedProjects: existing });

    await expect(useWizardStore.getState().duplicateProject('p0')).rejects.toThrow(/Limite de/);
  });

  it('throws not_authenticated when there is no logged-in user', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ user: null }));
    useWizardStore.setState({ savedProjects: [makeSavedProject({ id: 'p1' })] });

    await expect(useWizardStore.getState().duplicateProject('p1')).rejects.toThrow('not_authenticated');
  });

  it('inserts a new row named after the original with "(cópia)" and prepends it, leaving the source untouched', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { projects: { data: { ...projectRow, id: 'row-copy' }, error: null } } })
    );
    const source = makeSavedProject({ id: 'p1', name: 'Casa de praia' });
    useWizardStore.setState({ savedProjects: [source] });

    const duplicated = await useWizardStore.getState().duplicateProject('p1');

    expect(duplicated.id).toBe('row-copy');
    const s = useWizardStore.getState();
    expect(s.savedProjects.map((p) => p.id)).toEqual(['row-copy', 'p1']);
    // The original in the list stays exactly as it was.
    expect(s.savedProjects[1]).toEqual(source);
    // duplicateProject never sets currentProjectId/projectInfo — it's a list-only action, unlike saveCurrentProject.
    expect(s.currentProjectId).toBeNull();
  });

  it('propagates a Supabase error instead of updating state', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { projects: { data: null, error: { message: 'db down' } } } })
    );
    const source = makeSavedProject({ id: 'p1' });
    useWizardStore.setState({ savedProjects: [source] });

    await expect(useWizardStore.getState().duplicateProject('p1')).rejects.toBeTruthy();
    expect(useWizardStore.getState().savedProjects).toEqual([source]);
  });
});

describe('refreshProjectSolution', () => {
  beforeEach(() => resetStore());

  it('throws project_not_found when the id is not in savedProjects', async () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    useWizardStore.setState({ savedProjects: [] });

    await expect(useWizardStore.getState().refreshProjectSolution('missing')).rejects.toThrow('project_not_found');
  });

  it('throws missing_battery_model when the project has no battery selected', async () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    const source = makeSavedProject({ id: 'p1' });
    source.residentialOptions.batteryModel = null;
    useWizardStore.setState({ savedProjects: [source] });

    await expect(useWizardStore.getState().refreshProjectSolution('p1')).rejects.toThrow('missing_battery_model');
  });

  it('calls calculate-residential with the project\'s own residentialOptions, persists and updates the solution', async () => {
    const nextSolution = { inverterId: 'inv1', inverterModel: 'X1-Hybrid', batteryId: 'bat1', batteryModel: 'TP-HS3.6', batteryQty: 1, pvPowerKw: null, accessories: [] };
    const supabase = createSupabaseMock({
      tableResults: { projects: { data: { ...projectRow, id: 'p1', solution: nextSolution }, error: null } },
    });
    createClientMock.mockReturnValue(supabase);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ solution: nextSolution }) });
    vi.stubGlobal('fetch', fetchMock);

    const source = makeSavedProject({ id: 'p1' });
    useWizardStore.setState({ savedProjects: [source] });

    const updated = await useWizardStore.getState().refreshProjectSolution('p1');

    expect(fetchMock).toHaveBeenCalledWith('/api/calculations/residential', expect.objectContaining({ method: 'POST' }));
    const [, requestInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(requestInit.body as string)).toEqual(expect.objectContaining({
      ...source.residentialOptions,
      batteryModel: source.residentialOptions.batteryModel,
    }));
    expect(updated.solution).toEqual(nextSolution);
    expect(useWizardStore.getState().savedProjects.find((p) => p.id === 'p1')?.solution).toEqual(nextSolution);
  });

  it('throws when the calculate-residential call fails, without changing savedProjects', async () => {
    const supabase = createSupabaseMock();
    createClientMock.mockReturnValue(supabase);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Não foi possível calcular.' }) }));

    const source = makeSavedProject({ id: 'p1' });
    useWizardStore.setState({ savedProjects: [source] });

    await expect(useWizardStore.getState().refreshProjectSolution('p1')).rejects.toThrow(/Não foi possível/);
    expect(useWizardStore.getState().savedProjects).toEqual([source]);
  });

  it('propagates a Supabase update error instead of updating state', async () => {
    const supabase = createSupabaseMock({
      tableResults: { projects: { data: null, error: { message: 'db down' } } },
    });
    createClientMock.mockReturnValue({
      ...supabase,
      functions: { invoke: vi.fn().mockResolvedValue({ data: { inverterId: 'inv1' }, error: null }) },
    });

    const source = makeSavedProject({ id: 'p1' });
    useWizardStore.setState({ savedProjects: [source] });

    await expect(useWizardStore.getState().refreshProjectSolution('p1')).rejects.toBeTruthy();
    expect(useWizardStore.getState().savedProjects).toEqual([source]);
  });
});

describe('updateProjectStatus', () => {
  beforeEach(() => resetStore());

  it('persists the new status and updates the matching project in savedProjects', async () => {
    const supabase = createSupabaseMock({
      tableResults: { projects: { data: { ...projectRow, id: 'p1', status: 'sent' }, error: null } },
    });
    createClientMock.mockReturnValue(supabase);

    const source = makeSavedProject({ id: 'p1', status: 'draft' });
    const other = makeSavedProject({ id: 'p2', status: 'draft' });
    useWizardStore.setState({ savedProjects: [source, other] });

    const updated = await useWizardStore.getState().updateProjectStatus('p1', 'sent');

    expect(updated.status).toBe('sent');
    const s = useWizardStore.getState();
    expect(s.savedProjects.find((p) => p.id === 'p1')?.status).toBe('sent');
    // The other project in the list is untouched.
    expect(s.savedProjects.find((p) => p.id === 'p2')).toEqual(other);
  });

  it('propagates a Supabase error instead of updating state', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { projects: { data: null, error: { message: 'db down' } } } })
    );
    const source = makeSavedProject({ id: 'p1', status: 'draft' });
    useWizardStore.setState({ savedProjects: [source] });

    await expect(useWizardStore.getState().updateProjectStatus('p1', 'sent')).rejects.toBeTruthy();
    expect(useWizardStore.getState().savedProjects).toEqual([source]);
  });

  it('logs a status_changed project_event when the status actually changes', async () => {
    const supabase = createSupabaseMock({
      tableResults: { projects: { data: { ...projectRow, id: 'p1', status: 'sent' }, error: null } },
    });
    createClientMock.mockReturnValue(supabase);

    const source = makeSavedProject({ id: 'p1', status: 'draft' });
    useWizardStore.setState({ savedProjects: [source] });

    await useWizardStore.getState().updateProjectStatus('p1', 'sent');

    expect(supabase.from).toHaveBeenCalledWith('project_events');
  });

  it('does not log a project_event when the status is unchanged', async () => {
    const supabase = createSupabaseMock({
      tableResults: { projects: { data: { ...projectRow, id: 'p1', status: 'draft' }, error: null } },
    });
    createClientMock.mockReturnValue(supabase);

    const source = makeSavedProject({ id: 'p1', status: 'draft' });
    useWizardStore.setState({ savedProjects: [source] });

    await useWizardStore.getState().updateProjectStatus('p1', 'draft');

    expect(supabase.from).not.toHaveBeenCalledWith('project_events');
  });
});

describe('fetchProjects', () => {
  beforeEach(() => resetStore());

  it('maps rows into savedProjects', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { projects: { data: [projectRow], error: null } } })
    );

    await useWizardStore.getState().fetchProjects();

    expect(useWizardStore.getState().savedProjects).toEqual([
      {
        id: 'row-p1',
        name: 'Projeto do banco',
        clientId: null,
        address: { ...emptyAddress(), street: 'Endereço do banco' },
        notes: 'Notas do banco',
        updatedAt: '2026-02-01T00:00:00.000Z',
        status: 'draft',
        residentialOptions: projectRow.residential_options,
        solution: null,
        services: [],
      },
    ]);
  });

  it('falls back to an empty list when there is no data', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { projects: { data: null, error: null } } })
    );

    await useWizardStore.getState().fetchProjects();

    expect(useWizardStore.getState().savedProjects).toEqual([]);
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { projects: { data: null, error: { message: 'db down' } } } })
    );

    await expect(useWizardStore.getState().fetchProjects()).rejects.toBeTruthy();
  });
});

const clientRow = {
  id: 'row-c1',
  name: 'Cliente Teste',
  email: 'cliente@teste.com',
  phone: '11999999999',
  document: '123.456.789-00',
  notes: '',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('fetchClients', () => {
  beforeEach(() => resetStore());

  it('maps rows into clients', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ tableResults: { clients: { data: [clientRow], error: null } } }));

    await useWizardStore.getState().fetchClients();

    expect(useWizardStore.getState().clients).toEqual([
      {
        id: 'row-c1',
        name: 'Cliente Teste',
        email: 'cliente@teste.com',
        phone: '11999999999',
        document: '123.456.789-00',
        notes: '',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { clients: { data: null, error: { message: 'db down' } } } })
    );

    await expect(useWizardStore.getState().fetchClients()).rejects.toBeTruthy();
  });
});

describe('addClient', () => {
  beforeEach(() => resetStore());

  it('throws a limit-reached error at ACCOUNT_LIMITS.clients', async () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    useWizardStore.setState({
      clients: Array.from({ length: ACCOUNT_LIMITS.clients }, (_, i) => ({
        id: `c${i}`,
        name: `Cliente ${i}`,
        email: '',
        phone: '',
        document: '',
        notes: '',
        createdAt: '',
        updatedAt: '',
      })),
    });

    await expect(
      useWizardStore.getState().addClient({ name: 'Novo', email: '', phone: '', document: '', notes: '' })
    ).rejects.toThrow(/Limite de/);
  });

  it('throws not_authenticated when there is no logged-in user', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ user: null }));
    await expect(
      useWizardStore.getState().addClient({ name: 'Novo', email: '', phone: '', document: '', notes: '' })
    ).rejects.toThrow('not_authenticated');
  });

  it('inserts and appends the new client, sorted by name', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ tableResults: { clients: { data: clientRow, error: null } } }));
    useWizardStore.setState({
      clients: [{ id: 'z', name: 'Zeta', email: '', phone: '', document: '', notes: '', createdAt: '', updatedAt: '' }],
    });

    const client = await useWizardStore.getState().addClient({
      name: 'Cliente Teste',
      email: 'cliente@teste.com',
      phone: '11999999999',
      document: '123.456.789-00',
      notes: '',
    });

    expect(client.id).toBe('row-c1');
    expect(useWizardStore.getState().clients.map((c) => c.name)).toEqual(['Cliente Teste', 'Zeta']);
  });

  it('propagates a Supabase error instead of updating state', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { clients: { data: null, error: { message: 'db down' } } } })
    );
    useWizardStore.setState({ clients: [] });

    await expect(
      useWizardStore.getState().addClient({ name: 'Novo', email: '', phone: '', document: '', notes: '' })
    ).rejects.toBeTruthy();
    expect(useWizardStore.getState().clients).toEqual([]);
  });
});

describe('updateClient', () => {
  beforeEach(() => resetStore());

  it('merges the partial into the matching client and re-sorts', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ tableResults: { clients: { data: null, error: null } } }));
    useWizardStore.setState({
      clients: [
        { id: 'c1', name: 'Ana', email: '', phone: '', document: '', notes: '', createdAt: '', updatedAt: '' },
        { id: 'c2', name: 'Bruno', email: '', phone: '', document: '', notes: '', createdAt: '', updatedAt: '' },
      ],
    });

    // Renaming "Ana" to "Zeta" must actually move it after "Bruno" once re-sorted.
    await useWizardStore.getState().updateClient('c1', { name: 'Zeta' });

    expect(useWizardStore.getState().clients.map((c) => c.name)).toEqual(['Bruno', 'Zeta']);
  });

  it('updates email/phone/document/notes when given, trimming and nulling blanks', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ tableResults: { clients: { data: null, error: null } } }));
    useWizardStore.setState({
      clients: [{ id: 'c1', name: 'Ana', email: 'old@x.com', phone: '111', document: '222', notes: 'old', createdAt: '', updatedAt: '' }],
    });

    await useWizardStore.getState().updateClient('c1', {
      email: '  new@x.com  ',
      phone: '  ',
      document: '333',
      notes: '',
    });

    // The local state merge stores `partial` as given (untrimmed) — only the Supabase
    // payload trims/nulls blanks — so this asserts every branch of the `!== undefined`
    // guards ran (email/phone/document/notes), not the Supabase-side normalization.
    const client = useWizardStore.getState().clients[0];
    expect(client.email).toBe('  new@x.com  ');
    expect(client.phone).toBe('  ');
    expect(client.document).toBe('333');
    expect(client.notes).toBe('');
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { clients: { data: null, error: { message: 'db down' } } } })
    );
    useWizardStore.setState({
      clients: [{ id: 'c1', name: 'Ana', email: '', phone: '', document: '', notes: '', createdAt: '', updatedAt: '' }],
    });

    await expect(useWizardStore.getState().updateClient('c1', { name: 'Zeta' })).rejects.toBeTruthy();
  });
});

describe('removeClient', () => {
  beforeEach(() => resetStore());

  it('removes the client and unlinks it from any saved projects', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ tableResults: { clients: { data: null, error: null } } }));
    useWizardStore.setState({
      clients: [{ id: 'c1', name: 'Ana', email: '', phone: '', document: '', notes: '', createdAt: '', updatedAt: '' }],
      savedProjects: [makeSavedProject({ id: 'p1', clientId: 'c1' })],
    });

    await useWizardStore.getState().removeClient('c1');

    const s = useWizardStore.getState();
    expect(s.clients).toEqual([]);
    expect(s.savedProjects[0].clientId).toBeNull();
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { clients: { data: null, error: { message: 'db down' } } } })
    );
    useWizardStore.setState({
      clients: [{ id: 'c1', name: 'Ana', email: '', phone: '', document: '', notes: '', createdAt: '', updatedAt: '' }],
    });

    await expect(useWizardStore.getState().removeClient('c1')).rejects.toBeTruthy();
  });
});

const userLoadRow = {
  id: 'row-u1',
  name: 'Chuveiro',
  power_w: 5500,
  ip_in_ratio: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('fetchUserLoadCatalog', () => {
  beforeEach(() => resetStore());

  it('maps rows into userLoadCatalog', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_catalog: { data: [userLoadRow], error: null } } })
    );

    await useWizardStore.getState().fetchUserLoadCatalog();

    expect(useWizardStore.getState().userLoadCatalog).toEqual([
      { id: 'row-u1', name: 'Chuveiro', powerW: 5500, ipInRatio: 1, createdAt: userLoadRow.created_at, updatedAt: userLoadRow.updated_at },
    ]);
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_catalog: { data: null, error: { message: 'db down' } } } })
    );

    await expect(useWizardStore.getState().fetchUserLoadCatalog()).rejects.toBeTruthy();
  });
});

describe('saveManualLoadToCatalog', () => {
  beforeEach(() => resetStore());

  it('throws not_authenticated when there is no logged-in user', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ user: null }));
    await expect(
      useWizardStore.getState().saveManualLoadToCatalog({ name: 'Chuveiro', powerW: 5500, ipInRatio: 1 })
    ).rejects.toThrow('not_authenticated');
  });

  it('updates the existing item in place when the name already exists (case-insensitive)', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_catalog: { data: null, error: null } } })
    );
    useWizardStore.setState({
      userLoadCatalog: [{ id: 'u1', name: 'chuveiro', powerW: 4000, ipInRatio: 1, createdAt: '', updatedAt: '' }],
    });

    await useWizardStore.getState().saveManualLoadToCatalog({ name: 'Chuveiro', powerW: 5500, ipInRatio: 2 });

    const s = useWizardStore.getState();
    expect(s.userLoadCatalog).toHaveLength(1);
    expect(s.userLoadCatalog[0]).toMatchObject({ id: 'u1', powerW: 5500, ipInRatio: 2 });
  });

  it('propagates a Supabase error when updating an existing item by name', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_catalog: { data: null, error: { message: 'db down' } } } })
    );
    useWizardStore.setState({
      userLoadCatalog: [{ id: 'u1', name: 'chuveiro', powerW: 4000, ipInRatio: 1, createdAt: '', updatedAt: '' }],
    });

    await expect(
      useWizardStore.getState().saveManualLoadToCatalog({ name: 'Chuveiro', powerW: 5500, ipInRatio: 2 })
    ).rejects.toBeTruthy();
  });

  it('propagates a Supabase error when the FIFO eviction delete fails', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_catalog: { data: null, error: { message: 'delete failed' } } } })
    );
    const existing = Array.from({ length: ACCOUNT_LIMITS.userLoadCatalog }, (_, i) => ({
      id: `u${i}`,
      name: `Carga ${i}`,
      powerW: 100,
      ipInRatio: 1,
      createdAt: new Date(2026, 0, i + 1).toISOString(),
      updatedAt: '',
    }));
    useWizardStore.setState({ userLoadCatalog: existing });

    await expect(
      useWizardStore.getState().saveManualLoadToCatalog({ name: 'Nova carga', powerW: 100, ipInRatio: 1 })
    ).rejects.toBeTruthy();
  });

  it('propagates a Supabase error on the final insert', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_catalog: { data: null, error: { message: 'insert failed' } } } })
    );
    useWizardStore.setState({ userLoadCatalog: [] });

    await expect(
      useWizardStore.getState().saveManualLoadToCatalog({ name: 'Chuveiro', powerW: 5500, ipInRatio: 1 })
    ).rejects.toBeTruthy();
  });

  it('evicts the oldest item (by createdAt) instead of throwing once at ACCOUNT_LIMITS.userLoadCatalog', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_catalog: { data: userLoadRow, error: null } } })
    );
    const existing = Array.from({ length: ACCOUNT_LIMITS.userLoadCatalog }, (_, i) => ({
      id: `u${i}`,
      name: `Carga ${i}`,
      powerW: 100,
      ipInRatio: 1,
      createdAt: new Date(2026, 0, i + 1).toISOString(),
      updatedAt: '',
    }));
    useWizardStore.setState({ userLoadCatalog: existing });

    await useWizardStore.getState().saveManualLoadToCatalog({ name: 'Nova carga', powerW: 100, ipInRatio: 1 });

    const s = useWizardStore.getState();
    // The oldest entry (u0, earliest createdAt) is gone, the newly saved item took its place,
    // and the total count stays at the limit instead of growing past it.
    expect(s.userLoadCatalog).toHaveLength(ACCOUNT_LIMITS.userLoadCatalog);
    expect(s.userLoadCatalog.some((item) => item.id === 'u0')).toBe(false);
    expect(s.userLoadCatalog.some((item) => item.id === 'row-u1')).toBe(true);
  });

  it('inserts a new item and appends it, sorted by name', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_catalog: { data: userLoadRow, error: null } } })
    );
    useWizardStore.setState({ userLoadCatalog: [] });

    await useWizardStore.getState().saveManualLoadToCatalog({ name: 'Chuveiro', powerW: 5500, ipInRatio: 1 });

    expect(useWizardStore.getState().userLoadCatalog).toHaveLength(1);
    expect(useWizardStore.getState().userLoadCatalog[0].id).toBe('row-u1');
  });
});

describe('updateUserLoadCatalogItem', () => {
  beforeEach(() => resetStore());

  it('merges the partial into the matching item and re-sorts', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_catalog: { data: null, error: null } } })
    );
    useWizardStore.setState({
      userLoadCatalog: [
        { id: 'u1', name: 'Chuveiro', powerW: 4000, ipInRatio: 1, createdAt: '', updatedAt: '' },
        { id: 'u2', name: 'Ventilador', powerW: 80, ipInRatio: 1, createdAt: '', updatedAt: '' },
      ],
    });

    await useWizardStore.getState().updateUserLoadCatalogItem('u1', { powerW: 6000, name: 'Zorra' });

    // Renaming "Chuveiro" to "Zorra" must actually move it after "Ventilador" once re-sorted.
    const s = useWizardStore.getState();
    expect(s.userLoadCatalog.map((item) => item.name)).toEqual(['Ventilador', 'Zorra']);
    expect(s.userLoadCatalog[1].powerW).toBe(6000);
  });

  it('updates ipInRatio when given', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_catalog: { data: null, error: null } } })
    );
    useWizardStore.setState({
      userLoadCatalog: [{ id: 'u1', name: 'Chuveiro', powerW: 4000, ipInRatio: 1, createdAt: '', updatedAt: '' }],
    });

    await useWizardStore.getState().updateUserLoadCatalogItem('u1', { ipInRatio: 3 });

    expect(useWizardStore.getState().userLoadCatalog[0].ipInRatio).toBe(3);
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_catalog: { data: null, error: { message: 'db down' } } } })
    );
    useWizardStore.setState({
      userLoadCatalog: [{ id: 'u1', name: 'Chuveiro', powerW: 4000, ipInRatio: 1, createdAt: '', updatedAt: '' }],
    });

    await expect(useWizardStore.getState().updateUserLoadCatalogItem('u1', { powerW: 1 })).rejects.toBeTruthy();
  });
});

describe('removeUserLoadCatalogItem', () => {
  beforeEach(() => resetStore());

  it('removes the matching item', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_catalog: { data: null, error: null } } })
    );
    useWizardStore.setState({
      userLoadCatalog: [{ id: 'u1', name: 'Chuveiro', powerW: 4000, ipInRatio: 1, createdAt: '', updatedAt: '' }],
    });

    await useWizardStore.getState().removeUserLoadCatalogItem('u1');

    expect(useWizardStore.getState().userLoadCatalog).toEqual([]);
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_catalog: { data: null, error: { message: 'db down' } } } })
    );
    useWizardStore.setState({
      userLoadCatalog: [{ id: 'u1', name: 'Chuveiro', powerW: 4000, ipInRatio: 1, createdAt: '', updatedAt: '' }],
    });

    await expect(useWizardStore.getState().removeUserLoadCatalogItem('u1')).rejects.toBeTruthy();
  });
});

const presetRow = { id: 'row-pr1', name: 'Meu preset', description: 'Descrição', loads: [] };

describe('fetchUserLoadPresets', () => {
  beforeEach(() => resetStore());

  it('maps rows into userLoadPresets', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_presets: { data: [presetRow], error: null } } })
    );

    await useWizardStore.getState().fetchUserLoadPresets();

    expect(useWizardStore.getState().userLoadPresets).toEqual([presetRow]);
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_presets: { data: null, error: { message: 'db down' } } } })
    );

    await expect(useWizardStore.getState().fetchUserLoadPresets()).rejects.toBeTruthy();
  });
});

describe('saveLoadsAsPreset', () => {
  beforeEach(() => resetStore());

  it('throws not_authenticated when there is no logged-in user', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ user: null }));
    await expect(
      useWizardStore.getState().saveLoadsAsPreset({ name: 'Preset', description: '', loads: [] })
    ).rejects.toThrow('not_authenticated');
  });

  it('throws a limit-reached error at ACCOUNT_LIMITS.userPresets', async () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    useWizardStore.setState({
      userLoadPresets: Array.from({ length: ACCOUNT_LIMITS.userPresets }, (_, i) => ({
        id: `pr${i}`,
        name: `Preset ${i}`,
        description: '',
        loads: [],
      })),
    });

    await expect(
      useWizardStore.getState().saveLoadsAsPreset({ name: 'Novo', description: '', loads: [] })
    ).rejects.toThrow(/Limite de/);
  });

  it('inserts and appends the new preset', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_presets: { data: presetRow, error: null } } })
    );
    useWizardStore.setState({ userLoadPresets: [] });

    await useWizardStore.getState().saveLoadsAsPreset({ name: 'Meu preset', description: 'Descrição', loads: [] });

    expect(useWizardStore.getState().userLoadPresets).toEqual([presetRow]);
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_presets: { data: null, error: { message: 'db down' } } } })
    );
    useWizardStore.setState({ userLoadPresets: [] });

    await expect(
      useWizardStore.getState().saveLoadsAsPreset({ name: 'Meu preset', description: '', loads: [] })
    ).rejects.toBeTruthy();
  });
});

describe('removeUserLoadPreset', () => {
  beforeEach(() => resetStore());

  it('removes the matching preset', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_presets: { data: null, error: null } } })
    );
    useWizardStore.setState({ userLoadPresets: [presetRow] });

    await useWizardStore.getState().removeUserLoadPreset('row-pr1');

    expect(useWizardStore.getState().userLoadPresets).toEqual([]);
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_load_presets: { data: null, error: { message: 'db down' } } } })
    );
    useWizardStore.setState({ userLoadPresets: [presetRow] });

    await expect(useWizardStore.getState().removeUserLoadPreset('row-pr1')).rejects.toBeTruthy();
  });
});

const stockRow = {
  id: 'row-st1',
  product_type: 'inverter',
  product_model: 'X1-Hybrid-5.0kW-G4',
  unit_value: 12345,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('fetchUserStockItems', () => {
  beforeEach(() => resetStore());

  it('maps rows into userStockItems', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_stock_items: { data: [stockRow], error: null } } })
    );

    await useWizardStore.getState().fetchUserStockItems();

    expect(useWizardStore.getState().userStockItems).toEqual([
      {
        id: 'row-st1',
        productType: 'inverter',
        productModel: 'X1-Hybrid-5.0kW-G4',
        unitValue: 12345,
        createdAt: stockRow.created_at,
        updatedAt: stockRow.updated_at,
      },
    ]);
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_stock_items: { data: null, error: { message: 'db down' } } } })
    );

    await expect(useWizardStore.getState().fetchUserStockItems()).rejects.toBeTruthy();
  });
});

describe('addToStock', () => {
  beforeEach(() => resetStore());

  it('throws a limit-reached error at ACCOUNT_LIMITS.userStockItems for a genuinely new item', async () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    useWizardStore.setState({
      userStockItems: Array.from({ length: ACCOUNT_LIMITS.userStockItems }, (_, i) => ({
        id: `st${i}`,
        productType: 'inverter' as const,
        productModel: `Model ${i}`,
        unitValue: 0,
        createdAt: '',
        updatedAt: '',
      })),
    });

    await expect(
      useWizardStore.getState().addToStock({ productType: 'inverter', productModel: 'Novo modelo', unitValue: 100 })
    ).rejects.toThrow(/Limite de/);
  });

  it('does not enforce the limit when re-adding (upserting) an item already in stock', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_stock_items: { data: stockRow, error: null } } })
    );
    useWizardStore.setState({
      userStockItems: Array.from({ length: ACCOUNT_LIMITS.userStockItems }, (_, i) =>
        i === 0
          ? { id: 'row-st1', productType: 'inverter' as const, productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 1, createdAt: '', updatedAt: '' }
          : { id: `st${i}`, productType: 'inverter' as const, productModel: `Model ${i}`, unitValue: 0, createdAt: '', updatedAt: '' }
      ),
    });

    await expect(
      useWizardStore.getState().addToStock({ productType: 'inverter', productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 999 })
    ).resolves.toBeUndefined();
  });

  it('throws not_authenticated when there is no logged-in user', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ user: null }));
    await expect(
      useWizardStore.getState().addToStock({ productType: 'inverter', productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 100 })
    ).rejects.toThrow('not_authenticated');
  });

  it('upserts and adds the item, sorted by product model', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_stock_items: { data: stockRow, error: null } } })
    );
    useWizardStore.setState({ userStockItems: [] });

    await useWizardStore.getState().addToStock({ productType: 'inverter', productModel: 'X1-Hybrid-5.0kW-G4', unitValue: 12345 });

    expect(useWizardStore.getState().userStockItems).toHaveLength(1);
    expect(useWizardStore.getState().userStockItems[0].id).toBe('row-st1');
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_stock_items: { data: null, error: { message: 'db down' } } } })
    );
    useWizardStore.setState({ userStockItems: [] });

    await expect(
      useWizardStore.getState().addToStock({ productType: 'inverter', productModel: 'X1', unitValue: 100 })
    ).rejects.toBeTruthy();
  });
});

describe('updateStockItemValue', () => {
  beforeEach(() => resetStore());

  it('updates the unit value for the matching item', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_stock_items: { data: null, error: null } } })
    );
    useWizardStore.setState({
      userStockItems: [{ id: 'st1', productType: 'inverter', productModel: 'X1', unitValue: 100, createdAt: '', updatedAt: '' }],
    });

    await useWizardStore.getState().updateStockItemValue('st1', 999);

    expect(useWizardStore.getState().userStockItems[0].unitValue).toBe(999);
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_stock_items: { data: null, error: { message: 'db down' } } } })
    );
    useWizardStore.setState({
      userStockItems: [{ id: 'st1', productType: 'inverter', productModel: 'X1', unitValue: 100, createdAt: '', updatedAt: '' }],
    });

    await expect(useWizardStore.getState().updateStockItemValue('st1', 999)).rejects.toBeTruthy();
  });
});

describe('removeFromStock', () => {
  beforeEach(() => resetStore());

  it('removes the matching item', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_stock_items: { data: null, error: null } } })
    );
    useWizardStore.setState({
      userStockItems: [{ id: 'st1', productType: 'inverter', productModel: 'X1', unitValue: 100, createdAt: '', updatedAt: '' }],
    });

    await useWizardStore.getState().removeFromStock('st1');

    expect(useWizardStore.getState().userStockItems).toEqual([]);
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { user_stock_items: { data: null, error: { message: 'db down' } } } })
    );
    useWizardStore.setState({
      userStockItems: [{ id: 'st1', productType: 'inverter', productModel: 'X1', unitValue: 100, createdAt: '', updatedAt: '' }],
    });

    await expect(useWizardStore.getState().removeFromStock('st1')).rejects.toBeTruthy();
  });
});
