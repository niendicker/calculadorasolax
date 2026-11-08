import type {CiGroupedSolution} from '@/supabase/functions/_shared/commercial-industrial/grouped-solutions';

export interface CiCabinetModelOption {productId:string;model:string;voltages:(220|380)[]}
export interface CiAssemblyModelOption {pcsId:string;pcsModel:string;batteryId:string;batteryModel:string;voltages:(220|380)[]}

/** Only complete published solutions supply selectable model pairs. */
export function buildCiModelOptions(solutions:CiGroupedSolution[]){
  const cabinets=new Map<string,CiCabinetModelOption>();
  const assemblies=new Map<string,CiAssemblyModelOption>();
  const merge=(a:(220|380)[],b:(220|380)[])=>[...new Set([...a,...b])].sort((x,y)=>x-y);
  for(const solution of solutions){
    const voltages=solution.ac.lineVoltagesV??[];
    if(solution.source.kind==='cabinet'){
      const product=solution.components.find(c=>c.productType==='ci_bess');
      if(!product)continue;
      cabinets.set(product.productId,{productId:product.productId,model:product.model,voltages:merge(cabinets.get(product.productId)?.voltages??[],voltages)});
    }else{
      const pcs=solution.components.find(c=>c.productType==='ci_pcs'),battery=solution.components.find(c=>c.productType==='ci_battery');
      if(!pcs||!battery)continue;
      const key=`${pcs.productId}:${battery.productId}`;
      assemblies.set(key,{pcsId:pcs.productId,pcsModel:pcs.model,batteryId:battery.productId,batteryModel:battery.model,voltages:merge(assemblies.get(key)?.voltages??[],voltages)});
    }
  }
  return {cabinets:[...cabinets.values()].sort((a,b)=>a.model.localeCompare(b.model)),assemblies:[...assemblies.values()].sort((a,b)=>a.pcsModel.localeCompare(b.pcsModel)||a.batteryModel.localeCompare(b.batteryModel))};
}

export function ciModelVoltageLabel(voltages:(220|380)[],selected?:220|380){
  if(!voltages.length)return 'tensão não documentada; atualize o cadastro e a geração';
  return `${voltages.join(' / ')} V${selected&&!voltages.includes(selected)?' · incompatível com a tensão selecionada':''}`;
}
