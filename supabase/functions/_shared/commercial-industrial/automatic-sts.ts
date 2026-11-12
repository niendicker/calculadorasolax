import type { CiBackupConfig } from './types.ts';
import type { CiStsSelection } from './sts-types.ts';

export interface AutomaticStsDefaults {
  lineVoltageV?: number;
  acPowerFactor?: number;
}

/** STS sizing and model selection are automatic from project parameters. */
export function automaticStsSelection(
  saved?: Partial<CiStsSelection> | null,
  defaults?: AutomaticStsDefaults
): CiStsSelection {
  const lineVoltageV =
    saved?.lineVoltageV === 400 || defaults?.lineVoltageV === 400 ? 400 : 380;
  const rawPf = saved?.powerFactor;
  const defaultPf =
    defaults?.acPowerFactor && defaults.acPowerFactor > 0 && defaults.acPowerFactor <= 1
      ? defaults.acPowerFactor
      : 0.92;
  const powerFactor =
    typeof rawPf === 'number' && Number.isFinite(rawPf) && rawPf > 0 && rawPf <= 1
      ? rawPf
      : defaultPf;

  return {
    gridBusScope: saved?.gridBusScope ?? 'installation',
    frequencyHz: saved?.frequencyHz === 50 ? 50 : 60,
    maxGridPassageKw:
      typeof saved?.maxGridPassageKw === 'number' &&
      Number.isFinite(saved.maxGridPassageKw) &&
      saved.maxGridPassageKw >= 0
        ? saved.maxGridPassageKw
        : 0,
    ...saved,
    lineVoltageV,
    powerFactor,
    mode: 'auto',
    accessoryId: null,
  };
}

export function withAutomaticBackupSts(
  backup: CiBackupConfig,
  defaults?: AutomaticStsDefaults
): CiBackupConfig;
export function withAutomaticBackupSts(
  backup: CiBackupConfig | undefined,
  defaults?: AutomaticStsDefaults
): CiBackupConfig | undefined;
export function withAutomaticBackupSts(
  backup: CiBackupConfig | null | undefined,
  defaults?: AutomaticStsDefaults
): CiBackupConfig | null | undefined;
export function withAutomaticBackupSts(
  backup: CiBackupConfig | null | undefined,
  defaults?: AutomaticStsDefaults
): CiBackupConfig | null | undefined {
  if (!backup?.enabled) return backup;
  if (defaults?.lineVoltageV === 220) {
    // 220 V networks do not have native SolaX Nexus Zero STS in catalog (380/400 V only).
    // Omit STS from backup so it does not block calculation; backup power/energy will still be evaluated.
    const { sts: _removed, ...rest } = backup;
    return rest;
  }
  return { ...backup, sts: automaticStsSelection(backup.sts, defaults) };
}
