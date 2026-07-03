export type BatteryTopology = 'HighVoltage' | 'LowVoltage';

export type ResidentialGridType =
  | 'singlePhase_220'
  | 'splitPhase_220'
  | 'threePhase_220'
  | 'threePhase_380';

export type MicroGridOptions = 'Gerador' | 'Microinversor' | 'Desabilitada';

export type InstallationType = 'residential' | 'industrial';

// How multiple loads' IP/IN ratios combine into the system's peak apparent power:
// - 'sum': every load surges at once (nominal x IP/IN for all loads, conservative).
// - 'largest-surge': only the single highest-surge load unit starts at a time,
//   everything else runs at nominal power (common generator/inverter sizing rule).
export type PeakCalcMode = 'sum' | 'largest-surge';

export interface SingleLoad {
  id: string;
  name: string;
  powerW: number;
  hoursPerDay: number;
  qty: number;
  /** IP/IN: starting (peak) apparent power divided by nominal apparent power. */
  ipInRatio: number;
}

export interface CatalogItem {
  id: string;
  namePt: string;
  nameEn: string;
  nameZh: string;
  powerW: number;
  category: string;
  /** Default IP/IN for this catalog item, prefilled when added to a project. */
  ipInRatio: number;
}

export interface ProductDocument {
  name: string;
  url: string;
}

export interface ResidentialOptions {
  topology: BatteryTopology | null;
  batteryModel: string | null;
  inverterModel: string | null;
  gridType: ResidentialGridType | null;
  loads: SingleLoad[];
  peakCalcMode: PeakCalcMode;
  microGrid: MicroGridOptions | null;
}

export interface ProjectInfo {
  name: string;
  clientId: string | null;
  address: string;
  notes: string;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  document: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface IndustrialOptions {
  gridPowerKw: number | null;
  pvPowerKwp: number | null;
  backupPowerKw: number | null;
  backupHours: number | null;
  demandCharge: boolean;
}

export interface Solution {
  inverterId: string;
  inverterModel: string;
  inverterQty?: number;
  inverterRatedPowerW?: number;
  inverterPeakPowerW?: number;
  batteryId: string;
  batteryModel: string;
  batteryQty: number;
  batteryPowerW?: number;
  availableEnergyWh?: number;
  pvPowerKw: number;
  accessories: string[];
  solutionId?: string;
  solutionCode?: string;
  sourceFile?: string;
  comments?: string[];
}

export interface SavedProject {
  id: string;
  name: string;
  clientId: string | null;
  address: string;
  notes: string;
  updatedAt: string;
  residentialOptions: ResidentialOptions;
  solution: Solution | null;
}

export interface SimulationNode {
  pvPowerW: number;
  batteryPowerW: number;
  gridPowerW: number;
  loadPowerW: number;
  batterySoc: number;
}
