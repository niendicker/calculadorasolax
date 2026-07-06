export type BatteryTopology = 'HighVoltage' | 'LowVoltage';

export type ResidentialGridType =
  | 'singlePhase_220'
  | 'splitPhase_220'
  | 'threePhase_220'
  | 'threePhase_380';

export type InstallationType = 'residential' | 'industrial';

/** Flags describing a product's technical capabilities, set by admins on the
 * catalog and matched against a customer's desired features when sizing. */
export type InverterFlag = 'microgrid' | 'super_backup' | 'dual_voltage' | 'external_ats' | 'external_generator';

export type BatteryFlag = 'ip65' | 'ip66';

/** Functional requirements the customer can opt into during sizing. Some map
 * 1:1 to an InverterFlag (see DESIRED_FEATURE_DEFINITIONS in lib/desired-features.ts)
 * and are enforced as a hard filter on the recommended inverter; others
 * ('no_pv', 'white_tariff') change sizing/report behavior directly. */
export type DesiredFeatureId =
  | 'external_ats'
  | 'microgrid'
  | 'external_generator'
  | 'no_pv'
  | 'white_tariff';

/** Extra sizing/report inputs only used when 'white_tariff' is a desired feature. */
export interface WhiteTariffConfig {
  /** Power the system must sustain during the white-tariff peak window (W). */
  requiredPowerW: number;
  /** Energy the battery must supply during the peak window (Wh). */
  requiredEnergyWh: number;
  /** When true, add the standard backup-energy reserve on top of requiredEnergyWh. */
  includeBackupReserve: boolean;
  /** Price difference between peak and off-peak tariff (R$/kWh), used only for the report's savings estimate. */
  tariffSpreadPerKwh: number;
}

/** Extra sizing inputs only used when 'microgrid' is a desired feature — describes
 * the existing on-grid (grid-tied) system that will be connected alongside the
 * new hybrid system. */
export interface MicrogridConfig {
  /** Number of phases of the existing on-grid system. */
  onGridPhases: 1 | 2 | 3;
  /** Apparent power of the existing on-grid system (VA). */
  onGridApparentPowerVA: number;
  /** When true, microgrid compatibility is enforced even if it forces a bigger
   * system; when false, the app offers a choice between the smallest solution
   * and the smallest one that also supports microgrid (see Solution.microgridAlternative). */
  isFundamentalRequirement: boolean;
  /** Optional reference photo of the existing on-grid installation, uploaded by the user. */
  photoUrl: string | null;
}

/** Extra report inputs only used when 'external_generator' is a desired feature.
 * Informational only — does not affect which solution gets recommended. */
export interface GeneratorConfig {
  voltageV: number;
  phases: 1 | 2 | 3;
  apparentPowerVA: number;
  /** Optional reference photo of the generator, uploaded by the user. */
  photoUrl: string | null;
}

// How multiple loads' IP/IN ratios combine into the system's peak apparent power:
// - 'sum': every load surges at once (nominal x IP/IN for all loads, conservative).
// - 'largest-surge': only the single highest-surge load unit starts at a time,
//   everything else runs at nominal power (common generator/inverter sizing rule).
export type PeakCalcMode = 'sum' | 'largest-surge';

/** Operating voltage of a single load, in volts. */
export type LoadVoltage = 110 | 220 | 380;

/** Whether a load draws from a single phase or from all three. */
export type LoadPhaseType = 'mono' | 'trifasica';

/** Which phase a single-phase load is wired to, for phase-balance tracking. */
export type LoadPhase = 'L1' | 'L2' | 'L3';

export interface SingleLoad {
  id: string;
  name: string;
  powerW: number;
  hoursPerDay: number;
  qty: number;
  /** IP/IN: starting (peak) apparent power divided by nominal apparent power. */
  ipInRatio: number;
  /** Operating voltage; defaults to 220V for loads saved before this field existed. */
  voltageV?: LoadVoltage;
  /** Single- or three-phase; defaults to 'mono' for loads saved before this field existed. */
  phaseType?: LoadPhaseType;
  /** Phase assignment, only meaningful for mono loads on a multi-phase network. */
  phase?: LoadPhase;
  /** Second phase, set when a mono load is wired phase-to-phase (e.g. a 220V
   * load on a three-phase 220V network) instead of phase-to-neutral. */
  phase2?: LoadPhase | null;
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

/** A load a user added manually, saved for reuse — kept separate from the
 * admin-managed global CatalogItem list. */
export interface UserLoadCatalogItem {
  id: string;
  name: string;
  powerW: number;
  ipInRatio: number;
  createdAt: string;
  updatedAt: string;
}

export type StockProductType = 'inverter' | 'battery' | 'accessory';

/** A catalog product the user added to their personal price list, with a
 * value they set themselves — not a physical stock (no quantity tracking). */
export interface UserStockItem {
  id: string;
  productType: StockProductType;
  productModel: string;
  unitValue: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResidentialOptions {
  topology: BatteryTopology | null;
  batteryModel: string | null;
  inverterModel: string | null;
  gridType: ResidentialGridType | null;
  loads: SingleLoad[];
  peakCalcMode: PeakCalcMode;
  desiredFeatures: DesiredFeatureId[];
  /** Only meaningful when 'white_tariff' is in desiredFeatures. */
  whiteTariff: WhiteTariffConfig | null;
  /** Only meaningful when 'microgrid' is in desiredFeatures. */
  microgrid: MicrogridConfig | null;
  /** Only meaningful when 'external_generator' is in desiredFeatures. */
  generator: GeneratorConfig | null;
  /** Optional reference photo of the ATS panel, uploaded by the user. Only meaningful when 'external_ats' is in desiredFeatures. */
  atsPhotoUrl: string | null;
  /** Max power allowed per phase (W); null uses the suggested default (inverter power / phase count). */
  maxPowerPerPhaseW: number | null;
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
  /** null when the customer opted out of PV sizing ('no_pv' desired feature). */
  pvPowerKw: number | null;
  accessories: string[];
  solutionId?: string;
  solutionCode?: string;
  sourceFile?: string;
  comments?: string[];
  /** Present only when 'microgrid' is selected as a non-fundamental requirement
   * and the microgrid-compatible solution differs from this one — the primary
   * Solution is the "Versão Econômica", this is the "Versão c/ Microrrede". */
  microgridAlternative?: Omit<Solution, 'microgridAlternative'>;
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
