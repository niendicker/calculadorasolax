import { describe, expect, it } from 'vitest';
import { buildDemoSimulation, DEMO_SIMULATIONS } from './demo-simulations';
import type { BatteryCatalogOption, ApprovedInverterCombo } from '@/components/app/types';
import type { LoadPresetItem } from '@/lib/types';

const presets: LoadPresetItem[] = [
  {
    id: 'preset-1',
    name: 'Residencial essencial',
    description: '',
    loads: [{ name: 'Geladeira', powerW: 300, qty: 1, ipInRatio: 2 }],
  },
];

const batteryCatalog = [
  { model: 'HV-small', topology: 'HV', capacityKwh: 5, expansionModel: null },
  { model: 'HV-large', topology: 'HV', capacityKwh: 10, expansionModel: null },
] as BatteryCatalogOption[];

const combos: ApprovedInverterCombo[] = [
  { gridTopology: '1p_220V', batteryTopology: 'HV', inverterModel: 'INV-1' },
  { gridTopology: '2p_220V', batteryTopology: 'HV', inverterModel: 'INV-2' },
  { gridTopology: '3p_380V', batteryTopology: 'HV', inverterModel: 'INV-3' },
];

describe('demo simulations', () => {
  it('builds the three configured examples from existing catalog data', () => {
    for (const definition of DEMO_SIMULATIONS) {
      const data = buildDemoSimulation(definition, presets, batteryCatalog, combos);
      expect(data?.residentialOptions.batteryModel).toBe('HV-small');
      expect(data?.residentialOptions.operationHours).toBe(2);
      expect(data?.residentialOptions.loads[0].id).toContain(definition.id);
    }
  });

  it('returns null when the preset or a compatible battery is unavailable', () => {
    expect(buildDemoSimulation(DEMO_SIMULATIONS[0], [], batteryCatalog, combos)).toBeNull();
    expect(buildDemoSimulation(DEMO_SIMULATIONS[0], presets, [], combos)).toBeNull();
  });
});
