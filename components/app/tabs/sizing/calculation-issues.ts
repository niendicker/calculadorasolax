import type { ResidentialOptions } from '@/lib/types';
import {
  isGeneratorAtsUnacknowledged,
  isGeneratorPhaseVoltageIncompatible,
  isGeneratorPowerInsufficient,
  isMicrogridPhaseVoltageIncompatible,
  TARIFF_BUSINESS_DAYS_PER_MONTH,
} from '../../helpers';

/** Returns only the first pending stage: general settings, loads, then each resource. */
export function residentialCalculationIssues(options: Omit<ResidentialOptions, 'loads'> & { loads: readonly unknown[] }, peakW: number): string[] {
  const issues: string[] = [];
  const features = options.desiredFeatures;
  const missingSettings = [
    !options.gridType && 'tipo de rede',
    !options.topology && 'topologia da bateria',
    !options.batteryModel && 'modelo da bateria',
  ].filter(Boolean);
  if (missingSettings.length) return [`Configurações gerais: selecione ${missingSettings.join(', ')} em Configurações técnicas.`];
  if (!options.loads.length) return ['Nenhuma carga cadastrada. Adicione ao menos uma carga em Cargas do projeto.'];
  if (features.includes('backup') && !options.operationHours) {
    issues.push('Backup: informe por quanto tempo as cargas devem operar.');
  }
  if (issues.length) return issues;
  if (features.includes('external_ats') && !options.atsBackupAcknowledged) {
    issues.push('Backup Total: confirme a necessidade de uma chave ATS externa.');
  }
  if (issues.length) return issues;
  if (features.includes('microgrid')) {
    if (!options.microgrid?.onGridApparentPowerVA) issues.push('Microrrede: informe a potência nominal AC do inversor on-grid.');
    if (isMicrogridPhaseVoltageIncompatible(features, options.microgrid, options.gridType)) {
      issues.push('Microrrede: ajuste a tensão e as fases do inversor on-grid para corresponder ao tipo de rede.');
    }
  }
  if (issues.length) return issues;
  if (features.includes('external_generator')) {
    if (!options.generator) issues.push('Gerador: informe a potência, a tensão e o número de fases.');
    if (isGeneratorPowerInsufficient(features, options.generator, peakW)) {
      issues.push('Gerador: aumente a potência para atender às cargas e à margem de recarga indicada no recurso.');
    }
    if (isGeneratorAtsUnacknowledged(features, options.generator)) issues.push('Gerador: confirme que ele possui sua própria chave ATS.');
    if (isGeneratorPhaseVoltageIncompatible(features, options.generator, options.gridType)) {
      issues.push('Gerador: ajuste a tensão e as fases para corresponder ao tipo de rede.');
    }
  }
  if (issues.length) return issues;
  if (features.includes('pv')) {
    if (!options.pv?.monthlyConsumptionKwh) issues.push('Fotovoltaico: informe o consumo mensal em kWh.');
    if (!options.pv?.hsp) issues.push('Fotovoltaico: informe as horas de sol pleno (HSP).');
  }
  if (issues.length) return issues;
  if (features.includes('white_tariff')) {
    const tariff = options.whiteTariff;
    const missingFields: string[] = [];
    if (!(tariff && tariff.requiredPowerW > 0)) missingFields.push('potência maior que zero');
    if (!(tariff && (tariff.pontaEnergyWh > 0 || tariff.intermediateEnergyWh > 0))) {
      missingFields.push('consumo na ponta ou no período intermediário');
    }
    if (!(tariff && (tariff.totalMonthlyConsumptionKwh ?? 0) > 0)) missingFields.push('consumo total mensal em kWh');
    const periods = [
      ['pontaTariffPerKwh', 'ponta'],
      ['intermediateTariffPerKwh', 'intermediária'],
      ['foraPontaTariffPerKwh', 'fora de ponta'],
    ] as const;
    for (const [field, label] of periods) {
      if (!(tariff && tariff[field] > 0)) missingFields.push(`tarifa de ${label} maior que zero`);
    }
    if (missingFields.length) return [`Tarifa Branca: informe ${missingFields.join(', ')}.`];
    if (tariff) {
      if (tariff.pontaTariffPerKwh < tariff.foraPontaTariffPerKwh) issues.push('Tarifa Branca: a tarifa de ponta deve ser maior ou igual à tarifa fora de ponta.');
      if (tariff.intermediateTariffPerKwh < tariff.foraPontaTariffPerKwh) issues.push('Tarifa Branca: a tarifa intermediária deve ser maior ou igual à tarifa fora de ponta.');
      const expensiveKwh = ((tariff.pontaEnergyWh + tariff.intermediateEnergyWh) / 1000) * (tariff.businessDaysPerMonth ?? TARIFF_BUSINESS_DAYS_PER_MONTH);
      if (expensiveKwh > (tariff.totalMonthlyConsumptionKwh ?? 0)) issues.push('Tarifa Branca: o consumo mensal na ponta e no período intermediário não pode superar o consumo total mensal.');
    }
  }
  return issues;
}
