import {modularFixture} from './modular.test-fixtures';
export function aelioPortFixture(){
 const catalog=modularFixture();
 Object.assign(catalog.pcs[0],{model:'AELIO sintético 60',ratedPowerKw:60,maxBatteryQty:1,batteryPorts:2,maxCurrentPerPortA:80,charge_power_kw:60,discharge_power_kw:60,charge_current_a:80,discharge_current_a:80,port_charge_current_a:80,port_discharge_current_a:80,voltageMinV:160,voltageMaxV:820,chargeEfficiencyPercent:98.5,dischargeEfficiencyPercent:97});
 Object.assign(catalog.batteries[0],{model:'HR140 sintética',capacityKwh:14.3,maxAssociationQty:14,maxCurrentA:100,voltageMinV:40,voltageMaxV:58.4,charge_power_kw:5,discharge_power_kw:5,charge_current_a:100,discharge_current_a:100,socMinPercent:10,soc_max_percent:100,roundTripEfficiencyPercent:95});
 Object.assign(catalog.rules[0],{min_series:7,max_series:14,min_ports_per_pcs:1,max_ports_per_pcs:2,min_parallel_strings:1,max_parallel_strings:1,min_pcs:1,max_pcs:1});
 return catalog;
}
