import type {CiGroupedSolution,CiApplication} from './grouped-solutions.ts';
import type {CiTechnicalIssue,ScenarioCandidate} from './types.ts';

export interface CiSelectionRequirements {minPowerKw:number;minEnergyKwh:number;applications:CiApplication[]}

/** Financial values never participate in this ordering. */
export function orderCiTechnicalSolutions(solutions:CiGroupedSolution[]):CiGroupedSolution[]{
  return [...solutions].sort((a,b)=>a.counts.units-b.counts.units||a.storage.nominalEnergyKwh-b.storage.nominalEnergyKwh||a.key.localeCompare(b.key));
}

export function meetsCiStaticRequirements(solution:CiGroupedSolution,requirements:CiSelectionRequirements):boolean{
  return requirements.applications.every(app=>solution.applications.includes(app))&&solution.ac.dischargePowerKw+1e-6>=requirements.minPowerKw&&solution.storage.usableEnergyKwh+1e-6>=requirements.minEnergyKwh;
}

/** Report only failures proven over the complete eligible set, never over a
 * single rejected arrangement. Individual maxima do not prove joint feasibility. */
export function diagnoseCiSolutionFailure(solutions:CiGroupedSolution[],evaluated:ScenarioCandidate[],requirements:CiSelectionRequirements,lineVoltageV?:220|380):CiTechnicalIssue[]{
  if(!solutions.length)return [{code:'catalog',message:'Não há soluções na geração atual para os modelos selecionados. Peça ao administrador para conferir as fichas, as compatibilidades aprovadas e gerar novamente as soluções.'}];
  const voltage=lineVoltageV?solutions.filter(s=>s.ac.lineVoltagesV?.includes(lineVoltageV)):solutions;
  if(!voltage.length)return [{code:'voltage',message:`Nenhuma solução dos modelos selecionados possui operação CA entre fases aprovada em ${lineVoltageV} V. Confira a tensão documentada no cadastro e gere novamente as soluções.`,required:lineVoltageV,unit:'V'}];
  const approved=voltage.filter(s=>requirements.applications.every(app=>s.applications.includes(app)));
  if(!approved.length){
    const labels:Record<CiApplication,string>={peak_shaving:'Peak Shaving',load_shifting:'Load Shifting',backup:'backup',solar:'integração FV',generator:'integração com gerador'};
    const missing=requirements.applications.filter(app=>!voltage.some(s=>s.applications.includes(app)));
    return missing.length?missing.map(app=>({code:'application' as const,message:`Aplicação sem aprovação: nenhuma solução dos modelos selecionados está aprovada para ${labels[app]} em ${lineVoltageV??'sua tensão de operação'}${lineVoltageV?' V':''}.`})):[{code:'combined',message:'As aplicações possuem aprovações isoladas, mas nenhuma solução está aprovada para todas as aplicações do projeto em conjunto.'}];
  }
  const issues:CiTechnicalIssue[]=[];
  const power=Math.max(...approved.map(s=>s.ac.dischargePowerKw));
  const energy=Math.max(...approved.map(s=>s.storage.usableEnergyKwh));
  const format=(n:number)=>n.toLocaleString('pt-BR',{maximumFractionDigits:2});
  if(power+1e-6<requirements.minPowerKw)issues.push({code:'power',message:`Potência insuficiente: o projeto exige ${format(requirements.minPowerKw)} kW; os modelos selecionados permitem até ${format(power)} kW nas configurações aprovadas.`,required:requirements.minPowerKw,available:power,unit:'kW'});
  if(energy+1e-6<requirements.minEnergyKwh)issues.push({code:'energy',message:`Energia insuficiente: o projeto exige pelo menos ${format(requirements.minEnergyKwh)} kWh úteis; as configurações aprovadas oferecem até ${format(energy)} kWh úteis.`,required:requirements.minEnergyKwh,available:energy,unit:'kWh'});
  if(issues.length)return issues;
  if(!approved.some(s=>meetsCiStaticRequirements(s,requirements)))return [{code:'combined',message:'Potência e energia são suficientes em configurações distintas, mas nenhuma configuração aprovada atende aos dois requisitos ao mesmo tempo.'}];
  if(evaluated.length){
    if(evaluated.every(c=>c.technicalChecks?.backup===false))issues.push({code:'backup',message:'Backup não atendido: nenhuma configuração elegível sustenta a carga crítica durante todo o intervalo solicitado, respeitando potência, energia e limites de cada banco.'});
    if(evaluated.every(c=>c.technicalChecks?.transfer===false))issues.push({code:'transfer',message:'Transferência não atendida: nenhuma configuração elegível possui uma STS que atenda aos limites elétricos e à compatibilidade exigidos pelo projeto.'});
    if(evaluated.every(c=>c.technicalChecks?.accessories===false))issues.push({code:'accessories',message:'Acessórios não atendidos: as regras obrigatórias de acessórios impedem o atendimento de todas as configurações elegíveis. Revise as regras e os acessórios selecionados.'});
    if(evaluated.every(c=>c.technicalChecks?.dispatch===false||c.technicalChecks?.demand===false))issues.push({code:'dispatch',message:'Despacho não atendido: nenhuma configuração elegível sustenta a cobertura de consumo na ponta e o limite de demanda solicitados ao longo da curva, respeitando a recarga e a reserva de backup.'});
  }
  return issues.length?issues:[{code:'combined',message:'Nenhuma configuração atende a todos os requisitos técnicos simultaneamente. Os limites isolados de potência e energia não garantem o atendimento conjunto da curva, estratégia, backup, transferência e acessórios.'}];
}
