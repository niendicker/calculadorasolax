import { portBackupDuration, repeatRuntimePorts } from './battery-ports.ts';
// Backup and grid-outage calculation engine — see docs/CI-BACKUP-PLAN.md.
// Pure module: evaluates critical load requirements, power/energy compliance,
// effective autonomy hours and the operational SOC reserve floor needed during
// on-grid dispatch.

import type {
  CiBackupConfig,
  CiBackupResult,
  LoadCurve,
} from './types.ts';
import { resolveBackupCurve } from './backup-curve.ts';
import type { BessProductSpec } from './scenarios.ts';

export interface BackupRequirements {
  powerProfile?: {powerKw:number;durationHours:number}[];
  requiredContinuousPowerKw: number;
  requiredPeakPowerKw: number;
  requiredEnergyKwh: number;
  autonomyHours: number;
}

/** Computes the continuous power, peak power, and energy required for backup
 * from a declared CiBackupConfig. */
export function computeBackupRequirements(config: CiBackupConfig | null | undefined, curve?: LoadCurve | null): BackupRequirements | null {
  if (!config || !config.enabled) return null;

  const safetyFactor = 1 + (Number.isFinite(config.safetyMarginPercent) ? Math.max(0, config.safetyMarginPercent) : 10) / 100;
  if (config.curveSelection) {
    const profile = resolveBackupCurve(config.curveSelection, curve);
    return {
      requiredContinuousPowerKw: profile.continuousPowerKw * safetyFactor,
      requiredPeakPowerKw: Math.max(profile.requiredPeakKw, config.targetPeakPowerKw ?? 0) * safetyFactor,
      requiredEnergyKwh: profile.energyKwh * safetyFactor,
      autonomyHours: profile.durationHours,
      ...(config.curveSelection.method==='profile'?{powerProfile:profile.powerProfileKw.map(powerKw=>({powerKw:powerKw*safetyFactor,durationHours:curve!.resolutionMinutes/60}))}:{}),
    };
  }
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

  // Backup never assumes transient overload, including integrated BESS.
  const peakLimitKw = bessPowerKw;
  const meetsPower = bessPowerKw >= requirements.requiredContinuousPowerKw - 1e-6 && peakLimitKw >= requirements.requiredPeakPowerKw - 1e-6;
  let meetsEnergy = deliverableEnergyKwh >= requirements.requiredEnergyKwh - 1e-6;

  let effectiveAutonomyHours = 0;
  if (requirements.powerProfile) {
    let remaining=deliverableEnergyKwh;
    for(const interval of requirements.powerProfile){
      const supported=interval.powerKw>0?Math.min(interval.durationHours,Math.max(0,remaining)/interval.powerKw):interval.durationHours;
      effectiveAutonomyHours+=supported;
      remaining-=supported*interval.powerKw;
      if(supported<interval.durationHours-1e-9)break;
    }
  } else if (requirements.requiredEnergyKwh > 0) {
    effectiveAutonomyHours = requirements.autonomyHours * deliverableEnergyKwh / requirements.requiredEnergyKwh;
  }

  // Calculate minimum modules required
  const singleModuleUsefulDeliverableKwh =
    product.moduleCapacityKwh * ((product.socMaxPercent - product.socMinPercent) / 100) * roundTripEfficiency;
  let minModulesForBackup =
    singleModuleUsefulDeliverableKwh > 0 ? Math.ceil(requirements.requiredEnergyKwh / singleModuleUsefulDeliverableKwh) : 0;

  // Calculate recommended SOC reserve floor for on-grid dispatch
  let recommendedSocReservePercent = product.socMinPercent;
  if (bessCapacityKwh > 0 && requirements.requiredEnergyKwh > 0) {
    const rawReservePercent = (requirements.requiredEnergyKwh / (bessCapacityKwh * roundTripEfficiency)) * 100;
    recommendedSocReservePercent = Math.min(product.socMaxPercent, product.socMinPercent + rawReservePercent);
  }

  if(product.ports?.length){
    const ports=repeatRuntimePorts(product.ports,Math.max(1,Math.round(bessCapacityKwh/product.moduleCapacityKwh)));
    const profile=requirements.powerProfile??[{powerKw:requirements.requiredContinuousPowerKw,durationHours:requirements.autonomyHours}];
    const full=portBackupDuration(ports,product.socMaxPercent,product.socMinPercent,product.socMaxPercent,roundTripEfficiency,bessPowerKw,profile);
    meetsEnergy=meetsEnergy&&full.complete;
    effectiveAutonomyHours=full.hours;
    if(!requirements.powerProfile&&requirements.requiredContinuousPowerKw>0){
      const upper=deliverableEnergyKwh/requirements.requiredContinuousPowerKw;
      effectiveAutonomyHours=portBackupDuration(ports,product.socMaxPercent,product.socMinPercent,product.socMaxPercent,roundTripEfficiency,bessPowerKw,[{powerKw:requirements.requiredContinuousPowerKw,durationHours:upper}]).hours;
    }
    // Identical copies can be tested without expanding the topology: each
    // copy receives a proportional share of the critical load profile.
    const supportsCopies=(count:number)=>portBackupDuration(product.ports!,product.socMaxPercent,product.socMinPercent,product.socMaxPercent,roundTripEfficiency,product.modulePowerKw,profile.map(block=>({...block,powerKw:block.powerKw/count}))).complete;
    let lower=Math.max(1,minModulesForBackup,Math.ceil(requirements.requiredPeakPowerKw/product.modulePowerKw));
    let upper=lower;
    while(!supportsCopies(upper)&&upper<Number.MAX_SAFE_INTEGER)upper=Math.min(Number.MAX_SAFE_INTEGER,upper*2);
    while(lower<upper){const middle=Math.floor((lower+upper)/2);if(supportsCopies(middle))upper=middle;else lower=middle+1;}
    minModulesForBackup=upper;
    if(meetsEnergy){
      let low=product.socMinPercent,high=product.socMaxPercent;
      for(let i=0;i<26;i++){
        const mid=(low+high)/2;
        if(portBackupDuration(ports,mid,product.socMinPercent,product.socMaxPercent,roundTripEfficiency,bessPowerKw,profile).complete)high=mid;else low=mid;
      }
      recommendedSocReservePercent=Math.max(recommendedSocReservePercent,high);
    }else recommendedSocReservePercent=product.socMaxPercent;
  }

  let status: CiBackupResult['status'] = 'fully_covered';
  let warningMessage: string | undefined;

  if (!meetsPower) {
    status = 'insufficient_power';
    warningMessage = bessPowerKw >= requirements.requiredContinuousPowerKw - 1e-6
      ? `Potência disponível para partida (${peakLimitKw.toFixed(1)} kW) insuficiente para o pico crítico (${requirements.requiredPeakPowerKw.toFixed(1)} kW). O cálculo utiliza o limite contínuo, sem presumir sobrecarga transitória.`
      : `Potência do BESS (${bessPowerKw.toFixed(1)} kW) insuficiente para as cargas críticas (${requirements.requiredContinuousPowerKw.toFixed(1)} kW).`;
  } else if (!meetsEnergy) {
    status = 'partially_covered';
    warningMessage = `${product.ports?.length?'Limites individuais das portas CC: ':''}Autonomia de ${effectiveAutonomyHours.toFixed(1)}h abaixo da meta de ${requirements.autonomyHours}h solicitada (${deliverableEnergyKwh.toFixed(1)}/${requirements.requiredEnergyKwh.toFixed(1)} kWh).`;
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
