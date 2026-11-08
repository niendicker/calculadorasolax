import type { CiBackupConfig } from './types.ts';
import type { CiStsSelection } from './sts-types.ts';

/** Model selection is automatic; electrical inputs remain explicit project data. */
export function automaticStsSelection(saved?: CiStsSelection): CiStsSelection {
  return {
    gridBusScope: 'installation',
    lineVoltageV: 380,
    frequencyHz: 60,
    powerFactor: 0,
    maxGridPassageKw: 0,
    ...saved,
    mode: 'auto',
    accessoryId: null,
  };
}

export function withAutomaticBackupSts(backup: CiBackupConfig): CiBackupConfig;
export function withAutomaticBackupSts(backup: CiBackupConfig | undefined): CiBackupConfig | undefined;
export function withAutomaticBackupSts(backup: CiBackupConfig | null | undefined): CiBackupConfig | null | undefined;
export function withAutomaticBackupSts(backup: CiBackupConfig | null | undefined): CiBackupConfig | null | undefined {
  return backup?.enabled ? { ...backup, sts: automaticStsSelection(backup.sts) } : backup;
}
