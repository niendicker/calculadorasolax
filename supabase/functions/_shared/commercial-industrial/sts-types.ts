/** One three-phase STS per critical bus. No parallel cabinets or transient overload. */
export interface CiStsSelection {
  mode: 'auto' | 'manual';
  gridBusScope: 'installation' | 'backup_bus';
  accessoryId: string | null;
  lineVoltageV: 380 | 400;
  frequencyHz: 50 | 60;
  powerFactor: number;
  maxGridPassageKw: number;
}
export interface CiStsSpec {
  accessory_id: string;
  active: boolean;
  rated_current_380v_a: number;
  rated_current_400v_a: number;
  frequency_hz: number[];
  ems_included: boolean;
  reference_document: string;
  revision: string;
}
export interface CiStsEntry extends CiStsSpec { model: string; accessoryActive: boolean }
export interface CiStsRule {
  id: string;
  accessory_id: string;
  pcs_id: string | null;
  bess_product_id: string | null;
  max_pcs: number;
  line_voltage_v: 380 | 400;
  frequency_hz: 50 | 60;
  active: boolean;
  approval_status: 'draft' | 'approved' | 'revoked';
  reference_document: string;
  revision: string;
  communication_profile: string;
  firmware: string;
}
export interface CiStsCatalog { specs: CiStsEntry[]; rules: CiStsRule[] }
export interface CiStsContext {
  catalog: CiStsCatalog;
  target: { pcsId?: string; bessProductId?: string; unitsPerModule: number };
  prices: Record<string, number | undefined>;
  controllerAccessoryId?: string | null;
}
export interface CiStsResult {
  status: 'selected' | 'no_match';
  gridBusScope: 'installation' | 'backup_bus';
  requiredCurrentA: number;
  requiredBackupPowerKw: number;
  requiredGridPowerKw: number;
  lineVoltageV: number;
  powerFactor: number;
  pcsCount: number;
  message: string;
  selected?: { spec: CiStsEntry; compatibility: CiStsRule; quantity: 1; unitPriceBrl: number; totalBrl: number };
}
