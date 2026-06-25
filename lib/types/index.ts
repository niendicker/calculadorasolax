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

export interface ResidentialOptions {
  topology: BatteryTopology | null;
  gridType: ResidentialGridType | null;
  loads: SingleLoad[];
  microGrid: MicroGridOptions | null;
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
  batteryId: string;
  batteryModel: string;
  batteryQty: number;
  pvPowerKw: number;
  accessories: string[];
}

export interface SimulationNode {
  pvPowerW: number;
  batteryPowerW: number;
  gridPowerW: number;
  loadPowerW: number;
  batterySoc: number;
}
