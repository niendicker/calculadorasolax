import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ACCOUNT_LIMITS } from '@/lib/limits';
import { totalDailyKwh, totalPeakW, totalPowerByPhase, useWizardStore } from './wizard-store';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import type { SavedProject, SingleLoad } from '@/lib/types';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));

function makeLoad(partial: Partial<SingleLoad> & Pick<SingleLoad, 'powerW' | 'hoursPerDay' | 'qty'>): SingleLoad {
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
    address: 'Rua salva, 1',
    notes: 'Notas salvas',
    updatedAt: '2026-01-01T00:00:00.000Z',
    residentialOptions: {
      topology: 'HighVoltage',
      batteryModel: 'T-BAT-SYS-HV-5.8',
      inverterModel: 'X1-Hybrid-5.0kW-G4',
      gridType: 'singlePhase_220',
      loads: [makeLoad({ powerW: 1000, hoursPerDay: 2, qty: 1 })],
      peakCalcMode: 'sum',
      desiredFeatures: [],
      whiteTariff: null,
      microgrid: null,
      generator: null,
      atsPhotoUrl: null,
      maxPowerPerPhaseW: null,
    },
    solution: null,
    ...partial,
  };
}

/** Resets the store to its factory-default state so tests don't leak into each other. */
function resetStore() {
  useWizardStore.setState({
    projectInfo: { name: '', clientId: null, address: '', notes: '' },
    currentProjectId: null,
    projectDetailsVisible: false,
    savedProjects: [],
    clients: [],
    userLoadCatalog: [],
    userStockItems: [],
    userLoadPresets: [],
    residentialOptions: {
      topology: null,
      batteryModel: null,
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
    industrialOptions: {
      gridPowerKw: null,
      pvPowerKwp: null,
      backupPowerKw: null,
      backupHours: null,
      demandCharge: false,
    },
    solution: null,
    loadCatalog: [],
    loadPresets: [],
  });
  createClientMock.mockReset();
}

describe('totalDailyKwh', () => {
  it('returns 0 for no loads', () => {
    expect(totalDailyKwh([])).toBe(0);
  });

  it('sums powerW x hoursPerDay x qty across loads, in kWh', () => {
    const loads = [
      makeLoad({ powerW: 100, hoursPerDay: 5, qty: 2 }), // 1.0 kWh
      makeLoad({ powerW: 1000, hoursPerDay: 1, qty: 1 }), // 1.0 kWh
    ];
    expect(totalDailyKwh(loads)).toBeCloseTo(2.0);
  });

  it('ignores ipInRatio (peak ratio does not affect daily energy)', () => {
    const loads = [makeLoad({ powerW: 100, hoursPerDay: 2, qty: 1, ipInRatio: 5 })];
    expect(totalDailyKwh(loads)).toBeCloseTo(0.2);
  });
});

describe('totalPeakW', () => {
  it('returns 0 for no loads', () => {
    expect(totalPeakW([])).toBe(0);
  });

  it('sum mode: adds powerW x ipInRatio x qty for every load at once', () => {
    const loads = [
      makeLoad({ powerW: 1000, hoursPerDay: 1, qty: 1, ipInRatio: 3 }), // 3000
      makeLoad({ powerW: 200, hoursPerDay: 1, qty: 2, ipInRatio: 1 }), // 400
    ];
    expect(totalPeakW(loads, 'sum')).toBe(3400);
  });

  it('sum mode is the default when no mode is given', () => {
    const loads = [makeLoad({ powerW: 500, hoursPerDay: 1, qty: 1, ipInRatio: 2 })];
    expect(totalPeakW(loads)).toBe(1000);
  });

  it('largest-surge mode: only the single highest-surge load contributes its extra', () => {
    const loads = [
      makeLoad({ powerW: 1000, hoursPerDay: 1, qty: 1, ipInRatio: 3 }), // extra = 2000
      makeLoad({ powerW: 500, hoursPerDay: 1, qty: 1, ipInRatio: 2 }), // extra = 500
      makeLoad({ powerW: 100, hoursPerDay: 1, qty: 4, ipInRatio: 1 }), // extra = 0
    ];
    // nominal sum = 1000 + 500 + 400 = 1900; + largest extra (2000) = 3900
    expect(totalPeakW(loads, 'largest-surge')).toBe(3900);
  });

  it('largest-surge mode matches sum mode for a single unit (qty 1)', () => {
    const loads = [makeLoad({ powerW: 300, hoursPerDay: 1, qty: 1, ipInRatio: 2 })];
    expect(totalPeakW(loads, 'largest-surge')).toBe(totalPeakW(loads, 'sum'));
  });

  it('largest-surge mode only assumes a single physical unit surges, even when qty > 1', () => {
    const loads = [makeLoad({ powerW: 300, hoursPerDay: 1, qty: 2, ipInRatio: 2 })];
    // nominal sum = 300 x 2 = 600; only one unit's extra (300 x (2-1) = 300) counts
    expect(totalPeakW(loads, 'largest-surge')).toBe(900);
    // whereas sum mode assumes every unit surges together: 300 x 2 x 2 = 1200
    expect(totalPeakW(loads, 'sum')).toBe(1200);
  });
});

describe('totalPowerByPhase', () => {
  it('returns zero on all phases for no loads', () => {
    expect(totalPowerByPhase([])).toEqual({ L1: 0, L2: 0, L3: 0 });
  });

  it('assigns a mono load fully to its single phase, defaulting to L1', () => {
    const loads = [makeLoad({ powerW: 1000, hoursPerDay: 1, qty: 1, phaseType: 'mono', phase: 'L2' })];
    expect(totalPowerByPhase(loads)).toEqual({ L1: 0, L2: 1000, L3: 0 });
  });

  it('defaults an unassigned mono load to L1', () => {
    const loads = [makeLoad({ powerW: 500, hoursPerDay: 1, qty: 1, phaseType: 'mono' })];
    expect(totalPowerByPhase(loads)).toEqual({ L1: 500, L2: 0, L3: 0 });
  });

  it('multiplies mono load power by qty before assigning to its phase', () => {
    const loads = [makeLoad({ powerW: 100, hoursPerDay: 1, qty: 3, phaseType: 'mono', phase: 'L3' })];
    expect(totalPowerByPhase(loads)).toEqual({ L1: 0, L2: 0, L3: 300 });
  });

  it('splits a trifasica load evenly across all three phases', () => {
    const loads = [makeLoad({ powerW: 3000, hoursPerDay: 1, qty: 1, phaseType: 'trifasica' })];
    expect(totalPowerByPhase(loads)).toEqual({ L1: 1000, L2: 1000, L3: 1000 });
  });

  it('counts the full power on BOTH phases for a phase-to-phase mono load, not split', () => {
    const loads = [
      makeLoad({ powerW: 1000, hoursPerDay: 1, qty: 1, phaseType: 'mono', phase: 'L1', phase2: 'L2' }),
    ];
    expect(totalPowerByPhase(loads)).toEqual({ L1: 1000, L2: 1000, L3: 0 });
  });

  it('accumulates power from multiple loads on the same phase', () => {
    const loads = [
      makeLoad({ powerW: 500, hoursPerDay: 1, qty: 1, phaseType: 'mono', phase: 'L1' }),
      makeLoad({ powerW: 300, hoursPerDay: 1, qty: 1, phaseType: 'mono', phase: 'L1' }),
    ];
    expect(totalPowerByPhase(loads).L1).toBe(800);
  });
});

describe('addLoad limit enforcement', () => {
  beforeEach(() => {
    resetStore();
  });

  it('adds a load and returns true while under the per-project limit', () => {
    const added = useWizardStore.getState().addLoad(makeLoad({ powerW: 100, hoursPerDay: 1, qty: 1 }));
    expect(added).toBe(true);
    expect(useWizardStore.getState().residentialOptions.loads).toHaveLength(1);
  });

  it('returns false and does not add once the project already has ACCOUNT_LIMITS.loadsPerProject loads', () => {
    for (let i = 0; i < ACCOUNT_LIMITS.loadsPerProject; i++) {
      expect(useWizardStore.getState().addLoad(makeLoad({ powerW: 100, hoursPerDay: 1, qty: 1 }))).toBe(true);
    }
    expect(useWizardStore.getState().residentialOptions.loads).toHaveLength(ACCOUNT_LIMITS.loadsPerProject);

    const added = useWizardStore.getState().addLoad(makeLoad({ powerW: 100, hoursPerDay: 1, qty: 1 }));
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
    expect(s.projectInfo).toEqual({ name: '', clientId: null, address: '', notes: '' });
    expect(s.currentProjectId).toBeNull();
    expect(s.projectDetailsVisible).toBe(false);
    expect(s.residentialOptions.loads).toHaveLength(0);
    expect(s.solution).toBeNull();
  });

  it('reverts unsaved edits on an existing project back to its last saved values', () => {
    const saved = makeSavedProject({ id: 'p1', name: 'Nome salvo', address: 'Endereço salvo' });
    useWizardStore.setState({
      savedProjects: [saved],
      currentProjectId: 'p1',
      projectDetailsVisible: true,
      projectInfo: { name: 'Edição não salva', clientId: null, address: 'Endereço editado', notes: '' },
      residentialOptions: { ...saved.residentialOptions, batteryModel: 'outro-modelo-editado' },
    });

    useWizardStore.getState().cancelProjectDraft();

    const s = useWizardStore.getState();
    expect(s.projectDetailsVisible).toBe(false);
    expect(s.currentProjectId).toBe('p1');
    expect(s.projectInfo).toEqual({
      name: 'Nome salvo',
      clientId: null,
      address: 'Endereço salvo',
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
      projectInfo: { name: 'Editando algo removido', clientId: null, address: '', notes: '' },
    });

    useWizardStore.getState().cancelProjectDraft();

    const s = useWizardStore.getState();
    expect(s.currentProjectId).toBeNull();
    expect(s.projectDetailsVisible).toBe(false);
    expect(s.projectInfo).toEqual({ name: '', clientId: null, address: '', notes: '' });
  });
});

describe('setProjectInfo', () => {
  beforeEach(() => resetStore());

  it('shallow-merges a partial into the existing projectInfo', () => {
    useWizardStore.getState().setProjectInfo({ name: 'Residência Silva' });
    useWizardStore.getState().setProjectInfo({ address: 'Rua das Flores, 10' });

    expect(useWizardStore.getState().projectInfo).toEqual({
      name: 'Residência Silva',
      clientId: null,
      address: 'Rua das Flores, 10',
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
      projectInfo: { name: 'Projeto carregado', clientId: null, address: '', notes: '' },
      residentialOptions: saved.residentialOptions,
      solution: null,
      projectDetailsVisible: false,
    });

    useWizardStore.getState().newProjectDraft();

    const s = useWizardStore.getState();
    expect(s.currentProjectId).toBeNull();
    expect(s.projectDetailsVisible).toBe(true);
    expect(s.projectInfo).toEqual({ name: '', clientId: null, address: '', notes: '' });
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

  it('is a no-op when the id does not match any saved project', () => {
    useWizardStore.setState({ savedProjects: [makeSavedProject({ id: 'p1' })] });

    useWizardStore.getState().loadProject('missing-id');

    const s = useWizardStore.getState();
    expect(s.currentProjectId).toBeNull();
    expect(s.projectDetailsVisible).toBe(false);
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
});

describe('setBatteryModel', () => {
  beforeEach(() => resetStore());

  it('sets the battery model without touching other fields', () => {
    useWizardStore.getState().setBatteryModel('TP-HS3.6');
    expect(useWizardStore.getState().residentialOptions.batteryModel).toBe('TP-HS3.6');
  });
});

describe('setInverterModel', () => {
  beforeEach(() => resetStore());

  it('sets the inverter model without touching other fields', () => {
    useWizardStore.getState().setInverterModel('X1-Hybrid-5.0kW-G4');
    expect(useWizardStore.getState().residentialOptions.inverterModel).toBe('X1-Hybrid-5.0kW-G4');
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
        whiteTariff: { requiredPowerW: 1000, requiredEnergyWh: 2000, includeBackupReserve: false, tariffSpreadPerKwh: 0.5 },
        microgrid: { onGridPhases: 1, onGridApparentPowerVA: 1000, isFundamentalRequirement: false, photoUrl: null },
        generator: { voltageV: 220, phases: 1, apparentPowerVA: 1000, photoUrl: null },
        atsPhotoUrl: 'https://example.com/ats.jpg',
      },
    }));

    useWizardStore.getState().setDesiredFeatures(['white_tariff']);

    const options = useWizardStore.getState().residentialOptions;
    expect(options.desiredFeatures).toEqual(['white_tariff']);
    expect(options.whiteTariff).not.toBeNull();
    expect(options.microgrid).toBeNull();
    expect(options.generator).toBeNull();
    expect(options.atsPhotoUrl).toBeNull();
  });

  it('keeps all configs when all their features stay selected', () => {
    const whiteTariff = { requiredPowerW: 1000, requiredEnergyWh: 2000, includeBackupReserve: false, tariffSpreadPerKwh: 0.5 };
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
    const whiteTariff = { requiredPowerW: 500, requiredEnergyWh: 1000, includeBackupReserve: true, tariffSpreadPerKwh: 0.3 };
    const microgrid = { onGridPhases: 3 as const, onGridApparentPowerVA: 5000, isFundamentalRequirement: true, photoUrl: null };
    const generator = { voltageV: 380, phases: 3 as const, apparentPowerVA: 8000, photoUrl: null };

    useWizardStore.getState().setWhiteTariffConfig(whiteTariff);
    useWizardStore.getState().setMicrogridConfig(microgrid);
    useWizardStore.getState().setGeneratorConfig(generator);
    useWizardStore.getState().setAtsPhotoUrl('https://example.com/ats.jpg');

    const options = useWizardStore.getState().residentialOptions;
    expect(options.whiteTariff).toEqual(whiteTariff);
    expect(options.microgrid).toEqual(microgrid);
    expect(options.generator).toEqual(generator);
    expect(options.atsPhotoUrl).toBe('https://example.com/ats.jpg');
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

describe('removeLoad / updateLoad', () => {
  beforeEach(() => resetStore());

  it('removeLoad drops only the matching load', () => {
    const [a, b] = [makeLoad({ powerW: 100, hoursPerDay: 1, qty: 1 }), makeLoad({ powerW: 200, hoursPerDay: 1, qty: 1 })];
    useWizardStore.setState((s) => ({ residentialOptions: { ...s.residentialOptions, loads: [a, b] } }));

    useWizardStore.getState().removeLoad(a.id);

    expect(useWizardStore.getState().residentialOptions.loads).toEqual([b]);
  });

  it('updateLoad merges a partial into the matching load only', () => {
    const [a, b] = [makeLoad({ powerW: 100, hoursPerDay: 1, qty: 1 }), makeLoad({ powerW: 200, hoursPerDay: 1, qty: 1 })];
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
      residentialOptions: { ...s.residentialOptions, batteryModel: 'TP-HS3.6', loads: [makeLoad({ powerW: 1, hoursPerDay: 1, qty: 1 })] },
      solution: { id: 's1' } as never,
    }));

    useWizardStore.getState().resetResidential();

    const s = useWizardStore.getState();
    expect(s.residentialOptions.batteryModel).toBeNull();
    expect(s.residentialOptions.loads).toHaveLength(0);
    expect(s.solution).toBeNull();
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
    expect(s.projectInfo).toEqual({ name: '', clientId: null, address: '', notes: '' });
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
        address: 'Endereço do banco',
        notes: 'Notas do banco',
        updatedAt: '2026-02-01T00:00:00.000Z',
        residentialOptions: projectRow.residential_options,
        solution: null,
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
});

describe('updateClient', () => {
  beforeEach(() => resetStore());

  it('merges the partial into the matching client and re-sorts', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ tableResults: { clients: { data: null, error: null } } }));
    useWizardStore.setState({
      clients: [
        { id: 'c1', name: 'Ana', email: '', phone: '', document: '', notes: '', createdAt: '', updatedAt: '' },
      ],
    });

    await useWizardStore.getState().updateClient('c1', { name: 'Zeta' });

    expect(useWizardStore.getState().clients[0].name).toBe('Zeta');
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

  it('throws a limit-reached error at ACCOUNT_LIMITS.userLoadCatalog for a genuinely new item', async () => {
    createClientMock.mockReturnValue(createSupabaseMock());
    useWizardStore.setState({
      userLoadCatalog: Array.from({ length: ACCOUNT_LIMITS.userLoadCatalog }, (_, i) => ({
        id: `u${i}`,
        name: `Carga ${i}`,
        powerW: 100,
        ipInRatio: 1,
        createdAt: '',
        updatedAt: '',
      })),
    });

    await expect(
      useWizardStore.getState().saveManualLoadToCatalog({ name: 'Nova carga', powerW: 100, ipInRatio: 1 })
    ).rejects.toThrow(/Limite de/);
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
      userLoadCatalog: [{ id: 'u1', name: 'Chuveiro', powerW: 4000, ipInRatio: 1, createdAt: '', updatedAt: '' }],
    });

    await useWizardStore.getState().updateUserLoadCatalogItem('u1', { powerW: 6000 });

    expect(useWizardStore.getState().userLoadCatalog[0].powerW).toBe(6000);
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
});
