/** Catalog references are immutable IDs. Electrical values must be documented by the administrator. */
export interface CiPcsSpec {
  /** Identical independent battery ports; AC ratings below remain PCS totals. */
  port_charge_current_a?: number | null;
  port_discharge_current_a?: number | null;
  port_charge_power_kw?: number | null;
  port_discharge_power_kw?: number | null;
  max_strings_per_port?: number;
  inverter_id: string;
  active: boolean;
  charge_power_kw: number;
  discharge_power_kw: number;
  charge_current_a: number;
  discharge_current_a: number;
  max_parallel_units: number;
  supports_backup: boolean;
}
export interface CiBatterySpec {
  battery_id: string;
  active: boolean;
  unit_kind: 'module' | 'rack' | 'cabinet';
  charge_power_kw: number;
  discharge_power_kw: number;
  charge_current_a: number;
  discharge_current_a: number;
  soc_max_percent: number;
}
export interface CiCompatibilityRule {
  min_ports_per_pcs?: number;
  max_ports_per_pcs?: number;
  supports_solar?:boolean;
  supports_generator?:boolean;
  id: string;
  name: string;
  pcs_id: string;
  battery_id: string;
  active: boolean;
  approval_status: 'draft' | 'approved' | 'revoked';
  min_series: number;
  max_series: number;
  min_parallel_strings: number;
  max_parallel_strings: number;
  min_pcs: number;
  max_pcs: number;
  supports_backup: boolean;
  communication_profile: string;
  pcs_firmware: string;
  battery_firmware: string;
  reference_document: string;
  revision: string;
  controller_accessory_id: string | null;
  controller_quantity_per_pcs: number;
  notes: string;
}
export interface CiPortArrangement { series:number; parallelStrings:number }
export interface CiModularPortBank extends CiPortArrangement {
  batteryCount:number;nominalEnergyKwh:number;voltageMinV:number;voltageMaxV:number;
  chargeCurrentA:number;dischargeCurrentA:number;chargePowerKw:number;dischargePowerKw:number;
}
export interface CiModularSelection {
  portBanks?: CiPortArrangement[];
  connectionModel?: 'independent_ports';
  ports?: { min:number; max:number };
  kind: 'modular';
  compatibilityId: string | null;
  mode: 'fixed' | 'auto';
  pcs: { min: number; max: number };
  series: { min: number; max: number };
  parallel: { min: number; max: number };
}
export interface CiPcsCatalogEntry extends CiPcsSpec {
  gridTypes?: string[];
  maxBatteryQty?: number | null;
  batteryPorts?: number | null;
  maxCurrentPerPortA?: number | null;
  ratedPowerKw?: number | null;
  model: string;
  voltageMinV: number | null;
  voltageMaxV: number | null;
  chargeEfficiencyPercent: number | null;
  dischargeEfficiencyPercent: number | null;
}
export interface CiBatteryCatalogEntry extends CiBatterySpec {
  maxAssociationQty?: number | null;
  maxCurrentA?: number | null;
  model: string;
  capacityKwh: number;
  voltageMinV: number | null;
  voltageMaxV: number | null;
  socMinPercent: number;
  roundTripEfficiencyPercent: number | null;
}
export interface CiModularCatalog {
  pcs: CiPcsCatalogEntry[];
  batteries: CiBatteryCatalogEntry[];
  rules: CiCompatibilityRule[];
  accessories: { id: string; model: string; active: boolean }[];
}
export interface CiModularComposition {
  portBanks?:CiModularPortBank[];
  compatibilityId: string;
  compatibilityName: string;
  revision: string;
  referenceDocument: string;
  communicationProfile: string;
  pcsFirmware: string;
  batteryFirmware: string;
  pcsId: string;
  pcsModel: string;
  pcsCount: number;
  batteryId: string;
  batteryModel: string;
  unitKind: CiBatterySpec['unit_kind'];
  seriesCount: number;
  parallelStringsPerPcs: number;
  portsPerPcs?: number;
  parallelStringsPerPort?: number;
  portChargeCurrentA?: number;
  portDischargeCurrentA?: number;
  portChargePowerKw?: number;
  portDischargePowerKw?: number;
  batteryCount: number;
  chargePowerKw: number;
  dischargePowerKw: number;
  voltageMinV: number;
  voltageMaxV: number;
  items: { productId: string; productType: 'inverter' | 'battery' | 'accessory'; model: string; quantity: number; unitPriceBrl: number; totalBrl: number }[];
}
export interface CiModularPrices { pcsUnitBrl: number; batteryUnitBrl: number; controllerUnitBrl?: number }
