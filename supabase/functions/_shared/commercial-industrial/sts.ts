import type { CiBackupConfig, DispatchPoint } from './types.ts';
import type { CiStsContext, CiStsResult, CiStsRule, CiStsSelection } from './sts-types.ts';
import { computeBackupRequirements } from './backup.ts';

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
export function validateStsSelection(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['Configure a seleção de STS.'];
  const s = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (!['installation','backup_bus'].includes(String(s.gridBusScope))) errors.push('STS: informe o barramento atendido.');
  if (!['auto', 'manual'].includes(String(s.mode))) errors.push('Selecione STS automática ou manual.');
  if (s.mode === 'manual' && (typeof s.accessoryId !== 'string' || !s.accessoryId.trim())) errors.push('Selecione o modelo da STS.');
  if (![380, 400].includes(Number(s.lineVoltageV)) || typeof s.lineVoltageV !== 'number') errors.push('STS: informe tensão entre fases de 380 ou 400 V.');
  if (![50, 60].includes(Number(s.frequencyHz)) || typeof s.frequencyHz !== 'number') errors.push('STS: informe frequência de 50 ou 60 Hz.');
  if (!positive(s.powerFactor) || s.powerFactor > 1) errors.push('STS: informe fator de potência maior que zero e até 1.');
  if (typeof s.maxGridPassageKw !== 'number' || !Number.isFinite(s.maxGridPassageKw) || s.maxGridPassageKw < 0) errors.push('STS: informe a máxima potência de passagem pela rede (kW).');
  if (s.gridBusScope === 'backup_bus' && !positive(s.maxGridPassageKw)) errors.push('STS no barramento de backup: declare a máxima passagem, incluindo BESS e FV conectados a ele.');
  return errors;
}
export function isApprovedStsRule(rule: CiStsRule): boolean {
  return [380,400].includes(rule.line_voltage_v) && [50,60].includes(rule.frequency_hz) && rule.active && rule.approval_status === 'approved' && Number.isSafeInteger(rule.max_pcs) && rule.max_pcs > 0 &&
    [rule.reference_document, rule.revision, rule.communication_profile, rule.firmware].every(v => typeof v === 'string' && v.trim().length > 0) &&
    Boolean(rule.pcs_id) !== Boolean(rule.bess_product_id);
}
export function evaluateSts(backup: CiBackupConfig | null | undefined, trace: DispatchPoint[], context: CiStsContext | undefined, moduleCount: number): CiStsResult | undefined {
  if (!backup?.enabled || !backup.sts) return undefined;
  const selection: CiStsSelection = backup.sts;
  const errors = validateStsSelection(selection);
  if (errors.length) throw new Error(errors.join(' '));
  if (!context) throw new Error('O catálogo e as compatibilidades STS precisam ser resolvidos no servidor.');
  const requirements = computeBackupRequirements(backup)!;
  const margin = 1 + backup.safetyMarginPercent / 100;
  const nominalLoadsKw = backup.inputMode === 'detailed'
    ? backup.loads.reduce((sum, load) => sum + load.powerW * load.quantity / 1000, 0) * margin : 0;
  const requiredBackupPowerKw = Math.max(requirements.requiredContinuousPowerKw, requirements.requiredPeakPowerKw, nominalLoadsKw);
  if (!positive(requiredBackupPowerKw)) throw new Error('Informe as cargas de backup antes de selecionar uma STS.');
  // Dedicated bus has no measured load curve. Bound its nominal loads plus
  // the known BESS flow; do not offset current by PV/generator of unknown location.
  const knownBackupBusPassage = trace.reduce((max,p) => Math.max(max, requiredBackupPowerKw / margin + p.chargeKw, p.dischargeKw), 0);
  const simulatedPassage = selection.gridBusScope === 'installation' ? trace.reduce((max, p) => Math.max(max, Math.abs(p.loadKw + p.chargeKw - p.dischargeKw - (p.solarGenerationKw ?? 0) - (p.generatorKw ?? 0))), 0) : knownBackupBusPassage;
  const requiredGridPowerKw = Math.max(selection.maxGridPassageKw, simulatedPassage) * margin;
  const requiredCurrentA = Math.max(requiredBackupPowerKw, requiredGridPowerKw) * 1000 / (Math.sqrt(3) * selection.lineVoltageV * selection.powerFactor);
  const pcsCount = moduleCount * context.target.unitsPerModule;
  if (![requiredCurrentA, pcsCount].every(Number.isFinite) || !Number.isSafeInteger(pcsCount) || pcsCount <= 0) throw new Error('Requisitos elétricos ou quantidade de PCS inválidos para STS.');
  const candidates = context.catalog.specs.flatMap(spec => {
    const current = selection.lineVoltageV === 380 ? spec.rated_current_380v_a : spec.rated_current_400v_a;
    if (!spec.active || !spec.accessoryActive || !positive(current) || !spec.frequency_hz.includes(selection.frequencyHz) || !spec.reference_document?.trim() || !spec.revision?.trim()) return [];
    if (selection.mode === 'manual' && spec.accessory_id !== selection.accessoryId) return [];
    if (current + 1e-6 < requiredCurrentA) return [];
    const rule = context.catalog.rules.filter(rule => rule.accessory_id === spec.accessory_id && isApprovedStsRule(rule) &&
      (context.target.pcsId ? rule.pcs_id === context.target.pcsId : rule.bess_product_id === context.target.bessProductId) && pcsCount <= rule.max_pcs && rule.line_voltage_v === selection.lineVoltageV && rule.frequency_hz === selection.frequencyHz).sort((a,b) => a.id.localeCompare(b.id))[0];
    return rule ? [{spec, rule, current}] : [];
  }).sort((a,b) => a.current - b.current || a.spec.accessory_id.localeCompare(b.spec.accessory_id));
  const base = { gridBusScope: selection.gridBusScope, requiredCurrentA, requiredBackupPowerKw, requiredGridPowerKw, lineVoltageV: selection.lineVoltageV, powerFactor: selection.powerFactor, pcsCount };
  const chosen = candidates[0];
  if (!chosen) return {...base, status: 'no_match', message: 'Nenhuma STS ativa com compatibilidade aprovada atende à corrente, tensão, frequência e quantidade de PCS deste cenário. Sem sobrecarga presumida. CAPEX sem STS: composição incompleta, não recomendada.'};
  if (chosen.spec.accessory_id === context.controllerAccessoryId) throw new Error('O mesmo acessório não pode ser cobrado como STS e controlador. Revise a compatibilidade.');
  const price = context.prices[chosen.spec.accessory_id];
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) throw new Error(`Defina o preço de ${chosen.spec.model} no seu Portfólio antes de calcular.`);
  return {...base, status: 'selected', message: 'STS selecionada pelos limites nominais contínuos. Transferência de 0 ms não é garantida por este cálculo.', selected: {spec: chosen.spec, compatibility: chosen.rule, quantity: 1, unitPriceBrl: price, totalBrl: price}};
}
