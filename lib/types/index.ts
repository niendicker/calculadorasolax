export type BatteryTopology = 'HighVoltage' | 'LowVoltage';

export type ResidentialGridType =
  | 'singlePhase_220'
  | 'splitPhase_220'
  | 'threePhase_220'
  | 'threePhase_380';

export type MicroGridOptions = 'Gerador' | 'Microinversor' | 'Desabilitada';

export type InstallationType = 'residential' | 'industrial';

export interface SingleLoad {
  id: string;
  name: string;
  powerW: number;
  hoursPerDay: number;
  qty: number;
}

export interface CatalogItem {
  id: string;
  namePt: string;
  nameEn: string;
  nameZh: string;
  powerW: number;
  category: string;
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
  microGrid: MicroGridOptions | null;
}

export interface ProjectInfo {
  name: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientDocument: string;
  address: string;
  notes: string;
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
  clientName: string;
  updatedAt: string;
  projectInfo: ProjectInfo;
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
