// Default state shapes shared by multiple store slices — the residential
// slice owns them, but the projects slice also needs them to reset the live
// wizard state back to blank (newProjectDraft, cancelProjectDraft's no-project
// branch, removeProject's "was current" branch).

import { emptyAddress } from '@/lib/address';
import { DESIRED_FEATURE_DEFINITIONS } from '@/lib/desired-features';
import type { DesiredFeatureId, MicrogridConfig, ProjectInfo, ResidentialOptions } from '@/lib/types';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';

export const defaultProjectInfo: ProjectInfo = {
  name: '',
  clientId: null,
  address: emptyAddress(),
  notes: '',
};

/** Mirrors the shared engine's DEFAULT_FINANCIAL_ASSUMPTIONS/plan section 11
 * values (12%/10 years) — inlined rather than imported as a runtime value
 * from supabase/functions/_shared/, to keep this file's only coupling to
 * that tree at the type level (see the `import type` above). If the shared
 * defaults ever change, update both. */
export const defaultCiOptions: CommercialIndustrialOptions = {
  loadCurve: null,
  tariff: null,
  bessProductId: null,
  strategy: 'HYBRID',
  sizing: { mode: 'fixed', moduleCount: 1, minModules: null, maxModules: null },
  financialAssumptions: { discountRatePercent: 12, analysisHorizonYears: 10, annualEnergyInflationPercent: 0, monthsPerYear: 12 },
  rankingCriterion: 'PAYBACK',
};

export const defaultResidential: ResidentialOptions = {
  topology: 'HighVoltage',
  batteryModel: null,
  secondaryBatteryModel: null,
  inverterModel: null,
  minInverterQty: null,
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

const VALID_DESIRED_FEATURE_IDS = new Set(DESIRED_FEATURE_DEFINITIONS.map((feature) => feature.id));

/** Drops any feature id no longer recognized (e.g. 'no_pv', renamed to 'pv')
 * from data that predates the rename — either persisted in localStorage or
 * saved as a project in the database. Without this, a stale id would fail
 * the Edge Function's desiredFeatures validation outright, surfacing as a
 * generic "invalid payload" error with no obvious cause. */
export function sanitizeDesiredFeatures(desiredFeatures: DesiredFeatureId[] | undefined): DesiredFeatureId[] {
  if (!Array.isArray(desiredFeatures)) return [];
  const sanitized = desiredFeatures.filter((id) => VALID_DESIRED_FEATURE_IDS.has(id));
  // Microrrede and external generator are mutually exclusive. Keep the
  // microgrid entry when repairing old persisted projects with both flags;
  // the UI offers an explicit confirmation when the user makes this change.
  return sanitized.includes('microgrid')
    ? sanitized.filter((id) => id !== 'external_generator')
    : sanitized;
}

/** Projects saved before the bifásico on-grid option was removed may carry
 * onGridPhases: 2 — always a 220V monofásico wired fase-fase, so it maps to 1
 * with the same per-phase load (normalizeOnGridPhases in
 * supabase/functions/_shared/microgrid-connection.ts). */
export function sanitizeMicrogridConfig(microgrid: MicrogridConfig | null | undefined): MicrogridConfig | null {
  if (!microgrid) return null;
  return { ...microgrid, onGridPhases: microgrid.onGridPhases === 3 ? 3 : 1 };
}
