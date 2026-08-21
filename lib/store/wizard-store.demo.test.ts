// @vitest-environment jsdom

import { describe, expect, it, beforeEach } from 'vitest';
import { defaultResidential } from './defaults';
import { useWizardStore } from './wizard-store';
import { resetWizardStore } from '@/lib/test-helpers/wizard-store-reset';

const demoOptions = {
  ...defaultResidential,
  batteryModel: 'HV-demo',
  loads: [{ id: 'demo-load', name: 'Carga', powerW: 500, qty: 1, ipInRatio: 1 }],
  operationHours: 2,
};

describe('wizard demo mode', () => {
  beforeEach(() => resetWizardStore());

  it('snapshots the current state and restores it when leaving the demo', () => {
    useWizardStore.getState().setProjectInfo({ name: 'Projeto original' });
    useWizardStore.getState().loadDemoSimulation('demo', { residentialOptions: demoOptions }, 'sizing');

    expect(useWizardStore.getState().isDemo).toBe(true);
    expect(useWizardStore.getState().residentialOptions.batteryModel).toBe('HV-demo');

    useWizardStore.getState().exitDemoMode();
    expect(useWizardStore.getState().isDemo).toBe(false);
    expect(useWizardStore.getState().projectInfo.name).toBe('Projeto original');
    expect(useWizardStore.getState().residentialOptions.loads).toEqual([]);
    expect(useWizardStore.getState().residentialOptions.batteryModel).toBeNull();
  });

  it('converts the current example into a new project draft', () => {
    useWizardStore.getState().loadDemoSimulation('demo', { residentialOptions: demoOptions }, 'project');
    useWizardStore.getState().convertDemoToSimulation();

    const state = useWizardStore.getState();
    expect(state.isDemo).toBe(false);
    expect(state.demoSnapshot).toBeNull();
    expect(state.currentProjectId).toBeNull();
    expect(state.projectDetailsVisible).toBe(true);
    expect(state.residentialOptions).toEqual(demoOptions);
  });
});
