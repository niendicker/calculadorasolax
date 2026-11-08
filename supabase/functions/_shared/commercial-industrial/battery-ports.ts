import type { CiRuntimePort, CiPortFlow } from './types.ts';

export interface CiPortState extends CiRuntimePort { socKwh:number }

export function createPortStates(ports:CiRuntimePort[],socPercent:number):CiPortState[]{
  return ports.map(port=>({...port,socKwh:port.nominalEnergyKwh*socPercent/100}));
}

/** Bounded water filling. Energy/headroom weights preserve the less charged
 * banks while respecting every port and its parent PCS. */
function allocate(total:number,caps:number[],weights:number[]):number[]{
  const values=caps.map(()=>0);
  let remaining=Math.min(Math.max(0,total),caps.reduce((sum,cap)=>sum+cap,0));
  for(let round=0;round<=caps.length&&remaining>1e-9;round++){
    const active=caps.map((cap,i)=>cap-values[i]>1e-9?i:-1).filter(i=>i>=0);
    const sumWeights=active.reduce((sum,i)=>sum+Math.max(0,weights[i]),0);
    if(!active.length)break;
    let distributed=0;
    for(const i of active){
      const share=remaining*(sumWeights>0?Math.max(0,weights[i])/sumWeights:1/active.length);
      const delta=Math.min(caps[i]-values[i],share);
      values[i]+=delta;distributed+=delta;
    }
    if(distributed<1e-12)break;
    remaining-=distributed;
  }
  return values;
}

export function portPowerCapacity(states:CiPortState[],direction:'charge'|'discharge',durationHours:number,socMinPercent:number,socMaxPercent:number,efficiency:number):number {
  return portGroups(states,direction,durationHours,socMinPercent,socMaxPercent,efficiency).reduce((sum,group)=>sum+group.capacity,0);
}

function portGroups(states:CiPortState[],direction:'charge'|'discharge',durationHours:number,min:number,max:number,eta:number){
  const units=[...new Set(states.map(port=>port.unit))];
  return units.map(unit=>{
    const indices=states.map((port,i)=>port.unit===unit?i:-1).filter(i=>i>=0);
    const weights=indices.map(i=>direction==='charge'?Math.max(0,states[i].nominalEnergyKwh*max/100-states[i].socKwh):Math.max(0,states[i].socKwh-states[i].nominalEnergyKwh*min/100));
    const caps=indices.map((i,j)=>Math.min(direction==='charge'?states[i].chargePowerKw:states[i].dischargePowerKw,direction==='charge'?weights[j]/(durationHours*eta):weights[j]*eta/durationHours));
    const first=states[indices[0]];
    const capacity=Math.min(caps.reduce((sum,p)=>sum+p,0),direction==='charge'?first.unitChargePowerKw:first.unitDischargePowerKw);
    return {indices,weights,caps,capacity};
  });
}

export function dispatchPorts(states:CiPortState[],direction:'charge'|'discharge',requestedPowerKw:number,durationHours:number,socMinPercent:number,socMaxPercent:number,efficiency:number):{powerKw:number;flows:CiPortFlow[]}{
  const groups=portGroups(states,direction,durationHours,socMinPercent,socMaxPercent,efficiency);
  const unitPower=allocate(requestedPowerKw,groups.map(g=>g.capacity),groups.map(g=>g.weights.reduce((sum,e)=>sum+e,0)));
  const flows:CiPortFlow[]=states.map(p=>({unit:p.unit,port:p.port,chargeKw:0,dischargeKw:0,socKwh:p.socKwh}));
  let powerKw=0;
  groups.forEach((group,index)=>{
    const powers=allocate(unitPower[index],group.caps,group.weights);
    group.indices.forEach((i,j)=>{
      const power=powers[j];powerKw+=power;
      states[i].socKwh+=direction==='charge'?power*durationHours*efficiency:-power*durationHours/efficiency;
      states[i].socKwh=Math.max(states[i].nominalEnergyKwh*socMinPercent/100,Math.min(states[i].nominalEnergyKwh*socMaxPercent/100,states[i].socKwh));
      flows[i]={...flows[i],[direction==='charge'?'chargeKw':'dischargeKw']:power,socKwh:states[i].socKwh};
    });
  });
  return {powerKw,flows};
}

/** Feasibility and observed duration of an islanded load profile. Each block
 * is supplied at constant power from independently bounded banks. */
export function portBackupDuration(ports:CiRuntimePort[],initialSoc:number,minSoc:number,maxSoc:number,eta:number,globalPowerKw:number,profile:{powerKw:number;durationHours:number}[]):{complete:boolean;hours:number}{
  const states=createPortStates(ports,initialSoc);
  let hours=0;
  for(const block of profile){
    if(block.powerKw<=0){hours+=block.durationHours;continue;}
    if(block.powerKw>globalPowerKw+1e-6)return {complete:false,hours};
    const before=states.map(port=>({...port}));
    const delivered=dispatchPorts(states,'discharge',block.powerKw,block.durationHours,minSoc,maxSoc,eta);
    if(delivered.powerKw+1e-6>=block.powerKw){hours+=block.durationHours;continue;}
    let low=0,high=block.durationHours;
    for(let i=0;i<28;i++){
      const mid=(low+high)/2;
      const trial=dispatchPorts(before.map(port=>({...port})),'discharge',block.powerKw,mid,minSoc,maxSoc,eta);
      if(trial.powerKw+1e-6>=block.powerKw)low=mid;else high=mid;
    }
    return {complete:false,hours:hours+low};
  }
  return {complete:true,hours};
}

export function repeatRuntimePorts(ports:CiRuntimePort[],count:number):CiRuntimePort[]{
  const units=Math.max(0,...ports.map(port=>port.unit));
  return Array.from({length:count},(_,copy)=>ports.map(port=>({...port,unit:port.unit+copy*units}))).flat();
}
