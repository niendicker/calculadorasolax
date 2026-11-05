// Backup and grid-outage calculation engine — see docs/CI-BACKUP-PLAN.md.
// Pure module: evaluates critical load requirements, power/energy compliance,
// effective autonomy hours and the operational SOC reserve floor needed during
// on-grid dispatch.

import type {
  CiBackupConfig,
  CiBackupResult,
} from './types.ts';
import type { BessProductSpec } from './scenarios.ts';

export interface BackupRequirements {
  requiredContinuousPowerKw: number;
  requiredPeakPowerKw: number;
  requiredEnergyKwh: number;
  autonomyHours: number;
}

/** Computes the continuous power, peak power, and energy required for backup
 * from a declared CiBackupConfig. */
export function computeBackupRequirements(config: CiBackupConfig | null | undefined): BackupRequirements | null {
  if (!config || !config.enabled) return null;

  const safetyFactor = 1 + (Number.isFinite(config.safetyMarginPercent) ? Math.max(0, config.safetyMarginPercent) : 10) / 100;
  const autonomyHours = Number.isFinite(config.autonomyHours) && config.autonomyHours > 0 ? config.autonomyHours : 4;

  let baseContinuousKw = 0;
  let basePeakKw = 0;

  if (config.inputMode === 'detailed' && Array.isArray(config.loads) && config.loads.length > 0) {
    for (const load of config.loads) {
      const qty = Number.isFinite(load.quantity) && load.quantity > 0 ? load.quantity : 1;
      const powerW = Number.isFinite(load.powerW) && load.powerW > 0 ? load.powerW : 0;
      const factor = Number.isFinite(load.usageFactor) && (load.usageFactor as number) > 0 && (load.usageFactor as number) <= 1
        ? (load.usageFactor as number)
        : 1;
      baseContinuousKw += (powerW * qty * factor) / 1000;
      basePeakKw += (powerW * qty) / 1000;
    }
  } else {
    // simple mode or fallback
    baseContinuousKw = Number.isFinite(config.targetPowerKw) && config.targetPowerKw > 0 ? config.targetPowerKw : 0;
    basePeakKw = Number.isFinite(config.targetPeakPowerKw) && (config.targetPeakPowerKw as number) > 0
      ? (config.targetPeakPowerKw as number)
      : baseContinuousKw * 1.2;
  }

  const requiredContinuousPowerKw = baseContinuousKw * safetyFactor;
  const requiredPeakPowerKw = Math.max(requiredContinuousPowerKw, basePeakKw * safetyFactor);
  const requiredEnergyKwh = requiredContinuousPowerKw * autonomyHours;

  return {
    requiredContinuousPowerKw,
    requiredPeakPowerKw,
    requiredEnergyKwh,
    autonomyHours,
  };
}

/** Evaluates a specific BESS candidate (or module quantity) against the backup requirements. */
export function evaluateCandidateBackup(
  bessPowerKw: number,
  bessCapacityKwh: number,
  product: BessProductSpec,
  requirements: BackupRequirements | null
): CiBackupResult {
  if (!requirements) {
    return {
      requiredContinuousPowerKw: 0,
      requiredPeakPowerKw: 0,
      requiredEnergyKwh: 0,
      meetsPower: true,
      meetsEnergy: true,
      effectiveAutonomyHours: 0,
      minModulesForBackup: 0,
      recommendedSocReservePercent: product.socMinPercent,
      status: 'disabled',
    };
  }

  const roundTripEfficiency = (product.dischargeEfficiencyPercent ?? product.efficiencyPercent ?? 100) / 100;
  const usefulCapacityKwh = (bessCapacityKwh * (product.socMaxPercent - product.socMinPercent)) / 100;
  const deliverableEnergyKwh = usefulCapacityKwh * roundTripEfficiency;

  const peakLimitKw = product.modulePeakPowerKw === undefined ? Infinity : product.modulePeakPowerKw * (product.modulePowerKw > 0 ? bessPowerKw / product.modulePowerKw : 0);
  const meetsPower = bessPowerKw >= requirements.requiredContinuousPowerKw - 1e-6 && peakLimitKw >= requirements.requiredPeakPowerKw - 1e-6;
  const meetsEnergy = deliverableEnergyKwh >= requirements.requiredEnergyKwh - 1e-6;

  let effectiveAutonomyHours = 0;
  if (requirements.requiredContinuousPowerKw > 0) {
    effectiveAutonomyHours = deliverableEnergyKwh / requirements.requiredContinuousPowerKw;
  }

  // Calculate minimum modules required
  const singleModuleUsefulDeliverableKwh =
    product.moduleCapacityKwh * ((product.socMaxPercent - product.socMinPercent) / 100) * roundTripEfficiency;
  const minModulesForBackup =
    singleModuleUsefulDeliverableKwh > 0 ? Math.ceil(requirements.requiredEnergyKwh / singleModuleUsefulDeliverableKwh) : 0;

  // Calculate recommended SOC reserve floor for on-grid dispatch
  let recommendedSocReservePercent = product.socMinPercent;
  if (bessCapacityKwh > 0 && requirements.requiredEnergyKwh > 0) {
    const rawReservePercent = (requirements.requiredEnergyKwh / (bessCapacityKwh * roundTripEfficiency)) * 100;
    recommendedSocReservePercent = Math.min(product.socMaxPercent, product.socMinPercent + rawReservePercent);
  }

  let status: CiBackupResult['status'] = 'fully_covered';
  let warningMessage: string | undefined;

  if (!meetsPower) {
    status = 'insufficient_power';
    warningMessage = peakLimitKw < requirements.requiredPeakPowerKw - 1e-6
      ? `Potência disponível para partida (${peakLimitKw.toFixed(1)} kW) insuficiente para o pico crítico (${requirements.requiredPeakPowerKw.toFixed(1)} kW). A composição modular utiliza o limite contínuo, sem presumir sobrecarga transitória.`
      : `Potência do BESS (${bessPowerKw.toFixed(1)} kW) insuficiente para as cargas críticas (${requirements.requiredContinuousPowerKw.toFixed(1)} kW).`;
  } else if (!meetsEnergy) {
    status = 'partially_covered';
    warningMessage = `Autonomia de ${effectiveAutonomyHours.toFixed(1)}h abaixo da meta de ${requirements.autonomyHours}h solicitada (${deliverableEnergyKwh.toFixed(1)}/${requirements.requiredEnergyKwh.toFixed(1)} kWh).`;
  }

  return {
    requiredContinuousPowerKw: requirements.requiredContinuousPowerKw,
    requiredPeakPowerKw: requirements.requiredPeakPowerKw,
    requiredEnergyKwh: requirements.requiredEnergyKwh,
    meetsPower,
    meetsEnergy,
    effectiveAutonomyHours,
    minModulesForBackup,
    recommendedSocReservePercent,
    status,
    warningMessage,
  };
}
