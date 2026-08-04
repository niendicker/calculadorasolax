import { removeAccents } from '../utils';

export type TariffPeriod = 'peak' | 'intermediate' | 'offPeak' | 'conventional';

function normalizeText(text: string): string {
  return removeAccents(text)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePeriodName(periodName: string): TariffPeriod | null {
  const normalized = normalizeText(periodName);

  if (normalized === 'ponta') return 'peak';
  if (normalized === 'intermediaria' || normalized === 'intermediario') return 'intermediate';
  if (normalized === 'fora ponta' || normalized === 'fora de ponta' || normalized === 'fora-ponta' || normalized === 'fora-de-ponta') return 'offPeak';
  if (normalized === 'convencional') return 'conventional';

  return null;
}

export function normalizeNumber(value: string | number): number {
  if (typeof value === 'number') return value;

  const cleaned = value.replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(cleaned);

  return Number.isNaN(num) ? 0 : num;
}

export function normalizeDistributorName(name: string): string {
  return normalizeText(name);
}

export function convertMwhToKwh(valueInMwh: number): number {
  return valueInMwh / 1000;
}

export function normalizeUnit(value: number, unit: string): { value: number; unit: string } {
  const cleanUnit = unit.trim().toLowerCase().replace(/\s+/g, '');

  if (cleanUnit === 'r$/mwh') {
    return {
      value: convertMwhToKwh(value),
      unit: 'r$/kwh',
    };
  }

  return { value, unit: cleanUnit };
}
