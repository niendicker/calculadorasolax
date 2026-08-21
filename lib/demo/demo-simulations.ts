import type { BatteryCatalogOption, ApprovedInverterCombo } from '@/components/app/types';
import type { LoadPresetItem, ResidentialOptions } from '@/lib/types';
import { defaultResidential } from '@/lib/store/defaults';
import type { DemoSimulationData, DemoSimulationDefinition } from './types';

export const DEMO_SIMULATIONS: DemoSimulationDefinition[] = [
  {
    id: 'residential-backup',
    name: 'Residencial com backup',
    description: 'Bateria para manter cargas residenciais essenciais durante uma falta de energia.',
    desiredFeatures: ['backup'],
    gridType: 'singlePhase_220',
  },
  {
    id: 'residential-pv-backup',
    name: 'Residencial com FV + backup',
    description: 'Geração fotovoltaica combinada com bateria e backup residencial.',
    desiredFeatures: ['pv', 'backup'],
    gridType: 'splitPhase_220',
  },
  {
    id: 'residential-white-tariff-backup',
    name: 'Residencial com tarifa branca + backup',
    description: 'Bateria para backup e deslocamento de consumo nos horários de tarifa branca.',
    desiredFeatures: ['white_tariff', 'backup'],
    gridType: 'threePhase_380',
  },
];

function smallestHighVoltageBattery(
  batteryCatalog: BatteryCatalogOption[],
  approvedInverterCombos: ApprovedInverterCombo[],
  gridType: NonNullable<ResidentialOptions['gridType']>
) {
  const approvedModels = new Set(
    approvedInverterCombos
      .filter((combo) => combo.gridTopology === gridTopologyFor(gridType) && combo.batteryTopology === 'HV')
      .map((combo) => combo.inverterModel)
  );
  if (approvedModels.size === 0) return null;

  return (
    batteryCatalog
      .filter((battery) => battery.topology === 'HV')
      .filter((battery) => !battery.expansionModel)
      .sort((a, b) => (a.capacityKwh || Number.POSITIVE_INFINITY) - (b.capacityKwh || Number.POSITIVE_INFINITY))
      .find((battery) =>
        approvedInverterCombos.some(
          (combo) =>
            combo.gridTopology === gridTopologyFor(gridType) &&
            combo.batteryTopology === 'HV' &&
            approvedModels.has(combo.inverterModel) &&
            combo.inverterModel.length > 0 &&
            battery.model.length > 0
        )
      ) ?? null
  );
}

function gridTopologyFor(gridType: NonNullable<ResidentialOptions['gridType']>) {
  return {
    singlePhase_220: '1p_220V',
    splitPhase_220: '2p_220V',
    threePhase_220: '3p_220V',
    threePhase_380: '3p_380V',
  }[gridType];
}

function choosePreset(presets: LoadPresetItem[]) {
  return [...presets]
    .filter((preset) => preset.loads.length > 0)
    .sort((a, b) => {
      const aPower = a.loads.reduce((sum, load) => sum + load.powerW * load.qty, 0);
      const bPower = b.loads.reduce((sum, load) => sum + load.powerW * load.qty, 0);
      return aPower - bPower || a.loads.length - b.loads.length;
    })[0] ?? null;
}

export function buildDemoSimulation(
  definition: DemoSimulationDefinition,
  presets: LoadPresetItem[],
  batteryCatalog: BatteryCatalogOption[],
  approvedInverterCombos: ApprovedInverterCombo[]
): DemoSimulationData | null {
  const preset = choosePreset(presets);
  const battery = smallestHighVoltageBattery(batteryCatalog, approvedInverterCombos, definition.gridType);
  if (!preset || !battery) return null;

  const base = { ...defaultResidential };
  const residentialOptions: ResidentialOptions = {
    ...base,
    topology: 'HighVoltage',
    batteryModel: battery.model,
    secondaryBatteryModel: null,
    inverterModel: null,
    minInverterQty: null,
    gridType: definition.gridType,
    loads: preset.loads.map((load, index) => ({
      ...load,
      id: `demo-${definition.id}-${index + 1}`,
      usageFactor: 1,
      voltageV: 220,
      phaseType: 'mono',
      includedInPeak: true,
    })),
    operationHours: 2,
    desiredFeatures: [...definition.desiredFeatures],
    pv: definition.id === 'residential-pv-backup' ? { monthlyConsumptionKwh: 400, hsp: 4.5 } : null,
    whiteTariff:
      definition.id === 'residential-white-tariff-backup'
        ? {
            inputMode: 'basic',
            tariffInputMode: 'manual',
            tariffSource: 'USER',
            totalMonthlyConsumptionKwh: 400,
            pontaConsumptionPercent: 20,
            intermediateConsumptionPercent: 10,
            businessDaysPerMonth: 22,
            pontaWindowHours: 3,
            intermediateWindowHours: 2,
            requiredPowerW: 2500,
            pontaEnergyWh: 800,
            intermediateEnergyWh: 400,
            pontaTariffPerKwh: 1.2,
            intermediateTariffPerKwh: 0.85,
            foraPontaTariffPerKwh: 0.45,
          }
        : null,
  };

  return { residentialOptions };
}
