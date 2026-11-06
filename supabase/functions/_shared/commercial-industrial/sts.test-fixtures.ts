import type { CiBackupConfig } from './types';
import type { CiStsContext } from './sts-types';
import { modularFixture } from './modular.test-fixtures';

export function stsFixture(): CiStsContext {
  return {target:{pcsId:modularFixture().pcs[0].inverter_id,unitsPerModule:1},prices:{small:5000,large:9000},catalog:{
    specs:[{accessory_id:'small',model:'ZERO-125 teste',active:true,accessoryActive:true,rated_current_380v_a:189.4,rated_current_400v_a:181.2,frequency_hz:[50,60],ems_included:true,reference_document:'Ficha teste',revision:'V1'}, {accessory_id:'large',model:'ZERO-250 teste',active:true,accessoryActive:true,rated_current_380v_a:378.8,rated_current_400v_a:362.3,frequency_hz:[50,60],ems_included:true,reference_document:'Ficha teste',revision:'V1'}],
    rules:['small','large'].map(id=>({id:`rule-${id}`,accessory_id:id,pcs_id:modularFixture().pcs[0].inverter_id,bess_product_id:null,max_pcs:2,line_voltage_v:380,frequency_hz:60,active:true,approval_status:'approved' as const,reference_document:'Compatibilidade teste',revision:'1',communication_profile:'EMS teste',firmware:'PCS teste'}))
  }};
}
export function stsBackup(): CiBackupConfig {
  return {enabled:true,inputMode:'simple',targetPowerKw:80,targetPeakPowerKw:80,autonomyHours:1,loads:[],safetyMarginPercent:10,sts:{mode:'auto',gridBusScope:'installation',accessoryId:null,lineVoltageV:380,frequencyHz:60,powerFactor:0.9,maxGridPassageKw:80}};
}
