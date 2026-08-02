// Default state shapes shared by multiple store slices — the residential
// slice owns them, but the projects slice also needs them to reset the live
// wizard state back to blank (newProjectDraft, cancelProjectDraft's no-project
// branch, removeProject's "was current" branch).

import { emptyAddress } from '@/lib/address';
import { DESIRED_FEATURE_DEFINITIONS } from '@/lib/desired-features';
import type { DesiredFeatureId, IndustrialOptions, ProjectInfo, ResidentialOptions } from '@/lib/types';

export const defaultProjectInfo: ProjectInfo = {
  name: '',
  clientId: null,
  address: emptyAddress(),
  notes: '',
};

export const defaultResidential: ResidentialOptions = {
  topology: 'HighVoltage',
  batteryModel: null,
  secondaryBatteryModel: null,
  inverterModel: null,
  gridType: 'singlePhase_220',
  loads: [],
  peakCalcMode: 'sum',
  operationHours: 0,
  desiredFeatures: ['backup'],
  whiteTariff: null,
  microgrid: null,
  generator: null,
  pv: null,
  atsPhotoUrl: null,
  atsBackupAcknowledged: false,
  maxPowerPerPhaseW: null,
};

export const defaultIndustrial: IndustrialOptions = {
  gridPowerKw: null,
  pvPowerKwp: null,
  backupPowerKw: null,
  backupHours: null,
  demandCharge: false,
};

const VALID_DESIRED_FEATURE_IDS = new Set(DESIRED_FEATURE_DEFINITIONS.map((feature) => feature.id));

/** Drops any feature id no longer recognized (e.g. 'no_pv', renamed to 'pv')
 * from data that predates the rename — either persisted in localStorage or
 * saved as a project in the database. Without this, a stale id would fail
 * the Edge Function's desiredFeatures validation outright, surfacing as a
 * generic "invalid payload" error with no obvious cause. */
export function sanitizeDesiredFeatures(desiredFeatures: DesiredFeatureId[] | undefined): DesiredFeatureId[] {
  if (!Array.isArray(desiredFeatures)) return [];
  return desiredFeatures.filter((id) => VALID_DESIRED_FEATURE_IDS.has(id));
}
