import type { BatteryCatalogOption, ApprovedInverterCombo, InverterCatalogOption } from '@/components/app/types';
import { totalDailyKwh, totalNominalW, totalPeakW } from '@/lib/store/wizard-calculations';
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
  approvedInverterCombos: ApprovedInverterCombo[],
  inverterCatalog: InverterCatalogOption[] = []
): DemoSimulationData | null {
  const preset = choosePreset(presets);
  if (!preset) return null;

  const base = { ...defaultResidential };
  const preliminaryOptions: ResidentialOptions = {
    ...base,
    topology: 'HighVoltage',
    batteryModel: null,
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
            pontaWindowHours: 2.5,
            intermediateWindowHours: 0.5,
            requiredPowerW: 2500,
            pontaEnergyWh: 800,
            intermediateEnergyWh: 400,
            pontaTariffPerKwh: 1.2,
            intermediateTariffPerKwh: 0.85,
            foraPontaTariffPerKwh: 0.45,
          }
        : null,
  };

  const nominalW = totalNominalW(preliminaryOptions.loads);
  const peakW = totalPeakW(preliminaryOptions.loads, preliminaryOptions.peakCalcMode);
  const dailyKwh = totalDailyKwh(preliminaryOptions.loads, preliminaryOptions.operationHours);
  const whitePowerW = preliminaryOptions.whiteTariff?.requiredPowerW ?? 0;
  const targetRatedPowerW = Math.max(
    preliminaryOptions.desiredFeatures.includes('backup') ? nominalW : 0,
    preliminaryOptions.desiredFeatures.includes('white_tariff') ? whitePowerW : 0
  );
  const targetPeakPowerW = Math.max(
    preliminaryOptions.desiredFeatures.includes('backup') ? peakW : 0,
    preliminaryOptions.desiredFeatures.includes('white_tariff') ? whitePowerW : 0
  );
  const targetEnergyWh =
    (preliminaryOptions.desiredFeatures.includes('backup') ? dailyKwh * 1000 : 0) +
    (preliminaryOptions.whiteTariff
      ? preliminaryOptions.whiteTariff.pontaEnergyWh + preliminaryOptions.whiteTariff.intermediateEnergyWh
      : 0);

  const candidateRows = approvedInverterCombos
    .filter((combo) => combo.gridTopology === gridTopologyFor(definition.gridType) && combo.batteryTopology === 'HV')
    .filter((combo) =>
      (combo.ratedPowerW ?? 0) >= targetRatedPowerW &&
      (combo.peakPowerW ?? 0) >= targetPeakPowerW &&
      (combo.batteryPowerW ?? 0) >= targetRatedPowerW &&
      (combo.availableEnergyWh ?? 0) >= targetEnergyWh
    )
    .filter((combo) => {
      return preliminaryOptions.desiredFeatures.every((feature) => {
        if (feature === 'pv') {
          const inverter = inverterCatalog.find((item) => item.model === combo.inverterModel);
          const desiredPvW = ((preliminaryOptions.pv?.monthlyConsumptionKwh ?? 0) / 30 / Math.max(1, preliminaryOptions.pv?.hsp ?? 1)) * 1000;
          const oversizing = 1 + (inverter?.pvOversizingPercent ?? 100) / 100;
          return Boolean(inverter) && (combo.ratedPowerW ?? 0) * oversizing >= desiredPvW;
        }
        return true;
      });
    })
    .sort((a, b) =>
      (a.ratedPowerW ?? Number.POSITIVE_INFINITY) - (b.ratedPowerW ?? Number.POSITIVE_INFINITY) ||
      (a.availableEnergyWh ?? Number.POSITIVE_INFINITY) - (b.availableEnergyWh ?? Number.POSITIVE_INFINITY) ||
      (a.batteryQuantity ?? Number.POSITIVE_INFINITY) - (b.batteryQuantity ?? Number.POSITIVE_INFINITY)
    );

  const candidate = candidateRows[0];
  const battery = candidate
    ? batteryCatalog.find((item) => item.model === candidate.batteryModel && item.topology === 'HV')
    : null;
  if (!candidate || !battery) return null;

  const residentialOptions: ResidentialOptions = {
    ...preliminaryOptions,
    batteryModel: battery.model,
  };

  return { residentialOptions };
}
