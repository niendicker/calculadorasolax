import { computeBackupRequirements } from './backup.ts';
import { runDispatch } from './dispatch.ts';
import type { CommercialIndustrialOptions, DispatchPoint } from './types.ts';
import type { CiApplication } from './grouped-solutions.ts';

/** Necessary lower bounds for a database search; full dispatch still decides actual adequacy. */
export function deriveCiTechnicalRequirements(options:CommercialIndustrialOptions,preparedTrace?:DispatchPoint[]){
  if(!options.loadCurve||!options.tariff)throw new Error('Configure a curva de carga e a tarifa antes de dimensionar os requisitos.');
  const trace=preparedTrace??runDispatch({curve:options.loadCurve,bess:{totalPowerKw:0,totalCapacityKwh:0,socMinPercent:0,socMaxPercent:0,efficiencyPercent:100},strategy:'BASE',tariffWindow:{peakStart:options.tariff.peakStart,peakEnd:options.tariff.peakEnd},peakShavingTargetKw:null,contractedDemandKw:options.tariff.contractedDemandKw,solar:options.solar,generator:options.generator});
  const coverage=options.loadShiftingCoveragePercent??100;
  if(!Number.isFinite(coverage)||coverage<0||coverage>100)throw new Error('A cobertura de consumo na ponta deve estar entre 0 e 100%.');
  let power=0,energy=0,windowEnergy=0;
  const intervalHours=options.loadCurve.resolutionMinutes/60;
  const limits=trace.map(point=>{
    let target:number|null=null;
    if(options.strategy==='PEAK_SHAVING'||options.strategy==='HYBRID')target=options.tariff!.contractedDemandKw;
    if((options.strategy==='LOAD_SHIFTING'||options.strategy==='HYBRID')&&point.tariffPeriod==='peak')target=Math.min(target??Infinity,point.gridImportKw*(1-coverage/100));
    const deficit=target===null?0:Math.max(0,point.gridImportKw-target);
    power=Math.max(power,deficit);windowEnergy+=deficit*intervalHours;energy=Math.max(energy,windowEnergy);
    // A possible charging opportunity ends a lower-bound energy window. Its actual
    // duration, power and losses remain constraints of the candidate simulation.
    if((point.tariffPeriod==='offPeak'&&point.gridImportKw<options.tariff!.contractedDemandKw-1e-6)||(options.solar?.enabled&&options.solar.prioritizeBessCharging&&(point.solarGenerationKw??0)>point.loadKw))windowEnergy=0;
    return target;
  });
  const backup=computeBackupRequirements(options.backup,options.loadCurve);
  const application:CiApplication[]=options.strategy==='PEAK_SHAVING'?['peak_shaving']:options.strategy==='LOAD_SHIFTING'?['load_shifting']:options.strategy==='HYBRID'?['peak_shaving','load_shifting']:[];
  if(options.backup?.enabled)application.push('backup');
  if(options.solar?.enabled)application.push('solar');
  if(options.generator?.enabled)application.push('generator');
  const minimum=options.bessSystem?.kind==='automatic'?options.bessSystem:null;
  return {minPowerKw:Math.max(minimum?.minPowerKw??0,power,backup?.requiredContinuousPowerKw??0,backup?.requiredPeakPowerKw??0),minEnergyKwh:Math.max(minimum?.minEnergyKwh??0,energy+(backup?.requiredEnergyKwh??0)),operatingEnergyAcKwh:energy,backupEnergyAcKwh:backup?.requiredEnergyKwh??0,coveragePercent:coverage,applications:application,gridImportLimitsKw:limits};
}
