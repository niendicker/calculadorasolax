export type BatteryTopology = 'HighVoltage' | 'LowVoltage';

/** Converts the wizard-facing BatteryTopology to the catalog/DB storage
 * format used by battery/inverter/solution rows (see admin/types.ts
 * CatalogBatteryTopology and supabase/functions/calculate-residential/logic.ts
 * batteryTopologyMap, which mirrors this exact mapping on the Deno side). */
export const batteryTopologyToCatalog: Record<BatteryTopology, 'HV' | 'LV'> = {
  HighVoltage: 'HV',
  LowVoltage: 'LV',
};

/** Inverse of batteryTopologyToCatalog — converts a catalog/DB 'HV' | 'LV'
 * value back to the wizard-facing BatteryTopology. */
export const catalogToBatteryTopology: Record<'HV' | 'LV', BatteryTopology> = {
  HV: 'HighVoltage',
  LV: 'LowVoltage',
};

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
 * ('pv', 'white_tariff') change sizing/report behavior directly. */
export type DesiredFeatureId =
  | 'backup'
  | 'external_ats'
  | 'microgrid'
  | 'external_generator'
  | 'pv'
  | 'white_tariff';

/** Extra sizing/report inputs only used when 'white_tariff' is a desired feature.
 * Tarifa Branca has three billing windows — ponta (peak), intermediária and
 * fora ponta (off-peak) — each with its own R$/kWh rate. The battery is
 * sized to cover both expensive windows (ponta + intermediária energy); fora
 * ponta energy is never stored directly, it's derived as (total monthly
 * consumption − ponta − intermediária) wherever it's needed (see
 * calculateTariffSavings in helpers.ts). */
export interface WhiteTariffConfig {
  /** Power the system must sustain during the white-tariff peak (ponta) window (W). */
  requiredPowerW: number;
  /** Energy the battery must supply during the ponta window (Wh). */
  pontaEnergyWh: number;
  /** Energy the battery must supply during the intermediária window (Wh). */
  intermediateEnergyWh: number;
  /** When true, add the standard backup-energy reserve on top of pontaEnergyWh + intermediateEnergyWh. */
  includeBackupReserve: boolean;
  /** Ponta (peak) tariff (R$/kWh), as billed. */
  pontaTariffPerKwh: number;
  /** Intermediária tariff (R$/kWh), as billed. */
  intermediateTariffPerKwh: number;
  /** Fora ponta (off-peak) tariff (R$/kWh), as billed. The spreads used for
   * the report's savings estimate are derived as pontaTariffPerKwh -
   * foraPontaTariffPerKwh and intermediateTariffPerKwh - foraPontaTariffPerKwh. */
  foraPontaTariffPerKwh: number;
}

/** Extra sizing inputs only used when 'microgrid' is a desired feature — describes
 * the existing on-grid (grid-tied) system that will be connected alongside the
 * new hybrid system. */
export interface MicrogridConfig {
  /** Voltage of the existing on-grid system (V). Informational only — not
   * validated against the recommended solution. */
  voltageV: number;
  /** Number of phases of the existing on-grid system. */
  onGridPhases: 1 | 2 | 3;
  /** Apparent power of the existing on-grid system (VA). */
  onGridApparentPowerVA: number;
  /** When true, microgrid compatibility is enforced even if it forces a bigger
   * system; when false, the app offers a choice between the smallest solution
   * and the smallest one that also supports microgrid (see Solution.microgridAlternative).
   * The wizard always creates new configs with this set to true — false only
   * ever occurs in projects saved before that was the case. */
  isFundamentalRequirement: boolean;
  /** Optional reference photo of the existing on-grid installation, uploaded by the user. */
  photoUrl: string | null;
  /** User confirms they're aware the on-grid system's power must be lower than
   * the solution's inverter and battery power. */
  powerNoticeAcknowledged: boolean;
}

/** Extra report inputs only used when 'external_generator' is a desired feature.
 * Informational only — does not affect which solution gets recommended. */
export interface GeneratorConfig {
  voltageV: number;
  phases: 1 | 2 | 3;
  apparentPowerVA: number;
  /** Optional reference photo of the generator, uploaded by the user. */
  photoUrl: string | null;
  /** User confirms they're aware the external generator needs its own ATS switch. */
  ownAtsAcknowledged: boolean;
}

/** Extra sizing inputs only used when 'pv' is a desired feature — sizes the
 * photovoltaic array from the customer's own average consumption and the
 * installation site's peak sun hours, instead of the load-based dailyKwh used
 * for battery/inverter sizing. */
export interface PvConfig {
  /** Average monthly energy consumption (kWh/month), as billed — also the
   * "total consumption" used by Tarifa Branca's savings estimate, when that
   * feature is also enabled, to split into higher/lower-tariff portions. */
  monthlyConsumptionKwh: number;
  /** HSP — Horas de Sol Pico (peak sun hours/day) at the installation site. */
  hsp: number;
}

// How multiple loads' IP/IN ratios combine into the system's peak apparent power:
// - 'sum': every load surges at once (nominal x IP/IN for all loads, conservative).
// - 'largest-surge': only the single highest-surge load unit starts at a time,
//   everything else runs at nominal power (common generator/inverter sizing rule).
// - 'select': only loads the user flags via `includedInPeak` are summed (like
//   'sum', but restricted to a user-chosen subset of loads).
export type PeakCalcMode = 'sum' | 'largest-surge' | 'select';

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
  qty: number;
  /** IP/IN: starting (peak) apparent power divided by nominal apparent power. */
  ipInRatio: number;
  /** Fraction (0-1) of the shared backup operation time (ResidentialOptions.
   * operationHours) this load is actually drawing power (e.g. a
   * thermostat-cycled compressor). Scales the energy (kWh) consumed, not the
   * peak power; only meaningful for loads added to a project's backup list,
   * not for catalog entries. Defaults to 1 (runs the whole time) for loads
   * saved before this field existed. Only used when usageMode is 'fraction'
   * (or unset — the default). */
  usageFactor?: number;
  /** How usageFactor/fixedHours is interpreted for this load's energy
   * (kWh/day) calculation. 'fraction' (default, incl. when unset) scales the
   * shared operationHours by usageFactor. 'fixed' ignores the shared
   * operationHours entirely and uses fixedHours directly — for a load whose
   * own run time is known and doesn't track the backup event's duration
   * (e.g. a generator's own fixed daily runtime). */
  usageMode?: 'fraction' | 'fixed';
  /** Hours/day this load runs, independent of the shared operationHours —
   * only used when usageMode is 'fixed'. */
  fixedHours?: number;
  /** Operating voltage; defaults to 220V for loads saved before this field existed. */
  voltageV?: LoadVoltage;
  /** Single- or three-phase; defaults to 'mono' for loads saved before this field existed. */
  phaseType?: LoadPhaseType;
  /** Phase assignment, only meaningful for mono loads on a multi-phase network. */
  phase?: LoadPhase;
  /** Second phase, set when a mono load is wired phase-to-phase (e.g. a 220V
   * load on a three-phase 220V network) instead of phase-to-neutral. */
  phase2?: LoadPhase | null;
  /** Whether this load counts toward the system's peak apparent power when
   * peakCalcMode is 'select'. Defaults to true for loads saved before this
   * field existed. Irrelevant for 'sum' and 'largest-surge', which always
   * consider every load. */
  includedInPeak?: boolean;
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

/** A load bundled inside a LoadPresetItem, applied all at once. */
export interface LoadPresetLoad {
  name: string;
  powerW: number;
  qty: number;
  ipInRatio: number;
}

/** A one-click bundle of loads, admin-managed in the `load_presets` table. */
export interface LoadPresetItem {
  id: string;
  name: string;
  description: string;
  loads: LoadPresetLoad[];
}

/** A user's own one-click load bundle — kept separate from the admin-managed
 * global LoadPresetItem list, capped at ACCOUNT_LIMITS.userPresets. */
export interface UserLoadPresetItem {
  id: string;
  name: string;
  description: string;
  loads: LoadPresetLoad[];
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

/** Per-category sell margin (%), applied on top of the user's own stock
 * price when computing a solution's total cost — see calculateSystemCost.
 * Services have no separate cost basis, so they're not included here. */
export interface MarginSettings {
  inverterPercent: number;
  batteryPercent: number;
  accessoryPercent: number;
}

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

/** A freely-named service (e.g. "Instalação", "Frete") the user defines with
 * their own price — unlike UserStockItem, not tied to any admin catalog
 * product. Added to a project's `services` list to compose the final
 * solution cost. */
export interface UserServiceItem {
  id: string;
  name: string;
  unitValue: number;
  createdAt: string;
  updatedAt: string;
}

/** One service line on a saved project — references a UserServiceItem by id
 * with the quantity chosen for this project, snapshotting the service's name
 * at the time it was added so the line still reads sensibly even if the
 * service is later renamed or removed from the user's catalog (its price
 * then can't be resolved, same as an accessory/product missing from
 * userStockItems). */
export interface ProjectServiceLine {
  serviceId: string;
  name: string;
  qty: number;
}

export interface ResidentialOptions {
  topology: BatteryTopology | null;
  batteryModel: string | null;
  /** Optional second battery model to compare a solution against, shown as a
   * second tab in the Solução summary alongside batteryModel's. Same
   * topology as batteryModel (there's only one `topology` field). */
  secondaryBatteryModel: string | null;
  inverterModel: string | null;
  gridType: ResidentialGridType | null;
  loads: SingleLoad[];
  peakCalcMode: PeakCalcMode;
  /** Shared operation time (h) applied equally to every load when computing
   * backup energy — replaces each load's own hoursPerDay (removed). Each
   * load's usageFactor still scales its share of that time. */
  operationHours: number;
  desiredFeatures: DesiredFeatureId[];
  /** Only meaningful when 'white_tariff' is in desiredFeatures. */
  whiteTariff: WhiteTariffConfig | null;
  /** Only meaningful when 'microgrid' is in desiredFeatures. */
  microgrid: MicrogridConfig | null;
  /** Only meaningful when 'external_generator' is in desiredFeatures. */
  generator: GeneratorConfig | null;
  /** Only meaningful when 'pv' is in desiredFeatures. */
  pv: PvConfig | null;
  /** Optional reference photo of the ATS panel, uploaded by the user. Only meaningful when 'external_ats' is in desiredFeatures. */
  atsPhotoUrl: string | null;
  /** User confirms they're aware the ATS externo must be used for full backup.
   * Only meaningful when 'external_ats' is in desiredFeatures. */
  atsBackupAcknowledged: boolean;
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

/** One accessory line in a computed Solution, carrying the metadata from
 * whichever accessory_rules row matched it (or system defaults for
 * accessories baked directly into the approved solution, with no rule). */
export interface AccessoryLine {
  model: string;
  qty: number;
  optional: boolean;
  appliesTo: 'inverter' | 'battery' | 'system';
  comment: string | null;
  /** True when this item ships bundled with the inverter (e.g. a WiFi dongle
   * or CTs that come in the box) rather than being separately required/
   * optional — shown with its own "Incluso" badge instead. */
  bundled: boolean;
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
  /** Battery ports in use per inverter — each port is its own physical
   * string and needs its own Master unit (see batteryQuantityBreakdown). */
  batteryPortsUsed?: number;
  batteryPowerW?: number;
  availableEnergyWh?: number;
  /** null unless the customer opted into PV sizing ('pv' desired feature). Capped
   * at the recommended inverter's rated power scaled by its pv_oversizing_percent,
   * so the suggestion never exceeds what the inverter allows. */
  pvPowerKw: number | null;
  /** Estimated monthly generation (kWh) from pvPowerKw at the site's HSP —
   * present whenever pvPowerKw is. A theoretical-max figure (pvPowerKw × HSP ×
   * 30), not adjusted for self-consumption. */
  pvMonthlyGenerationKwh?: number | null;
  accessories: AccessoryLine[];
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
  services: ProjectServiceLine[];
}

export interface SimulationNode {
  pvPowerW: number;
  batteryPowerW: number;
  gridPowerW: number;
  loadPowerW: number;
  batterySoc: number;
}
